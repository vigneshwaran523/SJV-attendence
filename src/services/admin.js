import {
  collection,
  addDoc,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";

export async function getAdminRoster() {
  const [workersSnapshot, usersSnapshot] = await Promise.all([
    getDocs(collection(db, "workers")),
    getDocs(collection(db, "users")),
  ]);

  const workers = workersSnapshot.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  }));
  const teamLeaders = usersSnapshot.docs
    .map((item) => ({ uid: item.id, ...item.data() }))
    .filter((user) => ["teamleader", "teamLeader"].includes(user.role));

  return { workers, teamLeaders };
}

export async function createWorker({ id, name, role, rate, site, teamLeaderEmployeeId }) {
  const workerId = String(id || "").trim().toUpperCase();
  const cleanName = String(name || "").trim();
  const cleanLeaderId = String(teamLeaderEmployeeId || "").trim().toUpperCase();
  const dailyRate = Number(rate);

  if (!/^[A-Z0-9_-]+$/.test(workerId)) {
    throw new Error("Worker ID can contain letters, numbers, hyphens, and underscores.");
  }
  if (!cleanName || !cleanLeaderId || !Number.isFinite(dailyRate) || dailyRate < 0) {
    throw new Error("Enter the worker name, daily rate, and assigned team leader.");
  }

  const workerRef = doc(db, "workers", workerId);
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(workerRef);
    if (existing.exists()) {
      throw new Error(`Labour ID ${workerId} already exists.`);
    }
    transaction.set(workerRef, {
      name: cleanName,
      role: String(role || "Worker").trim() || "Worker",
      rate: dailyRate,
      site: String(site || "").trim(),
      teamLeaderEmployeeId: cleanLeaderId,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function updateWorker(workerId, changes) {
  const allowed = {};
  if (typeof changes.active === "boolean") allowed.active = changes.active;
  if (typeof changes.teamLeaderEmployeeId === "string") {
    allowed.teamLeaderEmployeeId = changes.teamLeaderEmployeeId.trim().toUpperCase();
  }
  if (Object.keys(allowed).length === 0) return;
  allowed.updatedAt = serverTimestamp();
  await updateDoc(doc(db, "workers", workerId), allowed);
}

export async function updateTeamLeaderStatus(uid, status) {
  if (!["active", "disabled"].includes(status)) {
    throw new Error("Choose a valid team leader status.");
  }
  await updateDoc(doc(db, "users", uid), { status });
}

export async function requestWorkerRemoval(worker, leader) {
  return addDoc(collection(db, "employeeRemovalRequests"), {
    employeeId: worker.id,
    employeeName: worker.name || "",
    teamLeaderId: String(leader.employeeId || "").trim().toUpperCase(),
    teamLeaderName: leader.name || "",
    status: "pending",
    requestedAt: serverTimestamp(),
  });
}

export async function getEmployeeRemovalRequests() {
  const snapshot = await getDocs(collection(db, "employeeRemovalRequests"));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

export async function decideEmployeeRemoval(request, status) {
  if (!["approved", "rejected"].includes(status)) throw new Error("Choose approve or reject.");
  const requestRef = doc(db, "employeeRemovalRequests", request.id);
  await runTransaction(db, async transaction => {
    const workerRef = doc(db, "workers", request.employeeId);
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists() || requestSnapshot.data().status !== "pending") throw new Error("This request has already been reviewed.");
    if (status === "approved") transaction.update(workerRef, { active: false, updatedAt: serverTimestamp() });
    transaction.update(requestRef, { status, reviewedAt: serverTimestamp() });
  });
}
