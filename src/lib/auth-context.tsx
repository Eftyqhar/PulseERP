import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  getSqliteDb,
  hashPassword,
  generateSalt,
  notifyDbChange,
  subscribeToDbChanges,
} from "./sqlite";
import type { AdminUser, Role } from "./types";

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
}

interface AuthState {
  user: AuthUser | null;
  profile: AdminUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasRole: (role: Role | Role[]) => boolean;
  isSuperAdmin: boolean;
  updateUserDisplayName: (displayName: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const STORAGE_KEY = "pulse_auth_user";

// In-memory current user reference for direct access (auth.currentUser)
let currentActiveUser: AuthUser | null = null;

export const auth = {
  get currentUser() {
    return currentActiveUser;
  },
};

export async function createAdminAccount({
  displayName,
  email,
  password,
  role,
}: {
  displayName: string;
  email: string;
  password: string;
  role: Role;
}): Promise<string> {
  const db = await getSqliteDb();
  const cleanEmail = email.trim().toLowerCase();

  const check = db.exec("SELECT id FROM users WHERE LOWER(email) = ?", [cleanEmail]);
  if (check.length && check[0].values?.length) {
    throw new Error("An account with this email already exists");
  }

  const uid =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "usr_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);
  const now = Date.now();

  const profile: AdminUser = {
    uid,
    email: cleanEmail,
    displayName: displayName.trim(),
    role,
    createdAt: now,
    disabled: false,
  };

  db.run(
    `INSERT INTO users (id, email, password_hash, salt, display_name, role, disabled, created_at, data)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [uid, cleanEmail, passwordHash, salt, displayName.trim(), role, now, JSON.stringify(profile)],
  );

  notifyDbChange("users");
  return uid;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage & sync with SQLite database
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        const db = await getSqliteDb();
        const saved =
          typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;

        if (saved) {
          const parsed = JSON.parse(saved) as AuthUser;
          // Verify user still exists and is not disabled in SQLite
          const res = db.exec(
            "SELECT id, email, display_name, role, disabled, data FROM users WHERE id = ?",
            [parsed.uid],
          );

          if (res.length && res[0].values?.length) {
            const [id, email, displayName, role, disabled, dataStr] = res[0].values[0];
            if (disabled) {
              localStorage.removeItem(STORAGE_KEY);
              currentActiveUser = null;
              if (mounted) {
                setUser(null);
                setProfile(null);
              }
            } else {
              let parsedData: Partial<AdminUser> = {};
              try {
                parsedData = JSON.parse(dataStr as string);
              } catch {
                /* ignore */
              }

              const authUser: AuthUser = {
                uid: id as string,
                email: email as string,
                displayName: (displayName as string) || (email as string).split("@")[0],
                role: (role as Role) || "moderator",
              };
              const adminProfile: AdminUser = {
                uid: id as string,
                email: email as string,
                displayName: (displayName as string) || (email as string).split("@")[0],
                role: (role as Role) || "moderator",
                createdAt: (parsedData.createdAt as number) || Date.now(),
                disabled: false,
              };

              currentActiveUser = authUser;
              if (mounted) {
                setUser(authUser);
                setProfile(adminProfile);
              }
            }
          } else {
            localStorage.removeItem(STORAGE_KEY);
            currentActiveUser = null;
            if (mounted) {
              setUser(null);
              setProfile(null);
            }
          }
        }
      } catch (e) {
        console.error("Auth init error:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initAuth();

    // Listen for user updates in SQLite
    const unsub = subscribeToDbChanges((path) => {
      if (!mounted) return;
      if (path === "users" || path === "*" || (user && path === `users/${user.uid}`)) {
        if (currentActiveUser) {
          getSqliteDb().then((db) => {
            const res = db.exec(
              "SELECT id, email, display_name, role, disabled, data FROM users WHERE id = ?",
              [currentActiveUser?.uid],
            );
            if (res.length && res[0].values?.length) {
              const [id, email, displayName, role, disabled, dataStr] = res[0].values[0];
              if (disabled) {
                signOut();
              } else {
                let parsedData: Partial<AdminUser> = {};
                try {
                  parsedData = JSON.parse(dataStr as string);
                } catch {
                  /* ignore */
                }
                const updatedProfile: AdminUser = {
                  uid: id as string,
                  email: email as string,
                  displayName: (displayName as string) || (email as string).split("@")[0],
                  role: (role as Role) || "moderator",
                  createdAt: (parsedData.createdAt as number) || Date.now(),
                  disabled: false,
                };
                setProfile(updatedProfile);
                const updatedUser: AuthUser = {
                  uid: id as string,
                  email: email as string,
                  displayName: updatedProfile.displayName || "",
                  role: updatedProfile.role,
                };
                setUser(updatedUser);
                currentActiveUser = updatedUser;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
              }
            }
          });
        }
      }
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const db = await getSqliteDb();
    const cleanEmail = email.trim().toLowerCase();

    const res = db.exec(
      "SELECT id, email, password_hash, salt, display_name, role, disabled, data FROM users WHERE LOWER(email) = ?",
      [cleanEmail],
    );

    if (!res.length || !res[0].values?.length) {
      throw new Error("Invalid email or password");
    }

    const [id, userEmail, passwordHash, salt, displayName, role, disabled, dataStr] =
      res[0].values[0];

    if (disabled) {
      throw new Error("This account has been disabled. Contact a super administrator.");
    }

    const computedHash = await hashPassword(password, salt as string);
    if (computedHash !== passwordHash) {
      throw new Error("Invalid email or password");
    }

    let parsedData: Partial<AdminUser> = {};
    try {
      parsedData = JSON.parse(dataStr as string);
    } catch {
      /* ignore */
    }

    const authUser: AuthUser = {
      uid: id as string,
      email: userEmail as string,
      displayName: (displayName as string) || (userEmail as string).split("@")[0],
      role: (role as Role) || "moderator",
    };

    const adminProfile: AdminUser = {
      uid: id as string,
      email: userEmail as string,
      displayName: authUser.displayName,
      role: authUser.role,
      createdAt: (parsedData.createdAt as number) || Date.now(),
      disabled: false,
    };

    currentActiveUser = authUser;
    setUser(authUser);
    setProfile(adminProfile);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    const db = await getSqliteDb();
    const cleanEmail = email.trim().toLowerCase();

    const check = db.exec("SELECT id FROM users WHERE LOWER(email) = ?", [cleanEmail]);
    if (check.length && check[0].values?.length) {
      throw new Error("Email already registered");
    }

    // First user becomes super_admin, subsequent become moderator
    const countRes = db.exec("SELECT COUNT(*) FROM users");
    const count = (countRes[0]?.values[0]?.[0] as number) || 0;
    const role: Role = count === 0 ? "super_admin" : "moderator";

    const uid =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "usr_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);
    const now = Date.now();

    const newProfile: AdminUser = {
      uid,
      email: cleanEmail,
      displayName: displayName.trim(),
      role,
      createdAt: now,
      disabled: false,
    };

    db.run(
      `INSERT INTO users (id, email, password_hash, salt, display_name, role, disabled, created_at, data)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        uid,
        cleanEmail,
        passwordHash,
        salt,
        displayName.trim(),
        role,
        now,
        JSON.stringify(newProfile),
      ],
    );

    const authUser: AuthUser = {
      uid,
      email: cleanEmail,
      displayName: displayName.trim(),
      role,
    };

    currentActiveUser = authUser;
    setUser(authUser);
    setProfile(newProfile);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
    notifyDbChange("users");
  };

