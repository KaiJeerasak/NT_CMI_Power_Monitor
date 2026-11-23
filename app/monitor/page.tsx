"use client";

import { useEffect, useMemo, useState } from "react";
import { Alarm, Station, stations as demoStations } from "@/lib/demo-data";
import { ChiangMaiMap } from "../longdo-map";

type StationResponse = { source?: string; fetchedAt?: string; stations?: Station[]; error?: string };

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function MonitorPage() {
  const [stationData, setStationData] = useState<Station[]>([]);
  const [connection, setConnection] = useState<"loading" | "live" | "error">("loading");
  const [lastUpdated, setLastUpdated] = useState("—");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/stations", { cache: "no-store" });
        const payload = await response.json() as StationResponse;
        if (!response.ok || payload.source !== "mariadb") throw new Error(payload.error ?? "อ่านข้อมูลสถานีไม่สำเร็จ");
        if (!active) return;
        const enrichedStations = (payload.stations ?? []).map(station => {
          const knownLocation = demoStations.find(item => item.id === station.id);
          return { ...knownLocation, ...station, x: knownLocation?.x ?? Number.NaN, y: knownLocation?.y ?? Number.NaN } as Station;
        });
        setStationData(enrichedStations);
        setConnection("live");
        setLastUpdated(formatTime(payload.fetchedAt ?? null));
        setErrorMessage("");
      } catch (error) {
        if (!active) return;
        setConnection("error");
        setErrorMessage(error instanceof Error ? error.message : "เชื่อมต่อข้อมูลสถานีไม่สำเร็จ");
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const alarms = useMemo<Alarm[]>(() => stationData.flatMap(station => {
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
    if (!lowPhases.length) return [];
    return [{
      id: `VOLTAGE-LOW-${station.id}`,
      stationId: station.id,
      station: station.name,
      title: `แรงดันไฟฟ้าต่ำกว่า 150 V · ${lowPhases.join(", ")}`,
      severity: "critical" as const,
      started: `วันนี้ ${station.updated}`,
    }];
  }), [stationData]);

  const statusStations = useMemo(() => stationData.map(station => ({
    ...station,
    status: alarms.some(alarm => alarm.stationId === station.id && alarm.id.startsWith("VOLTAGE-LOW-")) ? "fault" as const : station.status,
  })), [stationData, alarms]);
  const mapStations = statusStations.filter(station => Number.isFinite(station.lat) && Number.isFinite(station.lon) || Number.isFinite(station.x) && Number.isFinite(station.y));
  const unmappedStationCount = statusStations.length - mapStations.length;
  const mapKey = mapStations.map(station => `${station.id}:${station.status}:${station.lat ?? ""}:${station.lon ?? ""}`).join("|") + alarms.map(alarm => `${alarm.id}:${alarm.title}`).join("|");
  const statusCounts = statusStations.reduce((counts, station) => ({ ...counts, [station.status]: counts[station.status] + 1 }), { normal: 0, warning: 0, fault: 0, offline: 0 });

  return <main className="monitor-page">
    <header className="monitor-page-header">
      <div className="monitor-page-title"><span className={`monitor-page-status ${connection}`} aria-hidden="true"/><div><strong>NT Chiang Mai · Monitor</strong><small>{connection === "live" ? `ข้อมูล MariaDB · อัปเดต ${lastUpdated}${unmappedStationCount ? ` · ไม่มีพิกัด ${unmappedStationCount} สถานี` : ""}` : connection === "loading" ? "กำลังเชื่อมต่อข้อมูลสถานี…" : errorMessage}</small></div></div>
      <div className="monitor-page-summary" aria-label="สรุปสถานะสถานี"><span>ปกติ <b>{statusCounts.normal}</b></span><span>เฝ้าระวัง <b>{statusCounts.warning}</b></span><span>ขัดข้อง <b>{statusCounts.fault}</b></span><span>ออฟไลน์ <b>{statusCounts.offline}</b></span></div>
    </header>
    <section className="monitor-page-map" aria-label="แผนที่เฝ้าระวังสถานี">
      <ChiangMaiMap key={mapKey || "monitor-map-empty"} onSelect={() => undefined} stationData={mapStations} alarmData={alarms}/>
      {connection === "error" && stationData.length === 0 && <div className="monitor-page-message" role="status">{errorMessage || "ยังเชื่อมต่อข้อมูลสถานีไม่ได้"}</div>}
      {connection === "live" && stationData.length > 0 && mapStations.length === 0 && <div className="monitor-page-message" role="status">สถานียังไม่มีพิกัดที่ใช้แสดงบนแผนที่</div>}
    </section>
  </main>;
}
