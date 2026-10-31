import { NextResponse } from "next/server";
import { getAuthenticatedProfile, privilegedRestRequest, requireAdmin } from "@/lib/supabase-rest";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";

function supabaseFailureMessage(status?: number) {
  if (status === 401) return "Supabase ปฏิเสธ Secret key กรุณาตรวจว่า SUPABASE_SECRET_KEY เป็นคีย์ของโปรเจกต์นี้และใส่ใน Vercel Production";
  if (status === 403) return "Supabase ปฏิเสธสิทธิ์ กรุณาตรวจ Secret key และ Data API ของโปรเจกต์";
  return "บันทึกคอนฟิกไม่สำเร็จ กรุณาตรวจสอบ SUPABASE_URL และ SUPABASE_SECRET_KEY ใน Vercel Production";
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedProfile(request);
    if (!auth || auth.profile.status !== "approved") {
      return NextResponse.json({ error: "กรุณาเข้าสู่ระบบด้วยบัญชีที่ได้รับอนุมัติ" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "ตรวจสอบการเชื่อมต่อ Supabase Auth ไม่สำเร็จ" }, { status: 503 });
  }
  try {
    const response = await privilegedRestRequest("station_configs?select=station_id,electrical_config,infrastructure_config");
    if (!response.ok) return NextResponse.json({ error: supabaseFailureMessage(response.status) }, { status: 503 });
    const rows = await response.json() as { station_id: string; electrical_config: Record<string, unknown>; infrastructure_config: Record<string, unknown> }[];
    return NextResponse.json({ configs: rows });
  } catch (error) {
    console.error("Config read request failed", error instanceof Error ? error.name : "UNKNOWN");
    return NextResponse.json({ error: supabaseFailureMessage() }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let admin: Awaited<ReturnType<typeof requireAdmin>> = null;
  try { admin = await requireAdmin(request); }
  catch { return NextResponse.json({ error: "ตรวจสอบการเชื่อมต่อ Supabase Auth ไม่สำเร็จ" }, { status: 503 }); }
  if (!admin) {
    return NextResponse.json({ error: "ต้องเข้าสู่ระบบด้วยบัญชี Admin เพื่อแก้คอนฟิก" }, { status: 401 });
  }
  const body = await request.json() as { stationId?: string; electrical?: unknown; infrastructure?: unknown };
  if (!body.stationId || body.stationId.length > 100 || !body.electrical || !body.infrastructure) {
    return NextResponse.json({ error: "ข้อมูลคอนฟิกไม่ครบ" }, { status: 400 });
  }
  try {
    const response = await privilegedRestRequest("station_configs?on_conflict=station_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        station_id: body.stationId,
        electrical_config: body.electrical,
        infrastructure_config: body.infrastructure,
        updated_by: admin.profile.id,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!response.ok) {
      console.error("Config write failed", response.status);
      return NextResponse.json({ error: supabaseFailureMessage(response.status) }, { status: 503 });
    }
    await writeAuditLog({ action: "station.config.updated", target: body.stationId, summary: `บันทึกคอนฟิกสถานี ${body.stationId}` });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Config write request failed", error instanceof Error ? error.name : "UNKNOWN");
    return NextResponse.json({ error: supabaseFailureMessage() }, { status: 503 });
  }
}
