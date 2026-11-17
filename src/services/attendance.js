import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "./firebase";

// Keep IDs compatible with the existing employeeId_date convention.
export function attendanceId(employeeId, date) {
  return `${String(employeeId).trim()}_${String(date).trim()}`.replace(
    /[^a-zA-Z0-9_-]/g,
    "_",
  );
}

export async function getTeamWorkers(employeeId) {
  const normalizedLeaderId = String(employeeId || "").trim();
  if (!normalizedLeaderId) {
    throw new Error("Your team leader employee ID is missing. Sign in again.");
  }

  const snapshot = await getDocs(
    query(
      collection(db, "workers"),
      where("teamLeaderEmployeeId", "==", normalizedLeaderId),
    ),
  );

  return snapshot.docs
    .map((workerDoc) => {
      const data = workerDoc.data();
      const name = String(data.name || "").trim();
      return {
        id: workerDoc.id,
        name,
        role: String(data.role || "Worker"),
        rate: Number(data.rate) || 0,
        site: String(data.site || ""),
        active: data.active !== false,
        status: "Present",
        ot: 0,
        avatar: name
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part[0])
          .join("")
          .toUpperCase(),
      };
    })
    .filter((worker) => worker.active);
}

export async function getAttendanceForDate(employeeId, date) {
  const snapshot = await getDoc(
    doc(db, "attendance", attendanceId(employeeId, date)),
  );
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function submitAttendance(data) {
  const employeeId = String(data?.employeeId || "").trim();
  const date = String(data?.date || "").trim();
  const recordId = attendanceId(employeeId, date);
  const recordRef = doc(db, "attendance", recordId);
  const submittedAt = serverTimestamp();
  const payload = {
    employeeId,
    employeeName: String(data?.employeeName || "Team Leader").trim(),
    site: "Multiple sites",
    date,
    status: "Submitted",
    reviewStatus: "Pending",
    payrollStatus: "Unverified",
    payrollVerifiedAt: null,
    payrollVerifiedBy: null,
    editAllowed: false,
    overtimeCount: Number(data?.overtimeCount) || 0,
    totalPayment: Number(data?.totalPayment) || 0,
    siteTotals: Array.isArray(data?.siteTotals) ? data.siteTotals : [],
    workers: Array.isArray(data?.workers) ? data.workers : [],
    note: String(data?.note || "").trim(),
    rosterSummary: String(data?.rosterSummary || ""),
    submittedAt,
    updatedAt: submittedAt,
  };

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(recordRef);
    if (existing.exists()) {
      const current = existing.data();
      if (current.employeeId !== employeeId || current.date !== date || current.editAllowed !== true) {
        throw new Error("Attendance is already submitted and locked for this date.");
      }
      transaction.set(recordRef, {
        ...payload,
        createdAt: current.createdAt || submittedAt,
      });
    } else {
      transaction.set(recordRef, {
        ...payload,
        createdAt: submittedAt,
      });
    }
  });
  return recordId;
}

export async function requestAttendanceEdit({
  attendanceId: recordId,
  employeeId,
  employeeName,
  date,
  reason,
}) {
  const cleanReason = String(reason || "Correction required").trim();
  if (!recordId || !employeeId || !date || !cleanReason) {
    throw new Error("Add a reason before requesting an attendance edit.");
  }
  return addDoc(collection(db, "attendanceEditRequests"), {
    attendanceId: recordId,
    employeeId: String(employeeId).trim(),
    employeeName: String(employeeName || ""),
    date,
    reason: cleanReason,
    status: "pending",
    requestedAt: serverTimestamp(),
  });
}

