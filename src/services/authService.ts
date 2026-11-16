export interface AuthUser {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
}

const STUDENT_NAME_STORAGE_KEY = "braillebridge_student_name";
const TOKEN_STORAGE_KEY = "braillebridge_auth_token";
const USER_STORAGE_KEY = "braillebridge_auth_user";
export const AUTH_CHANGE_EVENT = "braillebridge-auth-change";

export function getStoredStudentName(): string {
  if (typeof window === "undefined") return "Jagruti";
  try {
    const directName = window.localStorage.getItem(STUDENT_NAME_STORAGE_KEY);
    if (directName && directName.trim().length > 0) {
      return directName.trim();
    }
    const rawUser = window.localStorage.getItem(USER_STORAGE_KEY);
    if (rawUser) {
      const parsed = JSON.parse(rawUser);
      if (parsed && typeof parsed.name === "string" && parsed.name.trim().length > 0) {
        return parsed.name.trim();
      }
    }
    return "Jagruti";
  } catch {
    return "Jagruti";
  }
}

export function getStoredAuthToken(): string {
  if (typeof window === "undefined") return "student_session_token";
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY) || "student_session_token";
  } catch {
    return "student_session_token";
  }
}

export function getStoredUser(): AuthUser {
  const name = getStoredStudentName();
  return {
    id: "student_profile",
    name: name || "Jagruti",
    email: "",
    createdAt: new Date().toISOString(),
  };
}

export async function saveStudentName(name: string): Promise<AuthUser> {
  const cleanName = (name || "").trim() || "Jagruti";
  const user: AuthUser = {
    id: "student_profile",
    name: cleanName,
    email: "",
    createdAt: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STUDENT_NAME_STORAGE_KEY, cleanName);
      window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      window.localStorage.setItem(TOKEN_STORAGE_KEY, "student_session_token");
      window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail: user }));
    } catch {
      // ignore storage quota errors
    }
  }

  // Also sync with backend disk store
  try {
    await fetch("/api/student/name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: cleanName }),
    });
  } catch {
    // offline graceful fallback
  }

  return user;
}

export async function clearStudentName(): Promise<void> {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STUDENT_NAME_STORAGE_KEY);
      window.localStorage.removeItem(USER_STORAGE_KEY);
      window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail: null }));
    } catch {
      // ignore
    }
  }
}

export async function restoreOneTimeSession(): Promise<AuthUser> {
  const localName = getStoredStudentName();
  if (localName && localName !== "Student") {
    const user: AuthUser = {
      id: "student_profile",
      name: localName,
      email: "",
    };
    return user;
  }

  try {
    const res = await fetch("/api/student/name");
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data?.name && typeof data.name === "string" && data.name.trim().length > 0) {
        return await saveStudentName(data.name.trim());
      }
    }
  } catch {
    // offline graceful fallback
  }

  return saveStudentName(localName || "Jagruti");
}

export async function registerStudentAccount(
  name: string,
  _email?: string,
  _password?: string
): Promise<{ user?: AuthUser; error?: string; code?: string }> {
  const user = await saveStudentName(name);
  return { user };
}

export async function loginStudentAccount(
  nameOrEmail: string,
  _password?: string
): Promise<{ user?: AuthUser; error?: string; code?: string }> {
  const name = nameOrEmail.includes("@")
    ? nameOrEmail.split("@")[0].replace(/[0-9]/g, "").trim() || nameOrEmail.split("@")[0]
    : nameOrEmail;
  const user = await saveStudentName(name || "Jagruti");
  return { user };
}

export async function resetStudentPassword(
  _email?: string,
  _newPassword?: string
): Promise<{ user?: AuthUser; error?: string; code?: string }> {
  const user = getStoredUser();
  return { user };
}

export async function logoutStudentAccount(): Promise<void> {
  await clearStudentName();
}

export async function updateStudentProfile(
  name: string,
  _email?: string
): Promise<{ user?: AuthUser; error?: string }> {
  const clean = (name || "").trim();
  if (clean.length < 2) {
    return { error: "Please enter a valid student name (at least 2 characters)." };
  }
  const user = await saveStudentName(clean);
  return { user };
}

export async function fetchVaultBookmarks(): Promise<string[]> {
  const token = getStoredAuthToken();
  try {
    const res = await fetch("/api/vault/bookmarks", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.items)) return data.items;
    }
  } catch {
    // fallback to localStorage
  }
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem("braillebridge_vault_bookmarks");
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
  }
  return [];
}

export async function saveVaultBookmarks(items: string[]): Promise<boolean> {
  const unique = Array.from(new Set(items));
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem("braillebridge_vault_bookmarks", JSON.stringify(unique));
    } catch {
      // ignore
    }
  }
  const token = getStoredAuthToken();
  try {
    const res = await fetch("/api/vault/bookmarks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ items: unique }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