  const signOut = async () => {
    currentActiveUser = null;
    setUser(null);
    setProfile(null);
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const updateUserDisplayName = async (newDisplayName: string) => {
    if (!user) return;
    const db = await getSqliteDb();
    const cleanName = newDisplayName.trim();

    const res = db.exec("SELECT data FROM users WHERE id = ?", [user.uid]);
    let currentData: Record<string, unknown> = {};
    if (res.length && res[0].values?.length) {
      try {
        currentData = JSON.parse(res[0].values[0][0] as string);
      } catch {
        /* ignore */
      }
    }
    const merged = { ...currentData, displayName: cleanName };

    db.run("UPDATE users SET display_name = ?, data = ? WHERE id = ?", [
      cleanName,
      JSON.stringify(merged),
      user.uid,
    ]);

    const updatedUser = { ...user, displayName: cleanName };
    const updatedProfile = profile ? { ...profile, displayName: cleanName } : null;

    currentActiveUser = updatedUser;
    setUser(updatedUser);
    setProfile(updatedProfile);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
    notifyDbChange(`users/${user.uid}`);
  };

  const hasRole = (role: Role | Role[]) => {
    if (!profile) return false;
    const roles = Array.isArray(role) ? role : [role];
    return roles.includes(profile.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signIn,
        signUp,
        signOut,
        hasRole,
        isSuperAdmin: profile?.role === "super_admin",
        updateUserDisplayName,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
