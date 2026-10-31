import { NextResponse } from "next/server";
import { privilegedRestRequest } from "@/lib/supabase-rest";

export const runtime = "nodejs";

export async function GET() {
  const response = await privilegedRestRequest("profiles?select=id,username,role,status,created_at&order=created_at.desc");
  if (!response.ok) return NextResponse.json({ error: "อ่านบัญชีผู้ใช้ไม่สำเร็จ" }, { status: 503 });
  return NextResponse.json({ users: await response.json() });
}

export async function PATCH(request: Request) {
  const body = await request.json() as { id?: string; status?: string };
  if (!body.id || !["approved", "rejected", "disabled"].includes(body.status ?? "")) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const response = await privilegedRestRequest(`profiles?id=eq.${encodeURIComponent(body.id)}`, {
    method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: body.status, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) return NextResponse.json({ error: "บันทึกสิทธิ์ผู้ใช้ไม่สำเร็จ" }, { status: 503 });
  const rows = await response.json() as unknown[];
  if (!rows.length) return NextResponse.json({ error: "ไม่พบผู้ใช้หรือไม่มีสิทธิ์แก้ไข" }, { status: 404 });
  return NextResponse.json({ user: rows[0] });
}
