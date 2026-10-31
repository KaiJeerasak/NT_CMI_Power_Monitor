import { NextResponse } from "next/server";
import { privilegedRestRequest } from "@/lib/supabase-rest";

export const runtime = "nodejs";

export async function GET() {
  const response = await privilegedRestRequest("station_configs?select=station_id,electrical_config,infrastructure_config");
  if (!response.ok) return NextResponse.json({ error: "อ่านค่าคอนฟิกไม่สำเร็จ" }, { status: 503 });
  const rows = await response.json() as { station_id: string; electrical_config: Record<string, unknown>; infrastructure_config: Record<string, unknown> }[];
  return NextResponse.json({ configs: rows });
}

export async function POST(request: Request) {
  const body = await request.json() as { stationId?: string; electrical?: unknown; infrastructure?: unknown };
  if (!body.stationId || body.stationId.length > 100 || !body.electrical || !body.infrastructure) {
    return NextResponse.json({ error: "ข้อมูลคอนฟิกไม่ครบ" }, { status: 400 });
  }
  const response = await privilegedRestRequest("station_configs?on_conflict=station_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      station_id: body.stationId,
      electrical_config: body.electrical,
      infrastructure_config: body.infrastructure,
      updated_by: null,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) {
    console.error("Config write failed", response.status);
    return NextResponse.json({ error: "บันทึกคอนฟิกไม่สำเร็จ" }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
