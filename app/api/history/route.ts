import { getDbPool } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VoltageHistoryRow = RowDataPacket & {
  bucket: string;
  main_ac1: number | string | null;
  main_ac2: number | string | null;
  main_ac3: number | string | null;
  load_ac: number | string | null;
};

type TelemetryHistoryRow = RowDataPacket & {
  dt: string;
  site_name: string;
  temperature: number | string | null;
  humidity: number | string | null;
  main_ac1: number | string | null;
  main_ac2: number | string | null;
  main_ac3: number | string | null;
  load_ac: number | string | null;
  load_dc: number | string | null;
};

function numeric(value: number | string | null) {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const station = search.get("station")?.trim();
  if (!station) {
    return Response.json({ error: "กรุณาระบุสถานี", points: [], rows: [] }, { status: 400 });
  }

  if (search.get("format") === "chart") {
    const ranges = {
      realtime: { seconds: 60 * 60, bucket: 60 },
      "3h": { seconds: 3 * 60 * 60, bucket: 60 },
      "1d": { seconds: 24 * 60 * 60, bucket: 5 * 60 },
      "3d": { seconds: 3 * 24 * 60 * 60, bucket: 15 * 60 },
      "1w": { seconds: 7 * 24 * 60 * 60, bucket: 60 * 60 },
    } as const;
    const rangeKey = search.get("range") as keyof typeof ranges | null;
    const range = rangeKey ? ranges[rangeKey] : undefined;
    if (!range || !rangeKey) {
      return Response.json({ error: "กรุณาเลือกระยะเวลากราฟที่รองรับ", points: [] }, { status: 400 });
    }
    try {
      const [rows] = await getDbPool().query<TelemetryHistoryRow[]>(
        `SELECT DATE_FORMAT(FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(dt) / ${range.bucket}) * ${range.bucket}), '%Y-%m-%d %H:%i:%s') AS dt,
                site_name, AVG(temperature) AS temperature, AVG(humidity) AS humidity,
                AVG(main_ac1) AS main_ac1, AVG(main_ac2) AS main_ac2,
                AVG(main_ac3) AS main_ac3, AVG(load_ac) AS load_ac, AVG(load_dc) AS load_dc
         FROM site_log
         WHERE site_name = ? AND dt >= NOW() - INTERVAL ${range.seconds} SECOND AND dt <= NOW()
         GROUP BY FLOOR(UNIX_TIMESTAMP(dt) / ${range.bucket})
         ORDER BY dt DESC`,
        [station],
      );
      return Response.json({
        source: "mariadb",
        station,
        range: rangeKey,
        bucketSeconds: range.bucket,
        points: rows.map(row => ({
          dt: row.dt,
          station: row.site_name,
          temperature: numeric(row.temperature),
          humidity: numeric(row.humidity),
          mainAc1: numeric(row.main_ac1),
          mainAc2: numeric(row.main_ac2),
          mainAc3: numeric(row.main_ac3),
          loadAc: numeric(row.load_ac),
          loadDc: numeric(row.load_dc),
        })),
      }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    } catch (error) {
      const dbError = error as { name?: string; code?: string; errno?: number };
      const diagnostic = dbError.code ?? dbError.name ?? "UNKNOWN";
      console.error(`Telemetry chart query failed: ${diagnostic}${dbError.errno ? ` (errno ${dbError.errno})` : ""}`);
      return Response.json({ source: "mariadb", error: "ไม่สามารถอ่านข้อมูลกราฟจาก site_log ได้", diagnostic, points: [] }, { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } });
    }
  }

  const from = search.get("from");
  const to = search.get("to");
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const validDate = (value: string | null) => {
    if (!value || !datePattern.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (search.get("format") === "telemetry" && (!validDate(from) || !validDate(to) || from! > to!)) {
    return Response.json({ error: "กรุณาระบุช่วงวันที่ให้ถูกต้อง", rows: [] }, { status: 400 });
  }

  if (search.get("format") === "telemetry") {
    try {
      const [rows] = await getDbPool().query<TelemetryHistoryRow[]>(
        `SELECT DATE_FORMAT(dt, '%Y-%m-%d %H:%i:%s') AS dt, site_name, temperature, humidity, main_ac1, main_ac2, main_ac3, load_ac, load_dc
         FROM site_log
         WHERE site_name = ? AND dt >= ? AND dt < DATE_ADD(?, INTERVAL 1 DAY)
         ORDER BY dt DESC
         LIMIT 5000`,
        [station, `${from} 00:00:00`, `${to} 00:00:00`],
      );
      return Response.json(
        {
          source: "mariadb",
          station,
          from,
          to,
          limit: 5000,
          truncated: rows.length === 5000,
          rows: rows.map(row => ({
            dt: row.dt,
            station: row.site_name,
            temperature: numeric(row.temperature),
            humidity: numeric(row.humidity),
            mainAc1: numeric(row.main_ac1),
            mainAc2: numeric(row.main_ac2),
            mainAc3: numeric(row.main_ac3),
            loadAc: numeric(row.load_ac),
            loadDc: numeric(row.load_dc),
          })),
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    } catch (error) {
      const dbError = error as { name?: string; code?: string; errno?: number };
      const diagnostic = dbError.code ?? dbError.name ?? "UNKNOWN";
      console.error(`Telemetry history query failed: ${diagnostic}${dbError.errno ? ` (errno ${dbError.errno})` : ""}`);
      return Response.json(
        { source: "mariadb", error: "ไม่สามารถอ่านประวัติจาก site_log ได้", diagnostic, rows: [] },
        { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }
  }

  try {
    const [rows] = await getDbPool().query<VoltageHistoryRow[]>(
      `SELECT DATE_FORMAT(FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(dt) / 300) * 300), '%Y-%m-%d %H:%i:%s') AS bucket,
              AVG(main_ac1) AS main_ac1, AVG(main_ac2) AS main_ac2,
              AVG(main_ac3) AS main_ac3, AVG(load_ac) AS load_ac
       FROM site_log
       WHERE site_name = ? AND dt >= NOW() - INTERVAL 24 HOUR
       GROUP BY FLOOR(UNIX_TIMESTAMP(dt) / 300)
       ORDER BY bucket ASC`,
      [station],
    );

    return Response.json(
      {
        source: "mariadb",
        station,
        windowHours: 24,
        fetchedAt: new Date().toISOString(),
        points: rows.map(row => ({
          time: row.bucket,
          mainAc1: numeric(row.main_ac1),
          mainAc2: numeric(row.main_ac2),
          mainAc3: numeric(row.main_ac3),
          loadAc: numeric(row.load_ac),
        })),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    const dbError = error as { name?: string; code?: string; errno?: number };
    const diagnostic = dbError.code ?? dbError.name ?? "UNKNOWN";
    console.error(`Voltage history query failed: ${diagnostic}${dbError.errno ? ` (errno ${dbError.errno})` : ""}`);
    return Response.json(
      { source: "mariadb", error: "ไม่สามารถอ่านประวัติแรงดันได้", diagnostic, points: [] },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
