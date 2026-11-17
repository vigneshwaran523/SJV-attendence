
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";

import { deleteApp, initializeApp } from "firebase/app";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import { auth, db, configured } from "./firebase";

// Keep this mapping identical to the existing Firebase Auth account.
export function employeeLoginEmail(employeeId) {
  const id = String(employeeId || "").trim().toUpperCase();

  const employeeEmails = {
    "TL-1001": "tl01@gmail.com",
  };

  return (
    employeeEmails[id] ||
    `${id.toLowerCase()}@constructpulse-login.com`
  );
}

// Create a Team Leader Firebase Auth account and Firestore profile.
export async function createTeamLeaderAccount({
  name,
  employeeId,
  password,
}) {
  if (!configured) {
    throw new Error("Firebase is not configured. Check your .env file.");
  }

  // Confirm that the current user is an active admin.
  const adminUser = auth.currentUser;

  if (!adminUser) {
    throw new Error("Please sign in as administrator first.");
  }

  const adminSnapshot = await getDoc(
    doc(db, "users", adminUser.uid)
  );

  if (
    !adminSnapshot.exists() ||
    adminSnapshot.data().role !== "admin" ||
    adminSnapshot.data().status !== "active"
  ) {
    throw new Error("Only an active administrator can create team leaders.");
  }

  const cleanName = String(name || "").trim();
  const cleanId = String(employeeId || "").trim().toUpperCase();
  const cleanPassword = String(password || "");

  if (!cleanName) {
    throw new Error("Enter the team leader name.");
  }

  if (!/^[A-Z0-9._-]+$/.test(cleanId)) {
    throw new Error("Enter a valid Employee ID.");
  }

  if (cleanPassword.length < 6) {
    throw new Error("Password must contain at least 6 characters.");
  }

  // Prevent duplicate Employee IDs in Firestore.
  const existingLeader = await getDocs(
    query(
      collection(db, "users"),
      where("employeeId", "==", cleanId)
    )
  );

  if (!existingLeader.empty) {
    throw new Error("That team leader Employee ID already exists.");
  }

  // Create the account using a secondary Firebase app.
  // This keeps the administrator signed in.
  const secondaryApp = initializeApp(
    auth.app.options,
    `leader-create-${Date.now()}`
  );

  const secondaryAuth = getAuth(secondaryApp);

  let createdUser = null;

  try {
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      employeeLoginEmail(cleanId),
      cleanPassword
    );

    createdUser = credential.user;

    // Write the profile using the main app's admin session.
    await setDoc(doc(db, "users", createdUser.uid), {
      name: cleanName,
      employeeId: cleanId,
      role: "teamleader",
      status: "active",
      createdAt: serverTimestamp(),
    });

    return {
      uid: createdUser.uid,
      employeeId: cleanId,
    };
  } catch (error) {
    // Remove the Auth account if profile creation failed.
    if (createdUser) {
      try {
        await deleteUser(createdUser);
      } catch (deleteError) {
        console.error("Could not clean up the new Auth account:", deleteError);
      }
    }

    if (error?.code === "auth/email-already-in-use") {
      throw new Error(
        "This Employee ID already has a Firebase Authentication account. Check the existing account."
      );
    }

    if (error?.code === "permission-denied") {
      throw new Error(
        "Firestore denied profile creation. Check your Firestore security rules and admin account."
      );
    }

    throw error;
  } finally {
    await deleteApp(secondaryApp);
  }
}

// Team Leader login.
export async function loginLeader(employeeId, password) {
  if (!configured) {
    throw new Error("Firebase is not configured. Check your .env file.");
  }

  const cleanId = String(employeeId || "").trim().toUpperCase();
  const sessionToken = crypto.randomUUID();
  const pendingSessionKey = "constructpulse-session-login-pending";

  // Let AuthProvider ignore the old session token while this sign-in replaces it.
  sessionStorage.setItem(pendingSessionKey, "true");

  if (!cleanId || !password) {
    throw new Error("Enter your Employee ID and password.");
  }

  let credential;

  try {
    credential = await signInWithEmailAndPassword(
      auth,
      employeeLoginEmail(cleanId),
      password
    );
  } catch (error) {
    sessionStorage.removeItem(pendingSessionKey);
    if (
      [
        "auth/invalid-credential",
        "auth/user-not-found",
        "auth/wrong-password",
        "auth/invalid-email",
      ].includes(error?.code)
    ) {
      throw new Error("Employee ID or password is incorrect.");
    }

    throw error;
  }

  const profileRef = doc(db, "users", credential.user.uid);
  const sessionKey = `constructpulse-session-${credential.user.uid}`;
  sessionStorage.setItem(sessionKey, sessionToken);
  const snapshot = await getDoc(profileRef);
  const profile = snapshot.exists() ? snapshot.data() : null;

  if (
    !profile ||
    !["teamleader", "teamLeader"].includes(profile.role) ||
    profile.status !== "active" ||
    String(profile.employeeId || profile.empId || "").toUpperCase() !== cleanId
  ) {
    sessionStorage.removeItem(sessionKey);
    sessionStorage.removeItem(pendingSessionKey);
    await firebaseSignOut(auth);

    throw new Error(
      "This team leader account is inactive or not configured. Contact your administrator."
    );
  }

  try {
    await updateDoc(profileRef, {
      lastLoginAt: serverTimestamp(),
      sessionToken,
    });
    sessionStorage.removeItem(pendingSessionKey);
  } catch (error) {
    sessionStorage.removeItem(sessionKey);
    sessionStorage.removeItem(pendingSessionKey);
    await firebaseSignOut(auth);
    console.error("Could not save the team leader session:", error?.code, error);
    if (error?.code === "permission-denied") {
      throw new Error("Firebase blocked the session update. Deploy the updated Firestore rules, then try again.");
    }
    throw new Error(`Could not start a secure session (${error?.code || "connection error"}). Check your connection and try again.`);
  }

  return profile;
}

// Admin login.
export async function loginAdmin(email, password) {
  if (!configured) {
    throw new Error("Firebase is not configured. Check your .env file.");
  }

  const credential = await signInWithEmailAndPassword(
    auth,
    email.trim(),
    password
  );

  const snapshot = await getDoc(
    doc(db, "users", credential.user.uid)
  );

  const profile = snapshot.exists() ? snapshot.data() : null;

  if (
    !profile ||
    profile.role !== "admin" ||
    profile.status !== "active"
  ) {
    await firebaseSignOut(auth);
    throw new Error("This account is not an active administrator.");
  }

  return profile;
}

export async function signOut() {
  if (auth.currentUser) {
    sessionStorage.removeItem(`constructpulse-session-${auth.currentUser.uid}`);
  }
  await firebaseSignOut(auth);
}
