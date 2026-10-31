import { NextResponse } from "next/server";
import { authCookieOptions, fetchProfile, privilegedRestRequest, supabaseConfig } from "@/lib/supabase-rest";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cookies = request.headers.get("cookie") ?? "";
  const access = cookies.match(/(?:^|;\s*)pm_access=([^;]+)/)?.[1];
  const refresh = cookies.match(/(?:^|;\s*)pm_refresh=([^;]+)/)?.[1];
  let setupRequired = false;
  try {
    const adminsResponse = await privilegedRestRequest("profiles?select=id&role=eq.admin&status=eq.approved&limit=1", { signal: AbortSignal.timeout(7000) });
    if (!adminsResponse.ok) throw new Error(`Admin setup check failed: ${adminsResponse.status}`);
    setupRequired = (await adminsResponse.json() as { id: string }[]).length === 0;
    if (!access && !refresh) return NextResponse.json({ profile: null, setupRequired });

    const { url, publishableKey } = supabaseConfig();
    let accessToken = access ? decodeURIComponent(access) : "";
    let userResponse = accessToken ? await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` }, cache: "no-store",
    }) : null;
    let refreshed: { access_token?: string; refresh_token?: string; expires_in?: number } | null = null;
    if ((!userResponse || !userResponse.ok) && refresh) {
      const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST", headers: { apikey: publishableKey, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: decodeURIComponent(refresh) }), cache: "no-store",
      });
      if (response.ok) {
        const refreshedSession = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
        refreshed = refreshedSession;
        accessToken = refreshedSession.access_token ?? "";
        userResponse = await fetch(`${url}/auth/v1/user`, {
          headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` }, cache: "no-store",
        });
      }
    }
    if (!userResponse?.ok || !accessToken) {
      const result = NextResponse.json({ profile: null, setupRequired });
      result.cookies.set("pm_access", "", authCookieOptions(0));
      result.cookies.set("pm_refresh", "", authCookieOptions(0));
      return result;
    }
    const user = await userResponse.json() as { id?: string };
    const profile = user.id ? await fetchProfile(user.id, accessToken) : null;
    const result = NextResponse.json({ profile, setupRequired });
    if (refreshed?.refresh_token) {
      result.cookies.set("pm_access", accessToken, authCookieOptions(Math.max(60, refreshed.expires_in ?? 3600)));
      result.cookies.set("pm_refresh", refreshed.refresh_token, authCookieOptions(60 * 60 * 24 * 30));
    }
    return result;
  } catch {
    return NextResponse.json({ profile: null, setupRequired, error: "ระบบยืนยันตัวตนยังตั้งค่าไม่ครบ" }, { status: 503 });
  }
}
