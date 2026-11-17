const { initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { attendanceId, prepareAttendance } = require("./attendance-logic");

initializeApp();
const db = getFirestore();

exports.submitAttendance = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in before submitting attendance.");

  const profileRef = db.doc(`users/${request.auth.uid}`);
  const profileSnapshot = await profileRef.get();
  const profile = profileSnapshot.exists ? profileSnapshot.data() : null;
  if (
    !profile ||
    !["teamleader", "teamLeader"].includes(profile.role) ||
    profile.status !== "active"
  ) {
    throw new HttpsError("permission-denied", "Only an active team leader can submit attendance.");
  }

  const employeeId = String(profile.employeeId || profile.empId || "").trim();
  const workerSnapshot = await db.collection("workers")
    .where("teamLeaderEmployeeId", "==", employeeId)
    .get();
  const activeWorkers = workerSnapshot.docs
    .filter((workerDoc) => workerDoc.data().active !== false)
    .map((workerDoc) => ({ id: workerDoc.id, ...workerDoc.data() }));

  let prepared;
  try {
    prepared = prepareAttendance({ profile, activeWorkers, data: request.data });
  } catch (error) {
    throw new HttpsError("invalid-argument", error.message);
  }

  const recordRef = db.doc(`attendance/${prepared.id}`);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(recordRef);
    if (existing.exists) {
      const current = existing.data();
      if (current.employeeId !== employeeId || current.date !== prepared.payload.date) {
        throw new HttpsError("failed-precondition", "The attendance path does not match this team and date.");
      }
      if (current.editAllowed !== true) {
        throw new HttpsError("already-exists", "Attendance is already submitted and locked for this date.");
      }
      transaction.set(recordRef, {
        ...prepared.payload,
        createdAt: current.createdAt || FieldValue.serverTimestamp(),
        submittedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      transaction.create(recordRef, {
        ...prepared.payload,
        createdAt: FieldValue.serverTimestamp(),
        submittedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });

  return { id: prepared.id, totalPayment: prepared.payload.totalPayment };
});
