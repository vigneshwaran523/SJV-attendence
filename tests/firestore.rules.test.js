import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

const projectId = "demo-constructpulse-rules";
const date = "2026-11-12";
let testEnv;

before(async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { host: "127.0.0.1", port: 8080, rules },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "users/leader-a"), {
        employeeId: "TL-A",
        role: "teamleader",
        status: "active",
      }),
      setDoc(doc(db, "users/leader-b"), {
        employeeId: "TL-B",
        role: "teamLeader",
        status: "active",
      }),
      setDoc(doc(db, "users/admin-a"), {
        employeeId: "ADMIN-A",
        role: "admin",
        status: "active",
      }),
      setDoc(doc(db, "workers/worker-a"), {
        name: "Test Worker A",
        rate: 100,
        active: true,
        teamLeaderEmployeeId: "TL-A",
      }),
      setDoc(doc(db, "workers/worker-b"), {
        name: "Test Worker B",
        rate: 200,
        active: true,
        teamLeaderEmployeeId: "TL-B",
      }),
      setDoc(doc(db, `attendance/TL-A_${date}`), {
        employeeId: "TL-A",
        date,
        status: "Submitted",
        reviewStatus: "Approved",
        payrollStatus: "Unverified",
        payrollVerifiedAt: null,
        payrollVerifiedBy: null,
        editAllowed: true,
        totalPayment: 100,
        workers: [{ id: "worker-a", status: "Present", rate: 100, payment: 100 }],
      }),
      setDoc(doc(db, `attendance/TL-B_${date}`), {
        employeeId: "TL-B",
        date,
        status: "Submitted",
        reviewStatus: "Pending",
        payrollStatus: "Unverified",
        payrollVerifiedAt: null,
        payrollVerifiedBy: null,
        editAllowed: false,
        totalPayment: 200,
        workers: [{ id: "worker-b", status: "Present", rate: 200, payment: 200 }],
      }),
    ]);
  });
});

