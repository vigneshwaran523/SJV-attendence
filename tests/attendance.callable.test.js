import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { initializeApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signOut } from "firebase/auth";
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";

const projectId = "demo-constructpulse-security";
const date = "2026-11-13";
let testEnv;
let app;
let auth;
let db;
let submitAttendance;
let leader;

before(async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { host: "127.0.0.1", port: 8080, rules },
  });

  app = initializeApp({
    apiKey: "demo-api-key",
    authDomain: "localhost",
    projectId,
    appId: "demo-app-id",
  }, "attendance-callable-tests");
  auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  const functions = getFunctions(app, "us-central1");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  submitAttendance = httpsCallable(functions, "submitAttendance");
  const credential = await createUserWithEmailAndPassword(auth, "leader-a@example.test", "test-password-123");
  leader = credential.user;
});

after(async () => {
  if (auth) await signOut(auth).catch(() => {});
  if (app) await deleteApp(app);
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const seedDb = context.firestore();
    await Promise.all([
      setDoc(doc(seedDb, `users/${leader.uid}`), {
        employeeId: "TL-A",
        name: "Verified Leader",
        role: "teamleader",
        status: "active",
      }),
      setDoc(doc(seedDb, "workers/worker-a"), {
        name: "Worker A",
        role: "Mason",
        rate: 100,
        site: "Sastri",
        teamLeaderEmployeeId: "TL-A",
        active: true,
      }),
      setDoc(doc(seedDb, "workers/worker-b"), {
        name: "Worker B",
        role: "Helper",
        rate: 200,
        site: "Kaveri",
        teamLeaderEmployeeId: "TL-B",
        active: true,
      }),
    ]);
  });
});

function submission(overrides = {}) {
  return {
    employeeId: "TL-A",
    employeeName: "Spoofed Leader Name",
    date,
    totalPayment: 999999,
    overtimeCount: 999,
    siteTotals: [{ site: "Fake", amount: 999999, workers: 1 }],
    note: "Emulator test",
    workers: [{
      id: "worker-a",
      name: "Spoofed Worker Name",
      role: "CEO",
      rate: 999999,
      site: "Sastri",
      status: "Present",
      ot: 1,
      payment: 999999,
    }],
    ...overrides,
  };
}

test("the callable ignores client pay totals and stores server-computed payroll", async () => {
  const result = await submitAttendance(submission());
  assert.equal(result.data.id, `TL-A_${date}`);
  assert.equal(result.data.totalPayment, 150);

  const saved = await getDoc(doc(db, "attendance", result.data.id));
  assert.equal(saved.data().employeeName, "Verified Leader");
  assert.equal(saved.data().totalPayment, 150);
  assert.equal(saved.data().overtimeCount, 1);
  assert.equal(saved.data().workers[0].name, "Worker A");
  assert.equal(saved.data().workers[0].rate, 100);
  assert.equal(saved.data().workers[0].payment, 150);
  assert.equal(saved.data().reviewStatus, "Pending");
  assert.equal(saved.data().editAllowed, false);
});

test("the callable rejects a worker assigned to another team", async () => {
  await assert.rejects(
    submitAttendance(submission({ workers: [{ ...submission().workers[0], id: "worker-b" }] })),
    (error) => error.code === "functions/invalid-argument",
  );
  const saved = await getDoc(doc(db, "attendance", `TL-A_${date}`));
  assert.equal(saved.exists(), false);
});

test("the callable rejects a duplicate submission when the date is locked", async () => {
  await submitAttendance(submission());
  await assert.rejects(
    submitAttendance(submission()),
    (error) => error.code === "functions/already-exists",
  );
});

test("an approved one-time edit is recalculated and locked again", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `attendance/TL-A_${date}`), {
      employeeId: "TL-A",
      date,
      status: "Submitted",
      reviewStatus: "Approved",
      editAllowed: true,
      totalPayment: 1,
      workers: [],
    });
  });

  const edited = submission({
    workers: [{ ...submission().workers[0], status: "Half Day", ot: 0 }],
  });
  const result = await submitAttendance(edited);
  assert.equal(result.data.totalPayment, 50);

  const saved = await getDoc(doc(db, "attendance", `TL-A_${date}`));
  assert.equal(saved.data().totalPayment, 50);
  assert.equal(saved.data().reviewStatus, "Pending");
  assert.equal(saved.data().editAllowed, false);
  await assert.rejects(submitAttendance(edited), (error) => error.code === "functions/already-exists");
});

test("the callable rejects unauthenticated requests", async () => {
  await signOut(auth);
  await assert.rejects(
    submitAttendance(submission()),
    (error) => error.code === "functions/unauthenticated",
  );
  await createUserWithEmailAndPassword(auth, "leader-b@example.test", "test-password-123");
});
