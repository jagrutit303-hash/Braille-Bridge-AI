export interface AuthUser {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
}

const TOKEN_STORAGE_KEY = "braillebridge_auth_token";
const USER_STORAGE_KEY = "braillebridge_auth_user";
export const AUTH_CHANGE_EVENT = "braillebridge-auth-change";

export function getStoredAuthToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.name === "string" && typeof parsed.email === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function persistSession(token: string, user: AuthUser | null) {
  if (typeof window === "undefined") return;
  try {
    if (token && user) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
      window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(USER_STORAGE_KEY);
    }
    window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail: user }));
  } catch {
    // ignore storage quota errors
  }
}

export async function registerStudentAccount(
  name: string,
  email: string,
  password: string
): Promise<{ user?: AuthUser; error?: string }> {
  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: data.error || "Could not create account. Please check your details." };
    }
    if (data.token && data.user) {
      persistSession(data.token, data.user);
      return { user: data.user };
    }
    return { error: "Unexpected response while creating account." };
  } catch {
    return { error: "Unable to reach the sign-up service right now. Please try again." };
  }
}

export async function loginStudentAccount(
  email: string,
  password: string
): Promise<{ user?: AuthUser; error?: string }> {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: data.error || "Invalid email or password." };
    }
    if (data.token && data.user) {
      persistSession(data.token, data.user);
      return { user: data.user };
    }
    return { error: "Unexpected response while signing in." };
  } catch {
    return { error: "Unable to reach the sign-in service right now. Please try again." };
  }
}

export async function restoreOneTimeSession(): Promise<AuthUser | null> {
  const token = getStoredAuthToken();
  const cachedUser = getStoredUser();
  if (!token) return null;

  try {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      persistSession("", null);
      return null;
    }
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.user) {
        persistSession(token, data.user);
        return data.user;
      }
    }
  } catch {
    // keep cached profile gracefully during temporary offline state
  }
  return cachedUser;
}

export async function logoutStudentAccount(): Promise<void> {
  const token = getStoredAuthToken();
  if (token) {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // ignore offline logout failures
    }
  }
  persistSession("", null);
}

export async function updateStudentProfile(
  name: string,
  email: string
): Promise<{ user?: AuthUser; error?: string }> {
  const token = getStoredAuthToken();
  if (!token) {
    return { error: "Please sign in first to update your profile." };
  }

  try {
    const res = await fetch("/api/auth/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: name.trim(), email: email.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: data.error || "Could not update profile details." };
    }
    if (data.user) {
      persistSession(token, data.user);
      return { user: data.user };
    }
    return { error: "Unexpected response while updating profile." };
  } catch {
    return { error: "Unable to reach the profile update service right now." };
  }
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