const leaderDb = (uid = "leader-a") => testEnv.authenticatedContext(uid).firestore();
const adminDb = () => testEnv.authenticatedContext("admin-a").firestore();
const validAttendance = (employeeId = "TL-A", attendanceDate = date) => ({
  employeeId,
  employeeName: "Test Leader",
  site: "Multiple sites",
  date: attendanceDate,
  status: "Submitted",
  reviewStatus: "Pending",
  payrollStatus: "Unverified",
  payrollVerifiedAt: null,
  payrollVerifiedBy: null,
  editAllowed: false,
  overtimeCount: 0,
  totalPayment: 100,
  siteTotals: [{ site: "Test Site", amount: 100, workers: 1 }],
  workers: [{ id: "worker-a", status: "Present", rate: 100, payment: 100 }],
  note: "",
  rosterSummary: "Submitted attendance",
  createdAt: serverTimestamp(),
  submittedAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

test("leaders can read their roster but not another team's roster", async () => {
  const db = leaderDb();
  await assertSucceeds(getDoc(doc(db, "workers/worker-a")));
  await assertFails(getDoc(doc(db, "workers/worker-b")));
});

test("leaders cannot list all workers or read all user profiles", async () => {
  const db = leaderDb();
  await assertFails(getDocs(collection(db, "workers")));
  await assertFails(getDocs(collection(db, "users")));
});

test("leaders cannot create or change worker records", async () => {
  const db = leaderDb();
  await assertFails(setDoc(doc(db, "workers/new-worker"), {
    name: "Unauthorized",
    teamLeaderEmployeeId: "TL-A",
  }));
  await assertFails(updateDoc(doc(db, "workers/worker-a"), { rate: 999 }));
});

test("leaders may update only their own login and session fields", async () => {
  const db = leaderDb();
  await assertSucceeds(updateDoc(doc(db, "users/leader-a"), {
    lastLoginAt: new Date(),
    sessionToken: "session-a",
  }));
  await assertFails(updateDoc(doc(db, "users/leader-a"), { role: "admin" }));
  await assertFails(setDoc(doc(db, "users/new-user"), {
    employeeId: "TL-NEW",
    role: "teamleader",
    status: "active",
  }));
});

test("a leader cannot submit attendance under another leader's identity", async () => {
  const db = leaderDb();
  await assertFails(setDoc(doc(db, `attendance/TL-B_${date}`), validAttendance("TL-B")));
});

test("a leader can submit their own attendance as an unverified payroll estimate", async () => {
  const db = leaderDb();
  const newDate = "2026-11-13";
  await assertSucceeds(setDoc(
    doc(db, `attendance/TL-A_${newDate}`),
    validAttendance("TL-A", newDate),
  ));
  const saved = await getDoc(doc(db, `attendance/TL-A_${newDate}`));
  assert.equal(saved.data().reviewStatus, "Pending");
  assert.equal(saved.data().payrollStatus, "Unverified");
});

test("a leader cannot create duplicate attendance at a non-deterministic document path", async () => {
  const db = leaderDb();
  await assertFails(setDoc(doc(db, "attendance/duplicate-copy"), validAttendance()));
});

test("a leader submission cannot use a non-deterministic attendance path", async () => {
  const db = leaderDb();
  const forged = {
    ...validAttendance(),
    totalPayment: 999999,
    workers: [{ id: "worker-b", status: "Present", rate: 999999, payment: 999999 }],
  };
  await assertFails(setDoc(doc(db, `attendance/TL-A_${date}-forged`), forged));
});

test("an edit grant must not let a leader alter review state or keep editing enabled", async () => {
  const db = leaderDb();
  await assertFails(updateDoc(doc(db, `attendance/TL-A_${date}`), {
    reviewStatus: "Approved",
    totalPayment: 999999,
    editAllowed: true,
  }));
});

test("an edit request must reference the leader's own attendance record", async () => {
  const db = leaderDb();
  await assertFails(setDoc(doc(db, "attendanceEditRequests/forged-request"), {
    attendanceId: `TL-B_${date}`,
    employeeId: "TL-A",
    employeeName: "Test Leader",
    date,
    reason: "Attempt to edit another team's record",
    status: "pending",
    requestedAt: new Date(),
  }));
});

test("a leader can request a correction for their own locked attendance", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), `attendance/TL-A_${date}`), { editAllowed: false });
  });
  const db = leaderDb();
  await assertSucceeds(setDoc(doc(db, "attendanceEditRequests/valid-request"), {
    attendanceId: `TL-A_${date}`,
    employeeId: "TL-A",
    employeeName: "Test Leader",
    date,
    reason: "Correct a time entry",
    status: "pending",
    requestedAt: new Date(),
  }));
});

test("an admin can approve a pending edit request and grant its matching record", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      updateDoc(doc(db, `attendance/TL-A_${date}`), { editAllowed: false }),
      setDoc(doc(db, "attendanceEditRequests/valid-request"), {
        attendanceId: `TL-A_${date}`,
        employeeId: "TL-A",
        employeeName: "Test Leader",
        date,
        reason: "Correction requested",
        status: "pending",
        requestedAt: new Date(),
      }),
    ]);
  });
  const db = adminDb();
  await assertSucceeds(updateDoc(doc(db, `attendance/TL-A_${date}`), {
    editAllowed: true,
    editGrantedAt: new Date(),
  }));
  await assertSucceeds(updateDoc(doc(db, "attendanceEditRequests/valid-request"), {
    status: "approved",
    decidedAt: new Date(),
  }));
});

test("admins can read attendance across teams", async () => {
  const db = adminDb();
  const records = await assertSucceeds(getDocs(collection(db, "attendance")));
  assert.equal(records.size, 2);
});

test("admins can review attendance and grant one edit without changing payroll fields", async () => {
  const db = adminDb();
  await assertSucceeds(updateDoc(doc(db, `attendance/TL-B_${date}`), {
    reviewStatus: "Rejected",
    reviewedAt: new Date(),
  }));
  await assertSucceeds(updateDoc(doc(db, `attendance/TL-B_${date}`), {
    editAllowed: true,
    editGrantedAt: new Date(),
  }));
});

test("unauthenticated users cannot read protected collections", async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDocs(collection(db, "workers")));
  await assertFails(getDoc(doc(db, `attendance/TL-A_${date}`)));
});
