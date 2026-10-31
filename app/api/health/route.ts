import { getDbPool } from "@/lib/db";
import { privilegedRestRequest } from "@/lib/supabase-rest";
import type { RowDataPacket } from "mysql2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProbeStatus = "healthy" | "degraded" | "offline" | "not_configured";
type Probe<T> = { status: ProbeStatus; latencyMs: number | null; detail: string; data?: T };
type MariaStats = RowDataPacket & { station_count: number | string; log_count: number | string; latest_log_at: Date | string | null };
type Profile = { id: string; role: "admin" | "user"; status: string };
type ConfigRow = { station_id: string };
type AuditEntry = { id: number; actor: string; action: string; target: string | null; summary: string; created_at: string };

async function measure<T>(check: () => Promise<{ status: ProbeStatus; detail: string; data?: T }>): Promise<Probe<T>> {
  const start = performance.now();
  try {
    const result = await check();
    return { ...result, latencyMs: Math.round(performance.now() - start) };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    const name = error instanceof Error ? error.name : "unknown";
    return { status: "offline", detail: code ?? name, latencyMs: Math.round(performance.now() - start) };
  }
}

async function readSupabaseTable<T>(path: string): Promise<{ rows: T[] | null; status: number | null; latencyMs: number }> {
  const start = performance.now();
  try {
    const response = await privilegedRestRequest(path, { signal: AbortSignal.timeout(7000) });
    if (!response.ok) return { rows: null, status: response.status, latencyMs: Math.round(performance.now() - start) };
    return { rows: await response.json() as T[], status: response.status, latencyMs: Math.round(performance.now() - start) };
  } catch {
    return { rows: null, status: null, latencyMs: Math.round(performance.now() - start) };
  }
}

export async function GET() {
  const checkedAt = new Date().toISOString();
  const [backend, maria, profilesResult, configsResult, auditResult] = await Promise.all([
    measure(async () => ({ status: "healthy" as const, detail: "Health API ตอบสนอง" })),
    measure(async () => {
      const [rows] = await getDbPool().query<MariaStats[]>(
        "SELECT (SELECT COUNT(*) FROM site_cmi) AS station_count, (SELECT COUNT(*) FROM site_log) AS log_count, (SELECT MAX(dt) FROM site_log) AS latest_log_at",
      );
      const row = rows[0];
      return {
        status: "healthy" as const,
        detail: `อ่าน site_cmi และ site_log ได้ · ${Number(row.station_count)} สถานี · ${Number(row.log_count).toLocaleString("en-US")} รายการ`,
        data: {
          stationCount: Number(row.station_count),
          logCount: Number(row.log_count),
          latestLogAt: row.latest_log_at instanceof Date ? row.latest_log_at.toISOString() : row.latest_log_at,
        },
      };
    }),
    readSupabaseTable<Profile>("profiles?select=id,role,status"),
    readSupabaseTable<ConfigRow>("station_configs?select=station_id"),
    readSupabaseTable<AuditEntry>("audit_logs?select=id,actor,action,target,summary,created_at&order=created_at.desc&limit=10"),
  ]);

  const profiles = profilesResult.rows;
  const configs = configsResult.rows;
  const supabaseOk = profiles !== null && configs !== null;
  const supabase: Probe<{ users: number; admins: number; approved: number; configurations: number }> = {
    status: supabaseOk ? "healthy" : "offline",
    latencyMs: Math.max(profilesResult.latencyMs, configsResult.latencyMs),
    detail: supabaseOk ? "อ่าน profiles และ station_configs ได้" : profilesResult.status === 401 || configsResult.status === 401 ? "Supabase ปฏิเสธ Secret key · ตรวจคีย์ให้ตรงโปรเจกต์" : profilesResult.status === 404 || configsResult.status === 404 ? "ไม่พบตาราง profiles/station_configs หรือยังไม่เปิด Data API" : "อ่าน profiles/station_configs ไม่ได้ · ตรวจ URL, Secret key และ Data API",
    data: supabaseOk ? {
      users: profiles.length,
      admins: profiles.filter(user => user.role === "admin").length,
      approved: profiles.filter(user => user.status === "approved").length,
      configurations: configs.length,
    } : undefined,
  };
  const audit: Probe<{ entries: AuditEntry[]; count: number }> = {
    status: auditResult.rows === null ? "not_configured" : "healthy",
    latencyMs: auditResult.latencyMs,
    detail: auditResult.rows === null ? "ยังอ่าน audit_logs ไม่ได้ · ตารางอาจยังไม่ได้ติดตั้งหรือ Data API ยังไม่เปิด" : `เก็บประวัติแล้ว ${auditResult.rows.length} รายการล่าสุด`,
    data: auditResult.rows === null ? undefined : { entries: auditResult.rows, count: auditResult.rows.length },
  };
  const mqtt: Probe<never> = {
    status: "not_configured",
    latencyMs: null,
    detail: "โปรเจกต์ยังไม่มีค่า Broker หรือ MQTT client",
  };
  const pipeline: Probe<never> = {
    status: maria.status === "healthy" ? "healthy" : "degraded",
    latencyMs: maria.latencyMs,
    detail: maria.status === "healthy" ? "อ่านข้อมูลจาก MariaDB ผ่าน API · ไม่มีคำสั่งควบคุมอุปกรณ์" : "อ่านข้อมูลจากฐานข้อมูลไม่ได้",
  };

  return Response.json({
    checkedAt,
    services: {
      backend,
      mariadb: maria,
      supabase,
      mqtt,
      pipeline,
      audit,
    },
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
