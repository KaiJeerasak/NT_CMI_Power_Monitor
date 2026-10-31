import { NextResponse } from "next/server";
import { privilegedRestRequest, requireAdmin, supabaseAdminConfig } from "@/lib/supabase-rest";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";

type UserRole = "admin" | "user";
type UserStatus = "approved" | "pending" | "rejected" | "disabled";

async function hasApprovedAdmin() {
  const response = await privilegedRestRequest("profiles?select=id&role=eq.admin&status=eq.approved&limit=1");
  if (!response.ok) throw new Error(`Admin lookup failed: ${response.status}`);
  return (await response.json() as { id: string }[]).length > 0;
}

export async function POST(request: Request) {
  let stage: "configuration" | "auth-create" | "profile-update" = "configuration";
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

    const adminExists = await hasApprovedAdmin();
    if (adminExists && !await requireAdmin(request)) {
      return NextResponse.json({ error: "ต้องเข้าสู่ระบบด้วยบัญชี Admin ก่อนสร้างผู้ใช้" }, { status: 401 });
    }
    if (!adminExists && (body.role !== "admin" || body.status !== "approved")) {
      return NextResponse.json({ error: "กรุณาสร้าง Admin ที่อนุมัติแล้วเป็นบัญชีแรก" }, { status: 409 });
    }

    const { url, secretKey } = supabaseAdminConfig();
    stage = "auth-create";
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

    stage = "profile-update";
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
    console.error("Admin user creation failed", stage, error instanceof Error ? error.name : "unknown error");
    if (stage === "profile-update") {
      return NextResponse.json({ error: "สร้างบัญชี Auth แล้ว แต่กำหนดบทบาทไม่สำเร็จ กรุณารีเฟรชรายการและตรวจตาราง profiles ใน Supabase" }, { status: 503 });
    }
    if (stage === "configuration") {
      return NextResponse.json({ error: "ระบบสร้างบัญชียังตั้งค่าไม่ครบ กรุณาตรวจ SUPABASE_URL และ SUPABASE_SECRET_KEY ใน Vercel Production" }, { status: 503 });
    }
    return NextResponse.json({ error: "เชื่อมต่อ Supabase Auth เพื่อสร้างบัญชีไม่ได้ กรุณาตรวจ SUPABASE_URL และ SUPABASE_SECRET_KEY ใน Vercel Production" }, { status: 503 });
  }
}

export async function GET(request: Request) {
  let admin: Awaited<ReturnType<typeof requireAdmin>>;
  try { admin = await requireAdmin(request); }
  catch { return NextResponse.json({ error: "ตรวจสอบการเชื่อมต่อ Supabase Auth ไม่สำเร็จ" }, { status: 503 }); }
  if (!admin) {
    return NextResponse.json({ error: "ต้องเข้าสู่ระบบด้วยบัญชี Admin" }, { status: 401 });
  }
  try {
    const response = await privilegedRestRequest("profiles?select=id,username,role,status,created_at&order=created_at.desc");
    if (!response.ok) return NextResponse.json({ error: "อ่านบัญชีผู้ใช้ไม่สำเร็จ" }, { status: 503 });
    return NextResponse.json({ users: await response.json() });
  } catch {
    return NextResponse.json({ error: "เชื่อมต่อฐานข้อมูลบัญชีผู้ใช้ไม่ได้" }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  let admin: Awaited<ReturnType<typeof requireAdmin>>;
  try { admin = await requireAdmin(request); }
  catch { return NextResponse.json({ error: "ตรวจสอบการเชื่อมต่อ Supabase Auth ไม่สำเร็จ" }, { status: 503 }); }
  if (!admin) return NextResponse.json({ error: "ต้องเข้าสู่ระบบด้วยบัญชี Admin" }, { status: 401 });
  const body = await request.json() as { id?: string; status?: UserStatus; role?: UserRole };
  const hasStatus = body.status !== undefined && ["approved", "rejected", "disabled"].includes(body.status);
  const hasRole = body.role !== undefined && ["admin", "user"].includes(body.role);
  if (!body.id || (!hasStatus && !hasRole)) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  if (body.id === admin.profile.id && ((hasRole && body.role !== "admin") || (hasStatus && body.status !== "approved"))) {
    return NextResponse.json({ error: "ไม่สามารถลดสิทธิ์หรือระงับบัญชี Admin ที่กำลังใช้งานได้" }, { status: 409 });
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
