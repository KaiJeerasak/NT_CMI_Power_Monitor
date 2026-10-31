import { NextResponse } from "next/server";
import { authCookieOptions, supabaseConfig } from "@/lib/supabase-rest";

export async function POST(request: Request) {
  const access = request.headers.get("cookie")?.match(/(?:^|;\s*)pm_access=([^;]+)/)?.[1];
  if (access) {
    try {
      const { url, publishableKey } = supabaseConfig();
      await fetch(`${url}/auth/v1/logout`, { method: "POST", headers: { apikey: publishableKey, Authorization: `Bearer ${decodeURIComponent(access)}` }, cache: "no-store" });
    } catch { /* Clear the local session even if the Auth service is unavailable. */ }
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set("pm_access", "", authCookieOptions(0));
  response.cookies.set("pm_refresh", "", authCookieOptions(0));
  return response;
}
