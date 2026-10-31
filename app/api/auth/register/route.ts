import { NextResponse } from "next/server";
import { supabaseConfig } from "@/lib/supabase-rest";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { username?: string; password?: string };
    const username = body.username?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) {
      return NextResponse.json({ error: "ชื่อผู้ใช้ต้องยาว 3–30 ตัว ใช้ a-z, 0-9, จุด, ขีดล่าง หรือขีดกลาง" }, { status: 400 });
    }
    if (["jeerasak", "user1"].includes(username)) {
      return NextResponse.json({ error: "ชื่อผู้ใช้นี้สงวนไว้สำหรับบัญชีเริ่มต้นของระบบ" }, { status: 409 });
    }
    if (password.length < 8 || password.length > 72) {
      return NextResponse.json({ error: "รหัสผ่านต้องยาว 8–72 ตัวอักษร" }, { status: 400 });
    }
    const { url, secretKey } = supabaseConfig();
    const response = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `${username}@auth.power-monitor.invalid`,
        password,
        email_confirm: true,
        user_metadata: { username },
      }),
      cache: "no-store",
    });
    if (response.status === 422 || response.status === 409) {
      return NextResponse.json({ error: "ชื่อผู้ใช้นี้ถูกลงทะเบียนแล้ว" }, { status: 409 });
    }
    if (!response.ok) {
      console.error("Registration failed", response.status);
      return NextResponse.json({ error: "ไม่สามารถสร้างบัญชีได้ กรุณาลองใหม่ภายหลัง" }, { status: 503 });
    }
    return NextResponse.json({ message: "ลงทะเบียนสำเร็จ บัญชีจะใช้งานได้หลัง Admin อนุมัติ" }, { status: 201 });
  } catch (error) {
    console.error("Registration failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "ระบบลงทะเบียนยังตั้งค่าไม่ครบ" }, { status: 503 });
  }
}
