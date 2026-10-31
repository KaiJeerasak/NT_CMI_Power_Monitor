import { NextResponse } from "next/server";
import { authCookieOptions, fetchProfile, supabaseConfig } from "@/lib/supabase-rest";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { username?: string; password?: string };
    const username = body.username?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username) || !password) {
      return NextResponse.json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, { status: 400 });
    }
    const { url, publishableKey } = supabaseConfig();
    const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: `${username}@auth.power-monitor.invalid`, password }),
      cache: "no-store",
    });
    const session = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; user?: { id: string } ; msg?: string; message?: string };
    if (!response.ok || !session.access_token || !session.refresh_token || !session.user?.id) {
      return NextResponse.json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
    }
    const profile = await fetchProfile(session.user.id, session.access_token);
    if (!profile) return NextResponse.json({ error: "ไม่พบโปรไฟล์ผู้ใช้ กรุณาติดต่อผู้ดูแลระบบ" }, { status: 403 });
    const result = NextResponse.json({ profile });
    result.cookies.set("pm_access", session.access_token, authCookieOptions(Math.max(60, session.expires_in ?? 3600)));
    result.cookies.set("pm_refresh", session.refresh_token, authCookieOptions(60 * 60 * 24 * 30));
    return result;
  } catch (error) {
    console.error("Login failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "ระบบเข้าสู่ระบบยังตั้งค่าไม่ครบ" }, { status: 503 });
  }
}