export async function getMyEditRequests(employeeId) {
  const snapshot = await getDocs(
    query(
      collection(db, "attendanceEditRequests"),
      where("employeeId", "==", String(employeeId).trim()),
    ),
  );
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function getMyAttendance(employeeId) {
  const snapshot = await getDocs(
    query(
      collection(db, "attendance"),
      where("employeeId", "==", String(employeeId).trim()),
      orderBy("date", "desc"),
    ),
  );
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function getAllAttendance() {
  const snapshot = await getDocs(
    query(collection(db, "attendance"), orderBy("date", "desc")),
  );
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function getAllEditRequests() {
  const snapshot = await getDocs(
    query(
      collection(db, "attendanceEditRequests"),
      orderBy("requestedAt", "desc"),
    ),
  );
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function decideEditRequest(request) {
  if (!["approved", "rejected"].includes(request?.status)) {
    throw new Error("Invalid edit request decision.");
  }
  const requestRef = doc(db, "attendanceEditRequests", request.id);

  if (request.status === "approved") {
    await updateDoc(doc(db, "attendance", request.attendanceId), {
      editAllowed: true,
      editGrantedAt: serverTimestamp(),
    });
  }

  await updateDoc(requestRef, {
    status: request.status,
    decidedAt: serverTimestamp(),
  });
}

export async function updateAttendanceReview(recordId, status) {
  if (!["Approved", "Rejected"].includes(status)) {
    throw new Error("Invalid attendance review status.");
  }
  const recordRef = doc(db, "attendance", recordId);
  const snapshot = await getDoc(recordRef);
  if (!snapshot.exists()) throw new Error("Attendance record no longer exists.");
  const record = snapshot.data();
  const update = {
    reviewStatus: status,
    reviewedAt: serverTimestamp(),
    payrollStatus: "Unverified",
  };

  if (status === "Approved") {
    const workerSnapshot = await getDocs(collection(db, "workers"));
    const teamWorkers = new Map(
      workerSnapshot.docs
        .filter((worker) => worker.data().teamLeaderEmployeeId === record.employeeId)
        .map((worker) => [worker.id, { id: worker.id, ...worker.data() }]),
    );
    const seen = new Set();
    let overtimeCount = 0;
    let totalPayment = 0;
    const siteTotals = new Map();
    const workers = (Array.isArray(record.workers) ? record.workers : []).map((submitted) => {
      const id = String(submitted.id || "");
      const worker = teamWorkers.get(id);
      if (!worker || seen.has(id)) {
        throw new Error(`Cannot verify payroll: worker ${id || "(missing ID)"} is missing, duplicated, or assigned to another team.`);
      }
      seen.add(id);
      const statusValue = String(submitted.status || "");
      if (!["Present", "Half Day", "Absent"].includes(statusValue)) {
        throw new Error(`Cannot verify payroll: invalid attendance status for ${worker.name || id}.`);
      }
      const ot = Number(submitted.ot || 0);
      if (!Number.isInteger(ot) || ot < 0 || ot > 20 || (statusValue !== "Present" && ot !== 0)) {
        throw new Error(`Cannot verify payroll: invalid overtime for ${worker.name || id}.`);
      }
      const rate = Number(worker.rate);
      if (!Number.isFinite(rate) || rate < 0) {
        throw new Error(`Cannot verify payroll: stored rate for ${worker.name || id} is invalid.`);
      }
      const attendanceDays = statusValue === "Present" ? 1 : statusValue === "Half Day" ? 0.5 : 0;
      const payment = Math.round((rate * (attendanceDays + ot * 0.5) + Number.EPSILON) * 100) / 100;
      const site = String(submitted.site || worker.site || "Unassigned");
      const siteTotal = siteTotals.get(site) || { site, amount: 0, workers: 0 };
      siteTotal.amount = Math.round((siteTotal.amount + payment + Number.EPSILON) * 100) / 100;
      siteTotal.workers += 1;
      siteTotals.set(site, siteTotal);
      overtimeCount += ot;
      totalPayment = Math.round((totalPayment + payment + Number.EPSILON) * 100) / 100;
      return {
        id,
        name: String(worker.name || "").trim(),
        role: String(worker.role || "Worker").trim(),
        rate,
        site,
        status: statusValue,
        ot,
        attendanceDays,
        payment,
      };
    });
    update.payrollStatus = "Verified";
    update.payrollVerifiedAt = serverTimestamp();
    update.payrollVerifiedBy = auth.currentUser?.uid || "";
    update.totalPayment = totalPayment;
    update.overtimeCount = overtimeCount;
    update.siteTotals = [...siteTotals.values()];
    update.workers = workers;
  }

  await updateDoc(recordRef, update);
}
