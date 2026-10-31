import { NextResponse } from "next/server";
import { privilegedRestRequest, supabaseConfig } from "@/lib/supabase-rest";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";

type UserRole = "admin" | "user";
type UserStatus = "approved" | "pending" | "rejected" | "disabled";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { username?: string; password?: string; role?: UserRole; status?: "approved" | "pending" };
    const username = body.username?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) {
      return NextResponse.json({ error: "ชื่อผู้ใช้ต้องยาว 3–30 ตัว ใช้ a-z, 0-9, จุด, ขีดล่าง หรือขีดกลาง" }, { status: 400 });
    }
    if (password.length < 8 || password.length > 72 || !["admin", "user"].includes(body.role ?? "") || !["approved", "pending"].includes(body.status ?? "")) {
      return NextResponse.json({ error: "กรุณาตรวจรหัสผ่าน บทบาท และสถานะบัญชี" }, { status: 400 });
    }

    const { url, secretKey } = supabaseConfig();
    const createResponse = await fetch(`${url}/auth/v1/admin/users`, {
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
    const created = await createResponse.json() as { id?: string; user?: { id?: string }; msg?: string; message?: string };
    if (createResponse.status === 422 || createResponse.status === 409) {
      return NextResponse.json({ error: "ชื่อผู้ใช้นี้ถูกลงทะเบียนแล้ว" }, { status: 409 });
    }
    if (!createResponse.ok) {
      console.error("Admin user creation failed", createResponse.status);
      return NextResponse.json({ error: "Supabase สร้างบัญชีไม่สำเร็จ ตรวจสอบ Secret key และ Auth ของโปรเจกต์" }, { status: 503 });
    }
    const userId = created.id ?? created.user?.id;
    if (!userId) {
      console.error("Admin user creation returned no user id");
      return NextResponse.json({ error: "สร้างบัญชีแล้ว แต่ไม่พบรหัสผู้ใช้สำหรับกำหนดสิทธิ์" }, { status: 503 });
    }

    const profileResponse = await privilegedRestRequest(`profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ role: body.role, status: body.status, updated_at: new Date().toISOString() }),
    });
    if (!profileResponse.ok) {
      console.error("New user profile update failed", profileResponse.status);
      return NextResponse.json({ error: "สร้างบัญชีแล้ว แต่กำหนดบทบาทไม่สำเร็จ กรุณารีเฟรชแล้วแก้สิทธิ์จากรายการบัญชี" }, { status: 503 });
    }
    const profiles = await profileResponse.json() as unknown[];
    if (!profiles.length) {
      return NextResponse.json({ error: "สร้างบัญชีแล้ว แต่ไม่พบโปรไฟล์ กรุณาตรวจ trigger สร้าง profiles ใน Supabase" }, { status: 503 });
    }
    await writeAuditLog({ action: "user.created", target: username, summary: `สร้างบัญชี ${username} · ${body.role === "admin" ? "Admin" : "User"} · ${body.status === "approved" ? "อนุมัติแล้ว" : "รออนุมัติ"}` });
    return NextResponse.json({ message: `สร้างบัญชี ${username} และกำหนดสิทธิ์เรียบร้อย` }, { status: 201 });
  } catch (error) {
    console.error("Admin user creation failed", error instanceof Error ? error.name : "unknown error");
    return NextResponse.json({ error: "ระบบสร้างบัญชียังตั้งค่าไม่ครบ กรุณาตรวจ SUPABASE_URL และ SUPABASE_SECRET_KEY" }, { status: 503 });
  }
}

export async function GET() {
  const response = await privilegedRestRequest("profiles?select=id,username,role,status,created_at&order=created_at.desc");
  if (!response.ok) return NextResponse.json({ error: "อ่านบัญชีผู้ใช้ไม่สำเร็จ" }, { status: 503 });
  return NextResponse.json({ users: await response.json() });
}

export async function PATCH(request: Request) {
  const body = await request.json() as { id?: string; status?: UserStatus; role?: UserRole };
  const hasStatus = body.status !== undefined && ["approved", "rejected", "disabled"].includes(body.status);
  const hasRole = body.role !== undefined && ["admin", "user"].includes(body.role);
  if (!body.id || (!hasStatus && !hasRole)) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const response = await privilegedRestRequest(`profiles?id=eq.${encodeURIComponent(body.id)}`, {
    method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...(hasStatus ? { status: body.status } : {}), ...(hasRole ? { role: body.role } : {}), updated_at: new Date().toISOString() }),
  });
  if (!response.ok) return NextResponse.json({ error: "บันทึกสิทธิ์ผู้ใช้ไม่สำเร็จ" }, { status: 503 });
  const rows = await response.json() as unknown[];
  if (!rows.length) return NextResponse.json({ error: "ไม่พบผู้ใช้หรือไม่มีสิทธิ์แก้ไข" }, { status: 404 });
  await writeAuditLog({
    action: hasRole ? "user.role.updated" : "user.status.updated",
    target: body.id,
    summary: `ปรับปรุงผู้ใช้ ${body.id}${hasRole ? ` · บทบาท ${body.role === "admin" ? "Admin" : "User"}` : ""}${hasStatus ? ` · สถานะ ${body.status}` : ""}`,
  });
  return NextResponse.json({ user: rows[0] });
}
