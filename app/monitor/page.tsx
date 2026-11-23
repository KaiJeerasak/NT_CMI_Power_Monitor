"use client";

import { useEffect, useMemo, useState } from "react";
import { Alarm, Station, stations as demoStations } from "@/lib/demo-data";
import { MONITOR_SNAPSHOT_KEY, type MonitorSnapshot } from "@/lib/monitor-snapshot";
import { ChiangMaiMap } from "../longdo-map";

type StationResponse = { source?: string; fetchedAt?: string; stations?: Station[]; error?: string };
type ConnectionState = "loading" | "synced" | "fallback" | "error";

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function alarmsFromStations(stations: Station[]): Alarm[] {
  return stations.flatMap(station => {
    if (station.status === "offline") return [{
      id: `OFFLINE-${station.id}`,
      stationId: station.id,
      station: station.name,
      title: "ไม่ได้รับข้อมูลจากอุปกรณ์",
      severity: "critical" as const,
      started: station.updated === "—" ? "ไม่พบเวลาจากอุปกรณ์" : `ข้อมูลล่าสุด ${station.updated}`,
    }];
    const lowPhases = ([
      ["F1", station.mainAc1],
      ["F2", station.mainAc2],
      ["F3", station.mainAc3],
    ] as const).filter(([, voltage]) => voltage !== null && voltage < 150).map(([phase]) => phase);
    return lowPhases.length ? [{
      id: `VOLTAGE-LOW-${station.id}`,
      stationId: station.id,
      station: station.name,
      title: `แรงดันไฟฟ้าต่ำกว่า 150 V · ${lowPhases.join(", ")}`,
      severity: "critical" as const,
      started: `วันนี้ ${station.updated}`,
    }] : [];
  });
}

function applyMonitorAlarmStatus(stations: Station[], alarms: Alarm[]) {
  const faultStations = new Set(alarms.filter(alarm => (alarm.id.startsWith("VOLTAGE-LOW-") || alarm.id.startsWith("POWER-OUTAGE-") || alarm.id.startsWith("SIM-GRID-")) && !alarm.resolvedAt).map(alarm => alarm.stationId));
  const warningStations = new Set(alarms.filter(alarm => alarm.id.startsWith("SIM-DC-") && !alarm.resolvedAt).map(alarm => alarm.stationId));
  return stations.map(station => station.status === "offline" ? station
    : faultStations.has(station.id) ? { ...station, status: "fault" as const }
      : warningStations.has(station.id) ? { ...station, status: "warning" as const } : station);
}

