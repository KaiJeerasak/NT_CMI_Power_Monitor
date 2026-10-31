import "server-only";

export type UserProfile = {
  id: string;
  username: string;
  role: "admin" | "user";
  status: "pending" | "approved" | "rejected" | "disabled";
};

export function supabaseAdminConfig() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secretKey) {
    throw new Error("Supabase server environment is not configured");
  }
  return { url, secretKey };
}

export function supabaseConfig() {
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const { url, secretKey } = supabaseAdminConfig();
  if (!publishableKey) {
    throw new Error("Supabase server environment is not configured");
  }
  return { url, publishableKey, secretKey };
}

export function authCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge,
  };
}

export async function fetchProfile(userId: string, accessToken: string): Promise<UserProfile | null> {
  const { url, publishableKey } = supabaseConfig();
  const query = new URLSearchParams({ select: "id,username,role,status", id: `eq.${userId}`, limit: "1" });
  const response = await fetch(`${url}/rest/v1/profiles?${query}`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const rows = await response.json() as UserProfile[];
  return rows[0] ?? null;
}

export async function getAuthenticatedProfile(request: Request) {
  const accessToken = request.headers.get("cookie")?.match(/(?:^|;\s*)pm_access=([^;]+)/)?.[1];
  if (!accessToken) return null;
  const { url, publishableKey } = supabaseConfig();
  const userResponse = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${decodeURIComponent(accessToken)}` },
    cache: "no-store",
  });
  if (!userResponse.ok) return null;
  const user = await userResponse.json() as { id?: string };
  if (!user.id) return null;
  const profile = await fetchProfile(user.id, decodeURIComponent(accessToken));
  return profile ? { profile, accessToken: decodeURIComponent(accessToken) } : null;
}

export async function requireAdmin(request: Request) {
  const auth = await getAuthenticatedProfile(request);
  if (!auth || auth.profile.role !== "admin" || auth.profile.status !== "approved") return null;
  return auth;
}

export async function restRequest(path: string, accessToken: string, init: RequestInit = {}) {
  const { url, publishableKey } = supabaseConfig();
  const headers = new Headers(init.headers);
  headers.set("apikey", publishableKey);
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Content-Type", "application/json");
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export async function privilegedRestRequest(path: string, init: RequestInit = {}) {
  const { url, secretKey } = supabaseAdminConfig();
  const headers = new Headers(init.headers);
  headers.set("apikey", secretKey);
  headers.set("Authorization", `Bearer ${secretKey}`);
  headers.set("Content-Type", "application/json");
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}
