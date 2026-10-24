import { getDbPool } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SourceStation = RowDataPacket & {
  site_name: string;
  lat: number | null;
  lon: number | null;
  temperature: number | null;
  humidity: number | null;
  main_ac1: number | null;
  main_ac2: number | null;
  main_ac3: number | null;
  load_ac: number | null;
  load_dc: number | null;
  common_alarm: number | null;
  node_status: number | null;
  node_date_time: string | null;
  wifi: string | null;
  main_fail: string | null;
  ATS: string | null;
  gen_on: string | null;
  auto_block: string | null;
};

function parseDeviceTime(value: string | null): Date | null {
  if (!value) return null;
  const match = value.match(/(?:Date\s*:\s*)?(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(?:Time\s*:\s*)?(\d{1,2}):(\d{1,2}):(\d{1,2})/i);
  if (!match) return null;
  const [, day, month, year, hour, minute, second] = match;
  const calendarDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (calendarDate.getUTCDate() !== Number(day) || calendarDate.getUTCMonth() !== Number(month) - 1) return null;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 7, Number(minute), Number(second)));
  return date;
}

function numeric(value: number | string | null) {
  if (value === null || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function mapStation(row: SourceStation) {
  const lastSeen = parseDeviceTime(row.node_date_time);
  const ageSeconds = lastSeen ? Math.max(0, Math.floor((Date.now() - lastSeen.getTime()) / 1000)) : null;
  const staleAfterSeconds = Math.max(60, Number(process.env.STATION_STALE_AFTER_SECONDS) || 600);
  const status = ageSeconds === null || ageSeconds > staleAfterSeconds ? "offline" : "normal";
  return {
    id: row.site_name,
    name: row.site_name,
    district: row.site_name,
    status,
    updated: lastSeen ? lastSeen.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "—",
    lastSeenAt: lastSeen?.toISOString() ?? null,
    ageSeconds,
    staleAfterSeconds,
    mainAc1: numeric(row.main_ac1),
    mainAc2: numeric(row.main_ac2),
    mainAc3: numeric(row.main_ac3),
    loadAc: numeric(row.load_ac),
    loadDc: numeric(row.load_dc),
    temperature: numeric(row.temperature),
    humidity: numeric(row.humidity),
    wifi: numeric(row.wifi),
    commonAlarm: numeric(row.common_alarm),
    nodeStatus: numeric(row.node_status),
    mainFail: numeric(row.main_fail),
    ats: numeric(row.ATS),
    genOn: numeric(row.gen_on),
    autoBlock: numeric(row.auto_block),
    lat: numeric(row.lat) ?? undefined,
    lon: numeric(row.lon) ?? undefined,
    sourceTimestamp: row.node_date_time,
  };
}

export async function GET() {
  try {
    const [rows] = await getDbPool().query<SourceStation[]>(
      "SELECT site_name, lat, lon, temperature, humidity, main_ac1, main_ac2, main_ac3, load_ac, load_dc, common_alarm, node_status, node_date_time, wifi, main_fail, ATS, gen_on, auto_block FROM site_cmi ORDER BY site_name",
    );
    return Response.json(
      { source: "mariadb", fetchedAt: new Date().toISOString(), staleAfterSeconds: Math.max(60, Number(process.env.STATION_STALE_AFTER_SECONDS) || 600), stations: rows.map(mapStation) },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    const dbError = error as { name?: string; code?: string; errno?: number; sqlState?: string };
    const diagnostic = dbError.code ?? dbError.name ?? "UNKNOWN";
    console.error(`Station data query failed: ${diagnostic}${dbError.errno ? ` (errno ${dbError.errno})` : ""}`);
    return Response.json(
      { source: "mariadb", error: "ไม่สามารถอ่านข้อมูลจากฐานข้อมูลได้", diagnostic, stations: [] },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