export default function MonitorPage() {
  const [stationData, setStationData] = useState<Station[]>([]);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [connection, setConnection] = useState<ConnectionState>("loading");
  const [lastUpdated, setLastUpdated] = useState("—");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    const readDashboardSnapshot = () => {
      try {
        const raw = window.localStorage.getItem(MONITOR_SNAPSHOT_KEY);
        if (!raw) return false;
        const snapshot = JSON.parse(raw) as MonitorSnapshot;
        const ageMs = Date.now() - Date.parse(snapshot.updatedAt);
        if (snapshot.version !== 1 || !Array.isArray(snapshot.stations) || !Array.isArray(snapshot.alarms) || !Number.isFinite(ageMs) || ageMs < -10_000 || ageMs > 60_000) return false;
        setStationData(snapshot.stations);
        setAlarms(snapshot.alarms);
        setConnection("synced");
        setLastUpdated(formatTime(snapshot.updatedAt));
        setErrorMessage("");
        return true;
      } catch { return false; }
    };
    const refreshFromDatabase = async () => {
      if (readDashboardSnapshot()) return;
      try {
        const response = await fetch("/api/stations", { cache: "no-store" });
        const payload = await response.json() as StationResponse;
        if (!response.ok || payload.source !== "mariadb") throw new Error(payload.error ?? "อ่านข้อมูลสถานีไม่สำเร็จ");
        if (!active || readDashboardSnapshot()) return;
        const enrichedStations = (payload.stations ?? []).map(station => {
          const knownLocation = demoStations.find(item => item.id === station.id);
          return { ...knownLocation, ...station, x: knownLocation?.x ?? Number.NaN, y: knownLocation?.y ?? Number.NaN } as Station;
        });
        setStationData(enrichedStations);
        setAlarms(alarmsFromStations(enrichedStations));
        setConnection("fallback");
        setLastUpdated(formatTime(payload.fetchedAt ?? null));
        setErrorMessage("");
      } catch (error) {
        if (!active) return;
        setConnection("error");
        setErrorMessage(error instanceof Error ? error.message : "เชื่อมต่อข้อมูลสถานีไม่สำเร็จ");
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === MONITOR_SNAPSHOT_KEY) readDashboardSnapshot();
    };

    window.addEventListener("storage", handleStorage);
    if (!readDashboardSnapshot()) void refreshFromDatabase();
    const timer = window.setInterval(() => void refreshFromDatabase(), 30_000);
    return () => {
      active = false;
      window.removeEventListener("storage", handleStorage);
      window.clearInterval(timer);
    };
  }, []);

  const statusStations = useMemo(() => applyMonitorAlarmStatus(stationData, alarms), [stationData, alarms]);
  const mapStations = statusStations.filter(station => Number.isFinite(station.lat) && Number.isFinite(station.lon) || Number.isFinite(station.x) && Number.isFinite(station.y));
  const unmappedStationCount = statusStations.length - mapStations.length;
  const voltageAlarmStations = alarms.filter(alarm => alarm.id.startsWith("VOLTAGE-LOW-") && !alarm.resolvedAt).map(alarm => alarm.id).sort().join("|");
  const mapKey = `${mapStations.map(station => `${station.id}:${station.status}:${station.lat ?? ""}:${station.lon ?? ""}`).join("|")}:${voltageAlarmStations}`;
  const statusCounts = statusStations.reduce((counts, station) => ({ ...counts, [station.status]: counts[station.status] + 1 }), { normal: 0, warning: 0, fault: 0, offline: 0 });

  return <main className="monitor-page">
    <header className="monitor-page-header">
      <div className="monitor-page-title"><span className={`monitor-page-status ${connection === "synced" || connection === "fallback" ? "live" : connection}`} aria-hidden="true"/><div><strong>NT Chiang Mai · Monitor</strong><small>{connection === "synced" ? `ใช้ข้อมูลชุดเดียวกับแดชบอร์ด · อัปเดต ${lastUpdated}` : connection === "fallback" ? `ข้อมูล MariaDB · อัปเดต ${lastUpdated}${unmappedStationCount ? ` · ไม่มีพิกัด ${unmappedStationCount} สถานี` : ""}` : connection === "loading" ? "กำลังเชื่อมต่อข้อมูลสถานี…" : errorMessage}</small></div></div>
      <div className="monitor-page-summary" aria-label="สรุปสถานะสถานี"><span>ปกติ <b>{statusCounts.normal}</b></span><span>เฝ้าระวัง <b>{statusCounts.warning}</b></span><span>ขัดข้อง <b>{statusCounts.fault}</b></span><span>ออฟไลน์ <b>{statusCounts.offline}</b></span></div>
    </header>
    <section className="monitor-page-map" aria-label="แผนที่เฝ้าระวังสถานี">
      <ChiangMaiMap key={mapKey || "monitor-map-empty"} onSelect={() => undefined} stationData={mapStations} alarmData={alarms}/>
      {connection === "error" && stationData.length === 0 && <div className="monitor-page-message" role="status">{errorMessage || "ยังเชื่อมต่อข้อมูลสถานีไม่ได้"}</div>}
      {connection !== "error" && stationData.length > 0 && mapStations.length === 0 && <div className="monitor-page-message" role="status">สถานียังไม่มีพิกัดที่ใช้แสดงบนแผนที่</div>}
    </section>
  </main>;
}
