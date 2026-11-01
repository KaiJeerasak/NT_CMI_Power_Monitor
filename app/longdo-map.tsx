"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alarm, initialAlarms, Station, stations } from "@/lib/demo-data";

type LongdoMarker = { id: string };
type LongdoMapInstance = {
  Overlays: { add: (marker: LongdoMarker) => void };
  Event: { bind: (name: string, listener: (overlay: LongdoMarker) => void) => void };
  bound: (value?: { minLon: number; minLat: number; maxLon: number; maxLat: number }, pivot?: { lat: number; lon: number }, allowZoomIn?: boolean) => LongdoMapInstance;
  location: (value: { lat: number; lon: number }, animate?: boolean) => LongdoMapInstance;
  zoom: (value: number, animate?: boolean) => LongdoMapInstance;
};
type LongdoApi = {
  Map: new (options: Record<string, unknown>) => LongdoMapInstance;
  Marker: new (location: { lat: number; lon: number }, options: Record<string, unknown>) => LongdoMarker;
};
declare global { interface Window { longdo?: LongdoApi } }

const key = process.env.NEXT_PUBLIC_LONGDO_MAP_KEY?.trim();
const center = { lat: 18.7883, lon: 98.9853 };

function markerIconHtml(status: Station["status"], tooltip: string) {
  const icon = status === "fault"
    ? '<span class="longdo-marker longdo-marker--fault"><i class="longdo-marker__pulse longdo-marker__pulse--a"></i><i class="longdo-marker__pulse longdo-marker__pulse--b"></i><b class="longdo-marker__core">!</b></span>'
    : status === "warning"
      ? '<span class="longdo-marker longdo-marker--warning"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 22 21H2L12 2.8Z"/><path d="M12 9v5m0 3v.2"/></svg></span>'
      : status === "offline"
        ? '<span class="longdo-marker longdo-marker--offline"><b class="longdo-marker__core">—</b></span>'
        : '<span class="longdo-marker longdo-marker--normal"><b class="longdo-marker__core">•</b></span>';
  return `<span class="longdo-marker-wrap">${icon}${tooltip ? `<span class="longdo-alarm-tip">${tooltip}</span>` : ""}</span>`;
}

function stationLocation(station: Station) {
  if (station.lat !== undefined && station.lon !== undefined) return { lat: station.lat, lon: station.lon };
  // Existing demo x/y values only describe a rough visual layout, not surveyed station coordinates.
  return { lat: 19.12 - station.y * 0.0072, lon: 98.78 + station.x * 0.0043 };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!);
}

function stationHoverTip(station: Station, alarms: Alarm[]) {
  const alarm = alarms.find(item => item.stationId === station.id && !item.resolvedAt);
  if (!alarm) return `<span class="longdo-alarm-tip__title">${escapeHtml(station.name)}</span>`;
  const start = alarm.started.match(/(\d{2}):(\d{2}):(\d{2})/);
  const end = station.updated.match(/(\d{2}):(\d{2}):(\d{2})/);
  let elapsed = "กำลังจำลอง";
  if (start && end) {
    const seconds = (Number(end[1]) * 3600 + Number(end[2]) * 60 + Number(end[3])) - (Number(start[1]) * 3600 + Number(start[2]) * 60 + Number(start[3]));
    if (seconds >= 0) elapsed = seconds < 60 ? `${seconds} วินาที` : `${Math.floor(seconds / 60)} นาที`;
  }
  return `<span class="longdo-alarm-tip__station">${escapeHtml(station.name)}</span><span class="longdo-alarm-tip__title">${escapeHtml(alarm.title)}</span><span>ตรวจพบ ${escapeHtml(alarm.started.replace(/^วันนี้\s*/, ""))} · ผ่านมา ${elapsed}</span>`;
}

export function ChiangMaiMap({ onSelect, stationData = stations, alarmData = initialAlarms }: { onSelect: (station: Station) => void; stationData?: Station[]; alarmData?: Alarm[] }) {
  const placeholder = useRef<HTMLDivElement>(null);
  const map = useRef<LongdoMapInstance | null>(null);
  const onSelectRef = useRef(onSelect);
  const stationDataRef = useRef(stationData);
  const alarmDataRef = useRef(alarmData);
  const [error, setError] = useState(false);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { stationDataRef.current = stationData; }, [stationData]);
  useEffect(() => { alarmDataRef.current = alarmData; }, [alarmData]);

  const initialize = useCallback(() => {
    if (!key || !placeholder.current || !window.longdo || map.current) return;
    try {
      const instance = new window.longdo.Map({
        placeholder: placeholder.current,
        language: "th",
        location: center,
        zoom: 10,
        lastView: false,
      });
      const markers = new Map<LongdoMarker, Station>();
      const currentStations = stationDataRef.current;
      const currentAlarms = alarmDataRef.current;
      currentStations.forEach((station) => {
        const hasVoltageAlarm = currentAlarms.some(alarm => alarm.stationId === station.id && alarm.id.startsWith("VOLTAGE-LOW-") && !alarm.resolvedAt);
        const markerStatus = station.status === "offline" ? "offline" : hasVoltageAlarm ? "fault" : station.status;
        const marker = new window.longdo!.Marker(stationLocation(station), {
          clickable: true,
          icon: { html: markerIconHtml(markerStatus, stationHoverTip(station, currentAlarms)), offset: { x: 20, y: 20 }, size: { width: 40, height: 40 } },
          style: "background:transparent;border:0;border-radius:0;box-shadow:none;padding:0;",
        });
        markers.set(marker, station);
        instance.Overlays.add(marker);
      });
      const alertLocations = currentStations
        .filter(station => station.status !== "normal" || currentAlarms.some(alarm => alarm.stationId === station.id && !alarm.resolvedAt))
        .map(stationLocation);
      if (alertLocations.length === 1) {
        instance.location(alertLocations[0], false);
        instance.zoom(13, false);
      } else if (alertLocations.length > 1) {
        const padding = 0.012;
        instance.bound({
          minLon: Math.min(...alertLocations.map(point => point.lon)) - padding,
          minLat: Math.min(...alertLocations.map(point => point.lat)) - padding,
          maxLon: Math.max(...alertLocations.map(point => point.lon)) + padding,
          maxLat: Math.max(...alertLocations.map(point => point.lat)) + padding,
        }, undefined, false);
      }
      instance.Event.bind("overlayClick", (overlay) => {
        const station = markers.get(overlay);
        if (station) onSelectRef.current(station);
      });
      map.current = instance;
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  if (!key) return <div className="map-canvas map-unconfigured">
    <div className="map-setup-card"><strong>แผนที่ Longdo พร้อมตั้งค่า</strong><span>เพิ่ม NEXT_PUBLIC_LONGDO_MAP_KEY ในไฟล์ .env.local แล้วรีสตาร์ตระบบ</span><small>ขณะนี้ยังไม่มี API key จึงยังไม่เรียกใช้บริการแผนที่</small></div>
  </div>;

  return <>
    <Script id="longdo-map-sdk" src={`https://api.longdo.com/map/?key=${encodeURIComponent(key)}`} strategy="afterInteractive" onReady={initialize} onError={() => setError(true)} />
    <div className="map-canvas longdo-map-canvas" ref={placeholder} aria-label="แผนที่สถานี Longdo" />
    {error && <div className="map-load-error" role="status">โหลดแผนที่ Longdo ไม่สำเร็จ ตรวจสอบ API key และโดเมนที่อนุญาต</div>}
  </>;
}
