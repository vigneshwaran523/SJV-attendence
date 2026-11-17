
import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { signOut as firebaseSignOut } from "firebase/auth";

import {
  auth,
  db,
  configured,
} from "../services/firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    let unsubscribeProfile = null;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;
      setUser(currentUser);
      setProfile(null);

      if (!currentUser) {
        setLoading(false);
        return;
      }

      const pendingSessionKey = "constructpulse-session-login-pending";
      const sessionKey = `constructpulse-session-${currentUser.uid}`;
      unsubscribeProfile = onSnapshot(
        doc(db, "users", currentUser.uid),
        (snapshot) => {
          if (!snapshot.exists()) {
            setProfile(null);
            setLoading(false);
            return;
          }
          const nextProfile = snapshot.data();
          const role = String(nextProfile.role || "").toLowerCase();
          const storedSession = sessionStorage.getItem(sessionKey);
          if (role === "teamleader" || role === "teamleader".toLowerCase()) {
            if (sessionStorage.getItem(pendingSessionKey) === "true") {
              if (storedSession && storedSession === nextProfile.sessionToken) {
                sessionStorage.removeItem(pendingSessionKey);
              } else {
                setProfile(nextProfile);
                setLoading(false);
                return;
              }
            } else if (!storedSession || storedSession !== nextProfile.sessionToken) {
              sessionStorage.removeItem(sessionKey);
              sessionStorage.setItem("constructpulse-session-expired", "true");
              void firebaseSignOut(auth);
              return;
            }
          }
          setProfile(nextProfile);
          setLoading(false);
        },
        (error) => {
          console.error("Could not load user profile:", error);
          setProfile(null);
          setLoading(false);
        },
      );
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, profile, loading }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
