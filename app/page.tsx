"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Alarm, incidentSample, initialAlarms, labelForStatus, readings, Station, stations } from "@/lib/demo-data";
import { ChiangMaiMap } from "./longdo-map";
import { AdminUsersView } from "./admin-users";
import { AuthGate, useAppAuth } from "./auth-gate";

type View = "overview" | "stations" | "alarms" | "history" | "station-settings" | "system" | "users";
type StationElectricalConfig = { phaseMode: "single" | "three"; singlePhase: "F1" | "F2" | "F3"; threshold: number; confirmed: boolean };
type StationPowerConfig = {
  batteryUnitVoltage: number; batteryUnitAh: number; batterySeries: number; batteryStrings: number; batteryUsablePercent: number; batteryEfficiencyPercent: number; dcLoadWatts: number;
  generatorCount: number; generatorKva: number; generatorFuelLiters: number; generatorFuelUseLitersPerHour: number;
};
type StationConfigTab = "electrical" | "battery" | "generator";
type PendingStationSave = { kind: StationConfigTab; stationId: string; stationName: string; electricalConfig?: StationElectricalConfig; powerConfig?: StationPowerConfig };
type OutageIncident = { id: string; stationId: string; stationName: string; startedAt: string; startDc: number | null; latestDc: number | null; latestDcAt: string | null; phaseList: string[]; healthyPolls: number; acknowledgedAt?: string; resolvedAt?: string; reminder30Sent: boolean; escalation60Sent: boolean; };
const navItems: { id: View; label: string; icon: string }[] = [
  { id: "overview", label: "ภาพรวม", icon: "grid" },
  { id: "stations", label: "สถานีและอุปกรณ์", icon: "pin" },
  { id: "alarms", label: "ศูนย์แจ้งเตือน", icon: "bell" },
  { id: "history", label: "ประวัติและส่งออก", icon: "chart" },
  { id: "station-settings", label: "กำหนดค่าสถานี", icon: "settings" },
  { id: "system", label: "สุขภาพระบบ", icon: "settings" },
  { id: "users", label: "ผู้ใช้งานและสิทธิ์", icon: "users" },
];

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></>,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.2"/></>,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    chart: <><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 6-7"/><path d="M16 6h4v4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.2.9-1.2 2.1-1.4-.5a8 8 0 0 1-1.7 1l-.2 1.5h-2.4l-.3-1.5a8 8 0 0 1-1.8-1l-1.4.5-1.2-2.1 1.2-.9a7 7 0 0 1 0-2l-1.2-.9 1.2-2.1 1.4.5a8 8 0 0 1 1.8-1l.3-1.5h2.4l.2 1.5a8 8 0 0 1 1.7 1l1.4-.5 1.2 2.1-1.2.9a7 7 0 0 1 0 2Z" transform="translate(-1 -1)"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.2"/><path d="m16 16 4.5 4.5"/></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M4 17v3h16v-3"/></>,
    arrow: <><path d="M7 17 17 7M7 7h10v10"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    bolt: <path d="m13 2-9 12h7l-1 8 10-13h-7l1-7z"/>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    moon: <path d="M20.2 15.1A8.5 8.5 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>,
  };
  return <svg {...common} aria-hidden="true">{paths[name] ?? paths.grid}</svg>;
}

const subscribeToClock = (callback: () => void) => {
  const timer = window.setInterval(callback, 1000);
  return () => window.clearInterval(timer);
};
const getClockSnapshot = () => Math.floor(Date.now() / 1000);
const getServerClockSnapshot = () => 0;

function TopbarClock() {
  const seconds = useSyncExternalStore(subscribeToClock, getClockSnapshot, getServerClockSnapshot);
  const time = seconds ? new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(seconds * 1000) : "--:--:--";
  return <time className="topbar-clock" dateTime={seconds ? new Date(seconds * 1000).toISOString() : undefined} aria-label={`เวลาไทย ${seconds ? time : "กำลังโหลดเวลา"}`}>{time}</time>;
}

function SweetAlertPopup({ mode, title, message, onCancel, onConfirm, onClose, busy = false }: { mode: "confirm" | "success" | "error"; title: string; message: string; onCancel?: () => void; onConfirm?: () => void; onClose?: () => void; busy?: boolean }) {
  const close = mode === "confirm" ? onCancel : onClose;
  return <div className="swal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) close?.(); }}><section className="swal-dialog" role="alertdialog" aria-modal="true" aria-labelledby="swal-title" aria-describedby="swal-message"><span className={`swal-icon ${mode}`}>{mode === "confirm" ? "?" : mode === "success" ? <Icon name="check" size={32}/> : "!"}</span><h2 id="swal-title">{title}</h2><p id="swal-message">{message}</p><div className="swal-actions">{mode === "confirm" ? <><button className="swal-button secondary" disabled={busy} onClick={onCancel}>ยกเลิก</button><button className="swal-button primary" disabled={busy} onClick={onConfirm}>{busy ? "กำลังบันทึก..." : "ยืนยันบันทึก"}</button></> : <button className="swal-button primary" onClick={onClose}>ตกลง</button>}</div></section></div>;
}

function StatusPill({ status }: { status: Station["status"] }) {
  return <span className={`status-pill status-${status}`}><i />{labelForStatus[status]}</span>;
}

function defaultStationConfig(): StationElectricalConfig {
  return { phaseMode: "three", singlePhase: "F1", threshold: 150, confirmed: false };
}

function defaultStationPowerConfig(): StationPowerConfig {
  return { batteryUnitVoltage: 12, batteryUnitAh: 0, batterySeries: 1, batteryStrings: 1, batteryUsablePercent: 50, batteryEfficiencyPercent: 85, dcLoadWatts: 0, generatorCount: 1, generatorKva: 0, generatorFuelLiters: 0, generatorFuelUseLitersPerHour: 0 };
}

function failedVoltagePhases(station: Station, config: StationElectricalConfig) {
  const phases = [
    ["F1", "mainAc1"],
    ["F2", "mainAc2"],
    ["F3", "mainAc3"],
  ] as const;
  const monitored = config.phaseMode === "single" ? phases.filter(([phase]) => phase === config.singlePhase) : phases;
  return monitored.filter(([, key]) => station[key] !== null && station[key]! < config.threshold).map(([phase]) => phase);
}

function lowVoltageAlarms(stationList: Station[], configs: Record<string, StationElectricalConfig>): Alarm[] {
  return stationList.flatMap(station => {
    if (station.status === "offline") return [];
    const config = configs[station.id] ?? defaultStationConfig();
    const failedPhases = failedVoltagePhases(station, config);
    if (!failedPhases.length) return [];
    const generator = station.genOn === 0 ? "GEN ไม่ทำงาน" : station.genOn === 255 ? "GEN ทำงาน" : "ไม่ทราบสถานะ GEN";
    const failedValues = failedPhases.map(phase => {
      const key = phase === "F1" ? "mainAc1" : phase === "F2" ? "mainAc2" : "mainAc3";
      return `${phase} ${station[key]?.toFixed(1) ?? "—"} V`;
    }).join(", ");
    return [{
      id: `POWER-OUTAGE-${station.id}`,
      stationId: station.id,
      station: station.name,
      title: `ไฟฟ้าขาเข้าขัดข้อง · ${failedValues} · ${generator}`,
      severity: "critical" as const,
      started: station.updated === "—" ? "กำลังตรวจพบ" : `วันนี้ ${station.updated}`,
      generatorState: station.genOn === 0 ? "off" as const : station.genOn === 255 ? "on" as const : "unknown" as const,
      dcLatest: station.loadDc,
      dcLatestAt: station.updated,
    }];
  });
}

function applyAlarmStatus(stationList: Station[], alarms: Alarm[]) {
  const faultStations = new Set(alarms.filter(alarm => (alarm.id.startsWith("VOLTAGE-LOW-") || alarm.id.startsWith("POWER-OUTAGE-") || alarm.id.startsWith("SIM-GRID-")) && !alarm.resolvedAt).map(alarm => alarm.stationId));
  const warningStations = new Set(alarms.filter(alarm => alarm.id.startsWith("SIM-DC-") && !alarm.resolvedAt).map(alarm => alarm.stationId));
  return stationList.map(station => station.status === "offline" ? station : faultStations.has(station.id)
    ? { ...station, status: "fault" as const }
    : warningStations.has(station.id) ? { ...station, status: "warning" as const } : station);
}

function ageLabel(ageSeconds: number | null | undefined) {
  if (ageSeconds == null) return "ไม่มีเวลาอุปกรณ์";
  if (ageSeconds < 60) return `${ageSeconds} วินาทีที่แล้ว`;
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)} นาทีที่แล้ว`;
  if (ageSeconds < 86400) return `${Math.floor(ageSeconds / 3600)} ชั่วโมงที่แล้ว`;
  return `${Math.floor(ageSeconds / 86400)} วันที่แล้ว`;
}

function elapsedText(startedAt: string, now = Date.now()) {
  const elapsed = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 60_000));
  const hours = Math.floor(elapsed / 60);
  const minutes = elapsed % 60;
  return hours ? `${hours} ชม. ${minutes} นาที` : `${minutes} นาที`;
}

function clockText(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function estimatedBackupHours(config: StationPowerConfig | undefined) {
  if (!config || config.batteryUnitAh <= 0 || config.dcLoadWatts <= 0) return null;
  const usableWh = config.batteryUnitVoltage * config.batterySeries * config.batteryUnitAh * config.batteryStrings * config.batteryUsablePercent / 100 * config.batteryEfficiencyPercent / 100;
  return usableWh / config.dcLoadWatts;
}

function backupDurationLabel(hours: number | null | undefined) {
  if (hours == null || !Number.isFinite(hours) || hours <= 0) return null;
  return hours >= 24 ? `${(hours / 24).toFixed(1)} วัน` : `${hours.toFixed(1)} ชม.`;
}

function LogoMark() {
  return <div className="brand-mark"><span /><span /><span /></div>;
}

function MiniChart({ kind = "line" }: { kind?: "line" | "bar" }) {
  if (kind === "bar") return <div className="mini-bars">{[48, 68, 54, 72, 60, 82, 65, 78, 58, 74, 64, 87].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>;
  return <svg className="sparkline" viewBox="0 0 120 36" preserveAspectRatio="none" aria-hidden="true"><path className="spark-fill" d="M0 25 13 20 26 22 39 12 52 16 65 10 78 17 91 7 104 13 120 4V36H0Z"/><path className="spark-stroke" d="M0 25 13 20 26 22 39 12 52 16 65 10 78 17 91 7 104 13 120 4"/></svg>;
}

type VoltagePoint = { time: string; mainAc1: number | null; mainAc2: number | null; mainAc3: number | null; loadAc: number | null };
type HistoryRecord = { dt:string; station:string; mainAc1:number|null; mainAc2:number|null; mainAc3:number|null; loadAc:number|null; loadDc:number|null; temperature:number|null; humidity:number|null };
type HistoryChartRange = "realtime" | "3h" | "1d" | "3d" | "1w";

function PowerChart({ stationName, live, showLoadAc = true, thresholdVoltage = 150 }: { stationName: string; live: boolean; showLoadAc?: boolean; thresholdVoltage?: number }) {
  const demoPoints: VoltagePoint[] = readings.map(reading => ({
    time: reading.time,
    mainAc1: reading.mainAc1,
    mainAc2: reading.mainAc2,
    mainAc3: reading.mainAc3,
    loadAc: reading.loadAc,
  }));
  const [points, setPoints] = useState<VoltagePoint[]>(live ? [] : demoPoints);
  const [chartState, setChartState] = useState(live ? "กำลังโหลดข้อมูลย้อนหลัง…" : "ข้อมูลตัวอย่าง · ยังไม่ได้เชื่อมต่อฐานข้อมูล");
  useEffect(() => {
    if (!live) {
      setPoints(demoPoints);
      setChartState("ข้อมูลตัวอย่าง · ยังไม่ได้เชื่อมต่อฐานข้อมูล");
      return;
    }

    let active = true;
    const loadHistory = async () => {
      try {
        const response = await fetch(`/api/history?station=${encodeURIComponent(stationName)}`, { cache: "no-store" });
        const result = await response.json() as { points?: VoltagePoint[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "โหลดข้อมูลไม่สำเร็จ");
        if (active) {
          setPoints(result.points ?? []);
          setChartState(result.points?.length ? "" : "ยังไม่มีข้อมูลแรงดันใน site_log ภายใน 24 ชั่วโมง");
        }
      } catch {
        if (active) {
          setPoints([]);
          setChartState("เชื่อมต่อข้อมูลย้อนหลังไม่ได้");
        }
      }
    };

    void loadHistory();
    const timer = window.setInterval(() => void loadHistory(), 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [stationName, live]);

  const yForVoltage = (value: number) => Math.max(0, Math.min(100, 140 - value * 0.5));
  const linePoint = (key: "mainAc1" | "mainAc2" | "mainAc3" | "loadAc") => points
    .map((entry, index) => entry[key] === null ? null : `${points.length > 1 ? index * (100 / (points.length - 1)) : 50},${yForVoltage(entry[key]!)}`)
    .filter((value): value is string => value !== null)
    .join(" ");
  const timeLabels = points.length > 5
    ? Array.from({ length: 5 }, (_, index) => points[Math.round(index * (points.length - 1) / 4)]).filter((point, index, list) => index === 0 || point.time !== list[index - 1].time)
    : points;
  return <div className="power-chart">
    <div className="chart-y-labels"><span>250</span><span>200</span><span>150</span><span>100</span></div>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`กราฟแรงดัน F1 F2 F3${showLoadAc ? " และ Load AC" : ""} ของสถานี ${stationName} ใน 24 ชั่วโมงล่าสุด`}>
      {[15, 40, 65, 90].map(y => <line key={y} x1="0" x2="100" y1={y} y2={y} className="chart-gridline"/>)}
      <line x1="0" x2="100" y1={yForVoltage(thresholdVoltage)} y2={yForVoltage(thresholdVoltage)} className="chart-threshold-line"/>
      <polyline points={linePoint("mainAc1")} className="chart-voltage phase-1"/><polyline points={linePoint("mainAc2")} className="chart-voltage phase-2"/><polyline points={linePoint("mainAc3")} className="chart-voltage phase-3"/>{showLoadAc&&<polyline points={linePoint("loadAc")} className="chart-voltage load-phase"/>}
    </svg>
    <div className="chart-x-labels">{timeLabels.map((point, index) => <span key={`${point.time}-${index}`}>{point.time.slice(11, 16) || point.time}</span>)}</div>
    {chartState && <div className="chart-data-state" role="status">{chartState}</div>}
  </div>;
}

function DcVoltageBarChart({ stations, live }: { stations: Station[]; live: boolean }) {
  const sortedStations = [...stations].sort((a, b) => (a.loadDc ?? Number.POSITIVE_INFINITY) - (b.loadDc ?? Number.POSITIVE_INFINITY));
  const values = stations.map(station => station.loadDc).filter((value): value is number => value !== null && Number.isFinite(value));
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const stationColumns = `repeat(${sortedStations.length}, minmax(38px, 1fr))`;
  const plotMinWidth = `${Math.max(100, sortedStations.length * 44)}px`;
  const lowValues = values.filter(value => value < 48);
  const lowestBelowReference = lowValues.length ? Math.min(...lowValues) : 48;
  const barColor = (value: number | null) => {
    if (value === null) return "#8994a4";
    if (value >= 48) return "hsl(120 76% 40%)";
    const hue = lowestBelowReference === 48 ? 120 : Math.max(0, Math.min(120, ((value - lowestBelowReference) / (48 - lowestBelowReference)) * 120));
    return `hsl(${hue} 76% 48%)`;
  };
  return <section className="panel dc-voltage-chart" aria-labelledby="dc-voltage-heading">
    <div className="panel-heading dc-voltage-heading">
      <div><h2 id="dc-voltage-heading">แรงดัน DC ทุกสถานี</h2><p>{live ? "ค่าล่าสุดจาก MariaDB · load_dc" : "ข้อมูลตัวอย่าง · load_dc"} · เรียงจากแรงดันต่ำไปสูง</p></div>
      <div className="dc-voltage-average"><span>ค่าเฉลี่ยปัจจุบัน</span><strong>{average === null ? "—" : average.toFixed(1)} <small>VDC</small></strong><span>ค่าอ้างอิง 48 VDC</span></div>
    </div>
    <div className="dc-voltage-legend"><span><i className="dc-legend-normal"/>ปกติ ≥48 V</span><span><i className="dc-legend-low"/>แรงดันต่ำลง</span><span><i className="dc-legend-critical"/>ค่าต่ำสุดในกลุ่ม</span></div>
    {sortedStations.length ? <div className="dc-voltage-plot-layout">
      <div className="dc-voltage-y-axis" aria-hidden="true"><span className="dc-y-top">60</span><span className="dc-y-reference">48</span><span className="dc-y-bottom">0</span></div>
      <div className="dc-voltage-plot-scroll"><div className="dc-voltage-plot" style={{ gridTemplateColumns: stationColumns, minWidth: plotMinWidth }}>
        <div className="dc-voltage-stage"><div className="dc-voltage-column-grid" style={{ gridTemplateColumns: stationColumns }} role="list" aria-label="แรงดัน DC ของทุกสถานี">
          {sortedStations.map(station => {
            const value = station.loadDc;
            const height = value === null ? 0 : Math.min(100, Math.max(0, value / 60 * 100));
            const label = `${station.name}: ${value === null ? "ไม่มีข้อมูลแรงดัน DC" : `${value.toFixed(1)} VDC`}${station.status === "offline" ? " · ออฟไลน์" : ""} · อัปเดต ${station.updated}`;
            return <div className={`dc-voltage-column${station.status === "offline" ? " is-offline" : ""}`} role="listitem" tabIndex={0} key={station.id} title={label} aria-label={label}>
              <span className="dc-voltage-bar"><i style={{ height: `${height}%`, backgroundColor: barColor(value) }}/></span>
              <span className="dc-voltage-tooltip" role="tooltip"><strong>{station.name}</strong><b>{value === null ? "ไม่มีข้อมูล" : `${value.toFixed(1)} VDC`}</b><small>{station.status === "offline" ? "ออฟไลน์" : "สถานะออนไลน์"} · อัปเดต {station.updated}</small></span>
            </div>;
          })}
        </div><span className="dc-voltage-reference-line" aria-hidden="true"/><span className="dc-voltage-baseline" aria-hidden="true"/></div>
        <div className="dc-voltage-x-axis" style={{ gridTemplateColumns: stationColumns }} aria-hidden="true">{sortedStations.map(station=><span key={station.id} title={station.name}>{station.name}</span>)}</div>
      </div></div>
    </div> : <div className="dc-voltage-empty">ยังไม่มีข้อมูลสถานี</div>}
    <p className="dc-voltage-note">ค่าตั้งแต่ 48 VDC ขึ้นไปเป็นสีเขียว · ค่าที่ต่ำกว่า 48 VDC จะไล่สีผ่านเหลืองและส้ม จนค่าต่ำสุดในกลุ่มเป็นสีแดง · สีนี้ใช้ช่วยสังเกต ไม่ใช่ค่า Alarm</p>
  </section>;
}

function HistoryTrendChart({ rows, metric, gapMinutes = 15 }: { rows: HistoryRecord[]; metric: "voltage" | "temperature" | "dc"; gapMinutes?: number }) {
  const voltage = metric === "voltage";
  const temperature = metric === "temperature";
  const series: { key: keyof HistoryRecord; label: string; color: string }[] = voltage
    ? [{key:"mainAc1",label:"F1",color:"#5287df"},{key:"mainAc2",label:"F2",color:"#24a27b"},{key:"mainAc3",label:"F3",color:"#e2a63d"},{key:"loadAc",label:"Load AC",color:"#9b72cf"}]
    : temperature ? [{key:"temperature",label:"อุณหภูมิ",color:"#df7953"}] : [{key:"loadDc",label:"load_dc",color:"#268b9b"}];
  const chronological = [...rows].reverse();
  const times = chronological.map(row => Date.parse(row.dt.replace(" ", "T"))).filter(Number.isFinite);
  const minTime = times[0] ?? 0;
  const maxTime = times[times.length - 1] ?? minTime;
  const values = chronological.flatMap(row => series.map(line => row[line.key])).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const minValue = voltage ? 0 : temperature ? Math.max(0, Math.floor(Math.min(...values) / 5) * 5 - 5) : Math.floor(Math.min(...values) / 10) * 10;
  const maxValue = voltage ? Math.max(300, Math.ceil(Math.max(...values, 0) / 50) * 50) : temperature ? Math.max(50, Math.ceil(Math.max(...values, 0) / 5) * 5 + 5) : Math.max(minValue + 10, Math.ceil(Math.max(...values, 0) / 10) * 10);
  const yFor = (value:number) => 90 - Math.min(1, Math.max(0, (value - minValue) / (maxValue - minValue || 1))) * 78;
  const xFor = (time:number) => 2 + (maxTime === minTime ? 50 : (time - minTime) / (maxTime - minTime) * 96);
  const makePaths = (key:keyof HistoryRecord) => {
    const paths: string[] = [];
    let segment: string[] = [];
    let previousTime: number | null = null;
    for (const row of chronological) {
      const time = Date.parse(row.dt.replace(" ", "T"));
      const value = row[key];
      if (!Number.isFinite(time) || typeof value !== "number" || !Number.isFinite(value) || (previousTime !== null && time - previousTime > gapMinutes * 60 * 1000)) {
        if (segment.length) paths.push(segment.join(" "));
        segment = [];
      }
      if (Number.isFinite(time) && typeof value === "number" && Number.isFinite(value)) segment.push(`${xFor(time)},${yFor(value)}`);
      previousTime = Number.isFinite(time) ? time : null;
    }
    if (segment.length) paths.push(segment.join(" "));
    return paths;
  };
  const timeLabel = (row: HistoryRecord | undefined) => row ? row.dt.slice(5,16).replace("T", " ") : "—";
  return <section className={`panel history-chart-panel ${voltage ? "voltage-wide" : ""}`}>
    <div className="panel-heading"><div><h2>{voltage ? "แนวโน้มแรงดันไฟฟ้า" : temperature ? "แนวโน้มอุณหภูมิ" : "แนวโน้ม DC"}</h2><p>{voltage ? "แรงดัน 3 เฟสและ Load AC · V" : temperature ? "อุณหภูมิ · °C" : "load_dc · หน่วยรอยืนยัน"} · {rows.length.toLocaleString("th-TH")} จุดข้อมูล</p></div><div className="history-chart-legend">{series.map(line=><span key={line.label}><i style={{background:line.color}}/>{line.label}</span>)}</div></div>
    {values.length ? <div className="history-chart-wrap"><div className="history-chart-y-labels"><span>{maxValue}</span><span>{Math.round(minValue + (maxValue-minValue)*.66)}</span><span>{Math.round(minValue + (maxValue-minValue)*.33)}</span><span>{minValue}</span></div><svg className="history-chart-svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={voltage ? "กราฟแรงดัน F1 F2 F3 และ Load AC ตามเวลา" : "กราฟอุณหภูมิตามเวลา"}>{[12,38,64,90].map(y=><line key={y} x1="0" x2="100" y1={y} y2={y} className="chart-gridline"/>)}{series.map(line=>makePaths(line.key).map((path,index)=><polyline key={`${line.label}-${index}`} points={path} fill="none" stroke={line.color} strokeWidth="1.35" vectorEffect="non-scaling-stroke"/>))}</svg><div className="history-chart-x-labels"><span>{timeLabel(chronological[0])}</span><span>{timeLabel(chronological[Math.floor((chronological.length-1)/2)])}</span><span>{timeLabel(chronological[chronological.length-1])}</span></div></div> : <div className="history-chart-empty">ยังไม่มีค่าที่ใช้วาดกราฟในช่วงเวลานี้</div>}
    <p className="history-chart-note">เว้นเส้นเมื่อไม่มีข้อมูลต่อเนื่องเกิน {gapMinutes} นาที · กราฟเรียงเวลาจากเก่าไปใหม่{metric === "dc" ? " · แสดงค่าดิบโดยยังไม่ตีความหน่วย" : ""}</p>
  </section>;
}

function Overview({ onSelect, onNavigate, onAcknowledge, stationData, live, alarms, selectedStation, onCloseStation, onHistory }: { onSelect: (station: Station) => void; onNavigate: (view: View) => void; onAcknowledge: (alarm: Alarm) => void; stationData: Station[]; live: boolean; alarms: Alarm[]; selectedStation: Station | null; onCloseStation: () => void; onHistory: (station: Station) => void }) {
  const [autoHideRightPanels, setAutoHideRightPanels] = useState(false);
  const [rightPanelsPreferenceLoaded, setRightPanelsPreferenceLoaded] = useState(false);
  const [rightPanelsOpen, setRightPanelsOpen] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setAutoHideRightPanels(localStorage.getItem("nt-power-overview-auto-hide-right-panels") === "true"); } catch { /* Use the default layout when browser storage is unavailable. */ }
      setRightPanelsPreferenceLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!rightPanelsPreferenceLoaded) return;
    try { localStorage.setItem("nt-power-overview-auto-hide-right-panels", String(autoHideRightPanels)); } catch { /* Keep the layout preference in memory when browser storage is unavailable. */ }
  }, [autoHideRightPanels, rightPanelsPreferenceLoaded]);
  const [monitorMode, setMonitorMode] = useState(false);
  const [previewAcknowledgements, setPreviewAcknowledgements] = useState<Record<string, { acknowledgedAt: string; acknowledgedBy: string }>>({});
  const acknowledgeFromPreview = (alarm: Alarm) => {
    const acknowledgedAt = clockText(new Date().toISOString());
    setPreviewAcknowledgements(previous => ({ ...previous, [alarm.id]: { acknowledgedAt, acknowledgedBy: "คุณ" } }));
    onAcknowledge(alarm);
  };
  const displayAlarms: Alarm[] = alarms.map(alarm => previewAcknowledgements[alarm.id] ? { ...alarm, ...previewAcknowledgements[alarm.id] } : alarm);
  const displayStations = applyAlarmStatus(stationData, displayAlarms);
  const openAlarms = displayAlarms.filter(alarm => !alarm.resolvedAt);
  const count = (key: Station["status"]) => displayStations.filter(station => station.status === key).length;
  const hottestStations = [...stationData]
    .filter((station): station is Station & { temperature: number } => station.temperature !== null && Number.isFinite(station.temperature))
    .sort((a, b) => b.temperature - a.temperature)
    .slice(0, 5);
  const [temperatureChartStations, setTemperatureChartStations] = useState(hottestStations);
  const [temperatureReceivedAt, setTemperatureReceivedAt] = useState("รอข้อมูล");
  const [temperatureChartUpdatedAt, setTemperatureChartUpdatedAt] = useState("—");
  const temperaturePollCount = useRef(0);
  const hasLiveTemperatureSnapshot = useRef(false);
  useEffect(() => {
    const receivedAt = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setTemperatureReceivedAt(receivedAt);
    if (!live || !hasLiveTemperatureSnapshot.current) {
      setTemperatureChartStations(hottestStations);
      setTemperatureChartUpdatedAt(receivedAt);
      hasLiveTemperatureSnapshot.current = live;
      temperaturePollCount.current = 0;
      return;
    }
    temperaturePollCount.current += 1;
    if (temperaturePollCount.current >= 5) {
      setTemperatureChartStations(hottestStations);
      setTemperatureChartUpdatedAt(receivedAt);
      temperaturePollCount.current = 0;
    }
  }, [stationData, live]);
  const chartHottestTemperature = Math.max(...temperatureChartStations.map(station => station.temperature ?? 0), 0);
  const voltageAlarmStations = displayAlarms.filter(alarm => alarm.id.startsWith("VOLTAGE-LOW-") && !alarm.resolvedAt).map(alarm => alarm.id).sort().join("|");
  const mapVersion = `${displayStations.map(station => `${station.id}:${station.status}:${station.lat ?? ""}:${station.lon ?? ""}`).join("|")}:${voltageAlarmStations}`;
  const map = (className = "") => <ChiangMaiMap key={`${className}-${mapVersion}`} onSelect={onSelect} stationData={displayStations} alarmData={displayAlarms}/>;
  return <>
    <div className="page-heading"><div><div className="eyebrow">ข้อมูลจากอุปกรณ์ · node_date_time</div><h1>ภาพรวมระบบ</h1><p>ติดตามสถานะและข้อมูลพลังงานของสถานี NT เชียงใหม่</p></div><div className="heading-actions"><label className="right-panels-toggle"><input type="checkbox" checked={autoHideRightPanels} onChange={event=>{setAutoHideRightPanels(event.target.checked);setRightPanelsOpen(false);}}/><span>ซ่อนแผ่นงานด้านขวาอัตโนมัติ</span></label></div></div>
    <div className="stats-grid">
      <StatCard label="สถานีทั้งหมด" value={String(displayStations.length).padStart(2,"0")} note="ในพื้นที่เชียงใหม่" icon="pin" tone="blue" trend={live?"ฐานข้อมูล site_cmi":"ข้อมูลสาธิต"}/>
      <StatCard label="ปกติ" value={String(count("normal")).padStart(2,"0")} note="ส่งข้อมูลปกติและไม่มีแรงดันต่ำกว่าเกณฑ์" icon="check" tone="green" trend={`${Math.round(count("normal") / Math.max(displayStations.length, 1) * 100)}% ของสถานี`}/>
      <StatCard label="เฝ้าระวัง" value={String(count("warning")).padStart(2,"0")} note="มีเงื่อนไขที่ควรติดตาม" icon="bell" tone="amber" trend={`${count("warning")} รายการ`}/>
      <StatCard label="ขัดข้อง / ออฟไลน์" value={String(count("fault") + count("offline")).padStart(2,"0")} note={`ขัดข้อง ${count("fault")} · ออฟไลน์ ${count("offline")}`} icon="bolt" tone="red" trend="Alarm แรงดันต่ำกว่า 150 V"/>
    </div>
    <div className={`overview-grid${autoHideRightPanels ? ` right-panels-auto-hide${rightPanelsOpen ? " right-panels-open" : ""}` : ""}`}>
      <section className="panel map-panel">{map("overview")}<div className="map-legend"><span><i className="dot dot-normal"/>ปกติ <b>{count("normal")}</b></span><span><i className="dot dot-warning"/>เฝ้าระวัง <b>{count("warning")}</b></span><span><i className="dot dot-fault"/>ขัดข้อง <b>{count("fault")}</b></span><span><i className="dot dot-offline"/>ออฟไลน์ <b>{count("offline")}</b></span></div><DcVoltageBarChart stations={displayStations} live={live}/></section>
      <div className={`right-stack${autoHideRightPanels ? " right-stack-auto-hide" : ""}`} onPointerEnter={event=>{if(autoHideRightPanels&&event.pointerType==="mouse")setRightPanelsOpen(true);}} onPointerLeave={event=>{if(autoHideRightPanels&&event.pointerType==="mouse")setRightPanelsOpen(false);}}>{autoHideRightPanels&&<button type="button" className="right-stack-reveal" aria-label={rightPanelsOpen?"ซ่อนแผ่นงานด้านขวา":"แสดงแผ่นงานด้านขวา"} aria-expanded={rightPanelsOpen} onClick={()=>setRightPanelsOpen(open=>!open)}><span>{rightPanelsOpen?"ซ่อนแผ่นงาน":"แผ่นงาน"}</span><b aria-hidden="true">{rightPanelsOpen?"›":"‹"}</b></button>}<div className="right-stack-panels"><section className="panel temperature-panel"><div className="panel-heading"><div><h2>อุณหภูมิสูงสุด 5 สถานี</h2><p>เรียงจากค่าสูงสุด · °C</p></div><span className="demo-tag"><i/>{live?"ข้อมูลจริง":"ตัวอย่าง"}</span></div><div className="temperature-bars" role="list" aria-label="5 สถานีที่มีอุณหภูมิสูงสุด">{temperatureChartStations.length ? temperatureChartStations.map((station,index)=><div className="temperature-row" role="listitem" key={station.id} title={`${station.name}: ${station.temperature?.toFixed(1) ?? "—"} °C`}><span className="temperature-rank">{index+1}</span><span className="temperature-name">{station.name}</span><span className="temperature-track"><i style={{width:`${chartHottestTemperature > 0 ? (station.temperature ?? 0) / chartHottestTemperature * 100 : 0}%`}}/></span><b>{station.temperature?.toFixed(1) ?? "—"}<i>°C</i></b></div>) : <p className="temperature-empty">ยังไม่มีข้อมูลอุณหภูมิจากสถานี</p>}</div><div className="temperature-update" aria-live="polite"><span>รับข้อมูล {temperatureReceivedAt}</span><span>กราฟล่าสุด {temperatureChartUpdatedAt}{live ? " · ทุก 5 รอบ" : ""}</span></div></section>
      <section className="panel alarms-preview"><div className="panel-heading"><div><h2>การแจ้งเตือนล่าสุด</h2><p>เรียงตามเวลาเริ่มเหตุการณ์</p></div><button className="text-button" onClick={() => onNavigate("alarms")}>ทั้งหมด <Icon name="arrow" size={14}/></button></div><div className="alarm-preview-list">{displayAlarms.slice(0,3).map(alarm=><div className={`alarm-preview-item ${!alarm.acknowledgedAt&&!alarm.resolvedAt?"unacknowledged":""}`} key={alarm.id}><span className={`alarm-stripe ${alarm.severity}`}/><div><strong>{alarm.station}</strong><small>{alarm.title}</small><small className="alarm-preview-time">ตรวจพบ {alarm.started}{alarm.elapsedText ? ` · ผ่านมา ${alarm.elapsedText}` : ""}</small>{alarm.dcAtStart !== undefined && <small className="alarm-preview-extra">DC เริ่ม {alarm.dcAtStart?.toFixed(1) ?? "—"} · ล่าสุด {alarm.dcLatest?.toFixed(1) ?? "—"} <i>(load_dc)</i></small>}{alarm.backupHours && <small className="alarm-preview-backup">แบตเตอรี่สำรองโดยประมาณ {backupDurationLabel(alarm.backupHours)}</small>}{alarm.reminderStage && <small className="alarm-reminder-label">{alarm.reminderStage === 60 ? "ยกระดับ: เหตุค้างเกิน 1 ชั่วโมง" : "เตือนซ้ำ: ยังไม่มีผู้รับทราบ 30 นาที"}</small>}{alarm.acknowledgedAt&&<small className="alarm-preview-ack">รับทราบโดย {alarm.acknowledgedBy} · {alarm.acknowledgedAt}</small>}</div>{!alarm.acknowledgedAt&&!alarm.resolvedAt?<button type="button" className="alarm-preview-ack-button" aria-label={`รับทราบเหตุของสถานี ${alarm.station}`} onClick={event=>{event.preventDefault();event.stopPropagation();acknowledgeFromPreview(alarm);}}>รับทราบ</button>:<span className={`severity-dot ${alarm.severity}`}/>}</div>)}</div></section></div>
    </div></div>
    {selectedStation&&<StationDetail station={selectedStation} live={live} onClose={onCloseStation} onHistory={onHistory}/>}
    {monitorMode && <div className="monitor-fullscreen"><header className="monitor-fullscreen-header"><div><span className="live-indicator"><i/> DEMO · MONITOR</span><h2>แผนที่เฝ้าระวังสถานี</h2></div><button className="button button-primary monitor-exit" onClick={()=>setMonitorMode(false)}>กลับหน้าจอปกติ</button></header><div className="monitor-fullscreen-grid"><section className="panel monitor-fullscreen-map"><div className="panel-heading"><div><h2>สถานีทั้งหมด</h2><p>ชี้เพื่อดูชื่อ/สถานะ · คลิกเพื่อเปิดรายละเอียด</p></div><span className="demo-tag"><i/>ข้อมูลตัวอย่าง</span></div>{map("monitor")}<div className="map-legend"><span><i className="dot dot-normal"/>ปกติ <b>{count("normal")}</b></span><span><i className="dot dot-warning"/>เฝ้าระวัง <b>{count("warning")}</b></span><span><i className="dot dot-fault"/>ขัดข้อง <b>{count("fault")}</b></span><span><i className="dot dot-offline"/>ออฟไลน์ <b>{count("offline")}</b></span></div></section><section className="panel monitor-fullscreen-alerts"><div className="panel-heading"><div><h2>Alert ที่ต้องติดตาม</h2><p>เรียงตามสถานี</p></div><span className="severity-label critical">{openAlarms.length} เปิดอยู่</span></div>{openAlarms.map(alarm=><article className={"alarm-card " + alarm.severity} key={alarm.id}><div className="alarm-symbol"><Icon name="bolt" size={17}/></div><div className="alarm-body"><div className="alarm-heading"><span className="severity-label critical">วิกฤต</span><small>{alarm.started}</small></div><h3>{alarm.station}</h3><p className="alarm-detail">{alarm.title}</p><p>{alarm.stationId}</p>{alarm.dcAtStart !== undefined && <div className="alarm-event-readings"><span>DC ตอนเริ่ม <b>{alarm.dcAtStart?.toFixed(1) ?? "—"}</b></span><span>DC ล่าสุด <b>{alarm.dcLatest?.toFixed(1) ?? "—"}</b> <small>{clockText(alarm.dcLatestAt)}</small></span></div>}{alarm.backupHours && <p className="alarm-backup-estimate">แบตเตอรี่สำรองโดยประมาณ {backupDurationLabel(alarm.backupHours)} <small>(คำนวณจากค่าที่ตั้งไว้)</small></p>}{alarm.elapsedText && <p className="alarm-elapsed">ผ่านมาตั้งแต่ตรวจพบ {alarm.elapsedText}{alarm.reminderStage ? ` · ${alarm.reminderStage === 60 ? "ยกระดับเกิน 1 ชม." : "เตือนซ้ำ 30 นาที"}` : ""}</p>}</div></article>)}<button className="button button-primary monitor-alert-action" onClick={()=>{setMonitorMode(false);onNavigate("alarms")}}>เปิดศูนย์แจ้งเตือน</button></section></div></div>}
    <section className="panel station-list-panel"><div className="panel-heading"><div><h2>สถานีที่ต้องติดตาม</h2><p>สถานะอุปกรณ์และเวลาที่รับข้อมูล</p></div><button className="text-button" onClick={() => onNavigate("stations")}>ดูทั้งหมด <Icon name="arrow" size={14}/></button></div><StationTable rows={displayStations.filter(station => station.status !== "normal")} onSelect={onSelect}/></section>
  </>;
}

function StatCard({ label, value, note, icon, tone, trend }: { label: string; value: string; note: string; icon: string; tone: string; trend: string }) {
  return <div className={`stat-card stat-card-${tone}`}><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tone}`}><Icon name={icon} size={17}/></span></div><div className="stat-value">{value}</div><div className="stat-note">{note}</div><div className="stat-trend">{trend}</div></div>;
}

function StationTable({ rows, onSelect }: { rows: Station[]; onSelect: (s: Station) => void }) {
  const value = (n: number | null) => n === null ? "—" : n.toFixed(1);
  return <div className="table-wrap"><table><thead><tr><th>สถานี</th><th>สถานะ</th><th>ขาเข้า เฟส 1 (V)</th><th>เฟส 2 (V)</th><th>เฟส 3 (V)</th><th>โหลด AC (V)</th><th>โหลด DC*</th><th>อุณหภูมิ*</th><th>ความชื้น*</th><th>Wi‑Fi*</th><th>รับข้อมูลล่าสุด</th><th/></tr></thead><tbody>{rows.map(s=><tr key={s.id} onClick={()=>onSelect(s)} className="click-row"><td><div className="station-cell"><span className={`station-avatar ${s.status}`}><Icon name="bolt" size={15}/></span><span><strong>{s.name}</strong><small>{s.id} · อ. {s.district}</small></span></div></td><td><StatusPill status={s.status}/></td><td>{value(s.mainAc1)}</td><td>{value(s.mainAc2)}</td><td>{value(s.mainAc3)}</td><td>{value(s.loadAc)}</td><td>{value(s.loadDc)}</td><td>{s.temperature===null?"—":s.temperature.toFixed(1)}</td><td>{s.humidity===null?"—":s.humidity.toFixed(1)}</td><td>{s.wifi===null?"—":s.wifi}</td><td className={s.status === "offline" ? "muted" : ""}>{s.status === "offline" ? ageLabel(s.ageSeconds) : `วันนี้ ${s.updated}`}</td><td><Icon name="arrow" size={15}/></td></tr>)}</tbody></table><div className="table-footnote">* หน่วยของ load_dc และ Wi‑Fi รอยืนยันกับเจ้าของระบบ · ค่า — คือไม่มีข้อมูล</div></div>;
}

function StationsView({ onSelect, stationData, live, alarms }: { onSelect: (s: Station) => void; stationData: Station[]; live: boolean; alarms: Alarm[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const alarmAwareStations = useMemo(() => applyAlarmStatus(stationData, alarms), [stationData, alarms]);
  const rows = useMemo(() => alarmAwareStations.filter(s => (filter === "all" || s.status === filter) && `${s.name} ${s.id} ${s.district}`.toLowerCase().includes(query.toLowerCase())), [query, filter, alarmAwareStations]);
  return <><div className="page-heading"><div><div className="eyebrow">โครงสร้างสถานี</div><h1>สถานีและอุปกรณ์</h1><p>{live?"สถานะจาก node_date_time และค่าจากฐานข้อมูล iot.site_cmi":"ข้อมูลตัวอย่างเพื่อแสดงรูปแบบข้อมูลที่ระบบรองรับ"}</p></div><span className="demo-tag"><i/>{live?"MariaDB · อ่านอย่างเดียว":"ข้อมูลตัวอย่าง"}</span></div><section className="panel list-panel"><div className="toolbar"><label className="search-box"><Icon name="search" size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ค้นหาชื่อสถานี รหัส หรืออำเภอ"/></label><select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="กรองตามสถานะ"><option value="all">ทุกสถานะ</option><option value="normal">ปกติ</option><option value="warning">เฝ้าระวัง</option><option value="fault">ขัดข้อง</option><option value="offline">ออฟไลน์</option></select><span className="result-count">{rows.length} สถานี</span></div><StationTable rows={rows} onSelect={onSelect}/></section></>;
}

function StationDetail({ station, onClose, onHistory, live }: { station: Station; onClose: () => void; onHistory: (station: Station) => void; live: boolean }) {
  const metrics = [["ขาเข้า · เฟส 1","mainAc1"],["ขาเข้า · เฟส 2","mainAc2"],["ขาเข้า · เฟส 3","mainAc3"],["แรงดันโหลด AC","loadAc"]] as const;
  const rawCodes = [["common_alarm",station.commonAlarm],["node_status",station.nodeStatus],["main_fail",station.mainFail],["ATS",station.ats],["gen_on",station.genOn],["auto_block",station.autoBlock]] as const;
  const show = (value:number|null, digits=1) => value===null ? "—" : value.toFixed(digits);
  return <div className="detail-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><aside className="detail-drawer"><div className="drawer-top"><span className="eyebrow">รายละเอียดสถานี · {station.id}</span><button className="icon-button" onClick={onClose} aria-label="ปิด"><Icon name="close"/></button></div><div className="drawer-title"><div><h2>{station.name}</h2><p>อำเภอ{station.district} จังหวัดเชียงใหม่</p></div><StatusPill status={station.status}/></div><button className="button button-primary station-history-link" onClick={()=>onHistory(station)}><Icon name="chart" size={15}/> ดูประวัติของสถานีนี้</button><div className="detail-note"><Icon name="clock" size={16}/><span>รับข้อมูลล่าสุด <b>{station.status === "offline" ? `${ageLabel(station.ageSeconds)} · ไม่พบข้อมูลส่งเข้ามาใหม่` : `วันนี้ ${station.updated}`}</b></span></div><h3 className="section-label">แรงดันไฟฟ้า · หน่วย V</h3><div className="metric-grid">{metrics.map(([label,key])=><div className={`metric-box voltage-metric ${key}`} key={key}><small>{label}</small><strong>{station[key] === null ? "—" : station[key].toFixed(1)}</strong><span>V</span>{station[key] === null&&<em>ไม่มีข้อมูล</em>}</div>)}</div><p className="zero-note">ค่า 0 คือค่าที่วัดได้จริง · “—” หมายถึงไม่ได้รับข้อมูล</p><h3 className="section-label">สภาพแวดล้อม</h3><div className="environment-grid"><div className="environment-card"><span className="env-icon temperature">°</span><div><small>อุณหภูมิ</small><strong>{show(station.temperature)}<i>°C</i></strong></div><span className="env-source">temperature</span></div><div className="environment-card"><span className="env-icon humidity">%</span><div><small>ความชื้น</small><strong>{show(station.humidity)}<i>%</i></strong></div><span className="env-source">humidity</span></div><div className="environment-card"><span className="env-icon dc">DC</span><div><small>ค่าจาก load_dc</small><strong>{show(station.loadDc)}<i>หน่วยรอยืนยัน</i></strong></div><span className="env-source">load_dc</span></div><div className="environment-card"><span className="env-icon wifi">Wi</span><div><small>ค่า Wi‑Fi จากต้นทาง</small><strong>{station.wifi===null?"—":station.wifi}<i>หน่วยรอยืนยัน</i></strong></div><span className="env-source">wifi</span></div></div><h3 className="section-label">สถานะจากต้นทาง</h3><div className="raw-code-grid">{rawCodes.map(([key,value])=><div className="raw-code" key={key}><span>{key}</span><b>{value===null?"NULL":value}</b></div>)}</div><p className="code-caveat">แสดงรหัสดิบจากระบบต้นทาง ยังไม่แปลงเป็นความหมาย จนกว่าจะได้รับตารางอธิบายรหัส</p><section className="panel drawer-chart"><div className="panel-heading"><div><h3>แนวโน้มแรงดัน 24 ชั่วโมง</h3><p>{live?"ค่าเฉลี่ยทุก 5 นาทีจาก site_log":"ข้อมูลตัวอย่างเพื่อแสดงรูปแบบกราฟ"}</p></div><span className="chart-legend chart-legend-set"><i className="phase-1"/>F1 <i className="phase-2"/>F2 <i className="phase-3"/>F3 <i className="load-phase"/>Load AC <i className="threshold-line"/>150 V</span></div><PowerChart stationName={station.name} live={live}/></section><h3 className="section-label">อุปกรณ์ในสถานี</h3><div className="device-row"><span className="device-symbol"><Icon name="bolt"/></span><span><strong>Power meter</strong><small>PM-01 · ข้อมูลที่ใช้แสดงตัวอย่าง</small></span><StatusPill status={station.status}/></div><p className="data-caveat">ค่าทั้งหมดเป็นข้อมูลจำลอง ต้องตรวจสอบหน่วยและ payload จากระบบต้นทางก่อนเชื่อมต่อจริง</p></aside></div>;
}

function AlarmsView({ alarms, onAcknowledge, live }: { alarms: Alarm[]; onAcknowledge: (alarm: Alarm) => void; live: boolean }) {
  const [filter, setFilter] = useState("open");
  const visible = alarms.filter(a => filter === "all" || (filter === "open" ? !a.resolvedAt : filter === "unack" ? !a.acknowledgedAt && !a.resolvedAt : a.severity === filter));
  return <><div className="page-heading"><div><div className="eyebrow">เหตุการณ์และการรับทราบ</div><h1>ศูนย์แจ้งเตือน</h1><p>รับทราบและติดตาม Alarm โดยไม่เปลี่ยนสถานะอุปกรณ์ · ตรวจแรงดันต่ำกว่า 150 V แยกทุกเฟส</p></div><span className="demo-tag"><i/>{live?"กฎ Alarm · ข้อมูลจริง":"กฎ Alarm · ข้อมูลตัวอย่าง"}</span></div><div className="alarm-summary"><div><b>{alarms.filter(a=>!a.resolvedAt).length}</b><span>กำลังดำเนินการ</span></div><div><b>{alarms.filter(a=>!a.acknowledgedAt&&!a.resolvedAt).length}</b><span>ยังไม่รับทราบ</span></div><div><b>{alarms.filter(a=>a.resolvedAt).length}</b><span>คืนสู่ปกติแล้ว</span></div></div><section className="panel list-panel"><div className="toolbar"><div className="filter-tabs">{[["open","กำลังดำเนินการ"],["unack","ยังไม่รับทราบ"],["all","ทั้งหมด"],["critical","วิกฤต"],["warning","เฝ้าระวัง"]].map(([k,v])=><button key={k} className={filter===k?"active":""} onClick={()=>setFilter(k)}>{v}</button>)}</div></div><div className="alarm-list">{visible.map(a=><article className={`alarm-card ${a.severity} ${a.resolvedAt?"resolved":""}`} key={a.id}><div className="alarm-symbol"><Icon name={a.severity==="critical"?"bolt":"bell"}/></div><div className="alarm-body"><div className="alarm-heading"><div><span className={`severity-label ${a.severity}`}>{a.severity==="critical"?"วิกฤต":"เฝ้าระวัง"}</span><span className="alarm-id">{a.id}</span></div><small>เริ่ม {a.started}</small></div><h3>{a.station}</h3><p className="alarm-detail">{a.title}</p><p>{a.stationId}</p>{a.dcAtStart !== undefined && <div className="alarm-event-readings"><span>DC ตอนเริ่ม <b>{a.dcAtStart?.toFixed(1) ?? "—"}</b></span><span>DC ล่าสุด <b>{a.dcLatest?.toFixed(1) ?? "—"}</b> <small>{clockText(a.dcLatestAt)}</small></span></div>}{a.backupHours && <p className="alarm-backup-estimate">แบตเตอรี่สำรองโดยประมาณ {backupDurationLabel(a.backupHours)} <small>(คำนวณจากค่าที่ตั้งไว้)</small></p>}{a.elapsedText && <p className="alarm-elapsed">ผ่านมาตั้งแต่ตรวจพบ {a.elapsedText}{a.reminderStage ? ` · ${a.reminderStage === 60 ? "ยกระดับเกิน 1 ชม." : "เตือนซ้ำ 30 นาที"}` : ""}</p>}<div className="alarm-meta">{a.acknowledgedAt?<span className="acknowledged"><Icon name="check" size={14}/> รับทราบโดย {a.acknowledgedBy} เวลา {a.acknowledgedAt}</span>:<span className="pending-ack"><i/> ยังไม่รับทราบ</span>}{a.resolvedAt&&<span className="resolved-meta">คืนสู่ปกติ {a.resolvedAt}</span>}</div></div>{!a.acknowledgedAt&&!a.resolvedAt&&<button className="button button-primary acknowledge" onClick={()=>onAcknowledge(a)}>รับทราบ</button>}</article>)}</div>{visible.length===0&&<div className="empty-state">ไม่มีการแจ้งเตือนในหมวดนี้</div>}</section><p className="page-footnote">การรับทราบจะหยุดการกระพริบของสัญญาณเท่านั้น สถานะขัดข้องยังคงอยู่จนกว่าเหตุการณ์จะสิ้นสุด</p></>;
}

function HistoryView({ initialStation = "CM-001", stationData, live }: { initialStation?: string; stationData: Station[]; live: boolean }) {
  const [station, setStation] = useState(initialStation);
  const [kind, setKind] = useState("telemetry");
  const [query, setQuery] = useState("");
  const dateValue = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0,10); };
  const [from, setFrom] = useState(dateValue());
  const [to, setTo] = useState(dateValue());
  const [historyRows, setHistoryRows] = useState<HistoryRecord[]>([]);
  const [chartRange, setChartRange] = useState<HistoryChartRange>("1d");
  const [chartRows, setChartRows] = useState<HistoryRecord[]>([]);
  const [chartState, setChartState] = useState("เลือกสถานีเพื่อโหลดกราฟ");
  const [historyState, setHistoryState] = useState("กำลังโหลดข้อมูลย้อนหลัง…");
  const [historyLimitReached, setHistoryLimitReached] = useState(false);
  const demoRows = readings.filter(r=>r.time.includes(query));
  const activeStation = stationData.find(item=>item.id===station) ?? stations.find(item=>item.id===station);
  useEffect(() => { setStation(initialStation); }, [initialStation]);
  useEffect(() => { if (live && stationData.length && !stationData.some(item=>item.id===station)) setStation(stationData[0].id); }, [live, stationData, station]);
  useEffect(() => {
    if (!live || kind !== "telemetry") { setHistoryRows([]); setHistoryState(live ? "เลือกค่าทางไฟฟ้าเพื่ออ่านข้อมูลจาก site_log" : "ข้อมูลตัวอย่าง · ไม่ได้เชื่อมต่อฐานข้อมูล"); setHistoryLimitReached(false); return; }
    if (!station || !from || !to || from>to) { setHistoryRows([]); setHistoryState("กรุณาเลือกสถานีและช่วงวันที่ให้ถูกต้อง"); return; }
    let active = true;
    setHistoryState("กำลังโหลดข้อมูลจาก site_log…");
    const params = new URLSearchParams({format:"telemetry",station,from,to});
    void fetch("/api/history?"+params.toString(), {cache:"no-store"}).then(async response=>{
      const result = await response.json() as {rows?:typeof historyRows;error?:string;truncated?:boolean};
      if(!response.ok) throw new Error(result.error ?? "โหลดข้อมูลไม่สำเร็จ");
      if(active){setHistoryRows(result.rows ?? []);setHistoryLimitReached(Boolean(result.truncated));setHistoryState(result.rows?.length ? "ข้อมูลจริงจาก site_log · "+result.rows.length.toLocaleString("th-TH")+" รายการ" : "ไม่พบข้อมูลใน site_log สำหรับสถานีและช่วงวันที่นี้");}
    }).catch(error=>{if(active){setHistoryRows([]);setHistoryState(error instanceof Error ? error.message : "เชื่อมต่อ site_log ไม่สำเร็จ");}});
    return ()=>{active=false;};
  }, [station,from,to,kind,live]);
  useEffect(() => {
    if (!live || kind !== "telemetry" || !station) {
      setChartRows([]);
      setChartState(live ? "กราฟจะแสดงเมื่อเลือกค่าทางไฟฟ้า" : "กราฟข้อมูลจริงต้องเชื่อมต่อฐานข้อมูลก่อน");
      return;
    }
    let active = true;
    let firstLoad = true;
    const refreshChart = async () => {
      if (firstLoad) setChartState("กำลังโหลดกราฟจาก site_log…");
      try {
        const params = new URLSearchParams({ format: "chart", station, range: chartRange });
        const response = await fetch("/api/history?" + params.toString(), { cache: "no-store" });
        const result = await response.json() as { points?: HistoryRecord[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "โหลดกราฟไม่สำเร็จ");
        if (active) {
          const points = result.points ?? [];
          setChartRows(points);
          const updatedAt = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          setChartState(points.length ? `${points.length.toLocaleString("th-TH")} จุดสรุป · อัปเดต ${updatedAt}` : "ไม่พบข้อมูลในช่วงเวลาที่เลือก");
        }
      } catch (error) {
        if (active) setChartState(error instanceof Error ? error.message : "เชื่อมต่อข้อมูลกราฟไม่สำเร็จ");
      } finally { firstLoad = false; }
    };
    void refreshChart();
    const timer = chartRange === "realtime" ? window.setInterval(() => void refreshChart(), 30_000) : undefined;
    return () => { active = false; if (timer) window.clearInterval(timer); };
  }, [station, chartRange, kind, live]);
  const visibleHistoryRows = historyRows.filter(row=>!query || row.dt.includes(query));
  const csvCell = (value:unknown) => '"'+(value===null || value===undefined ? "" : String(value)).replaceAll('"','""')+'"';
  function exportCsv() {
    const header = kind === "telemetry" && live ? "datetime,station,main_ac1_V,main_ac2_V,main_ac3_V,load_ac_V,load_dc_raw,temperature_C,humidity_pct\n" : kind === "telemetry" ? "time,main_ac1_V,main_ac2_V,main_ac3_V,load_ac_V,load_dc_raw,temperature_C,humidity_pct,wifi_raw\n" : kind === "incident" ? "incident_id,snapshot,time,main_ac1_V,main_ac2_V,main_ac3_V,load_ac_V,load_dc_raw,gen_on_raw\n" : "time,alarm,severity,station\n";
    const body = kind === "telemetry" && live ? visibleHistoryRows.map(r=>[r.dt,r.station,r.mainAc1,r.mainAc2,r.mainAc3,r.loadAc,r.loadDc,r.temperature,r.humidity].map(csvCell).join(",")).join("\n") : kind === "telemetry" ? demoRows.map(r=>[r.time,r.mainAc1,r.mainAc2,r.mainAc3,r.loadAc,r.loadDc,r.temperature,r.humidity,r.wifi].map(csvCell).join(",")).join("\n") : kind === "incident" ? incidentSample.snapshots.map(s=>[incidentSample.id,s.label,s.time,s.mainAc1,s.mainAc2,s.mainAc3,s.loadAc,s.loadDc,s.genOn].map(csvCell).join(",")).join("\n") : initialAlarms.map(a=>[a.started,a.title,a.severity,a.station].map(csvCell).join(",")).join("\n");
    const blob = new Blob(["\ufeff", header, body], {type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href=url; link.download="nt-power-"+kind+"-"+station+".csv"; link.click(); URL.revokeObjectURL(url);
  }
  const incident = kind === "incident";
  return <><div className="page-heading"><div><div className="eyebrow">ข้อมูลย้อนหลัง</div><h1>ประวัติและส่งออก</h1><p>ค้นหาค่าทางไฟฟ้า สภาพแวดล้อม Alarm และวิเคราะห์เหตุขัดข้อง</p></div><span className="demo-tag"><i/>{kind!=="telemetry"||!live?"ข้อมูลตัวอย่าง":"ข้อมูลจริง · MariaDB"}</span></div><section className="panel history-filter"><div className="form-grid"><label>สถานี<select value={station} onChange={e=>setStation(e.target.value)}>{(live?stationData:stations).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>ประเภทข้อมูล<select value={kind} onChange={e=>setKind(e.target.value)}><option value="telemetry">ค่าทางไฟฟ้าและสภาพแวดล้อม</option><option value="alarms">ประวัติ Alarm</option><option value="incident">วิเคราะห์เหตุขัดข้อง</option></select></label><label>ตั้งแต่<input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label><label>ถึง<input type="date" value={to} min={from} onChange={e=>setTo(e.target.value)}/></label></div><div className="filter-bottom"><p><Icon name="clock" size={15}/> {kind==="telemetry"?(live?"ค้นจาก site_log · จำกัด 5,000 รายการ":"โหมดตัวอย่าง · ไม่ใช่ข้อมูลจริง"):"Alarm และวิเคราะห์เหตุการณ์ยังเป็นข้อมูลตัวอย่าง"}</p><button className="button button-primary" onClick={exportCsv} disabled={kind==="telemetry"?(live?visibleHistoryRows.length===0:demoRows.length===0):false}><Icon name="download" size={16}/> ส่งออก CSV</button></div></section>{kind === "telemetry" && live && <section className="panel history-trends"><div className="history-trends-toolbar"><div><h2>กราฟแนวโน้ม</h2><p>ช่วงเวลานี้ใช้กับกราฟ · วันที่ด้านบนใช้กรองตารางและ CSV</p></div><div className="filter-tabs history-range-tabs" role="group" aria-label="ช่วงเวลาของกราฟ">{[["realtime","เรียลไทม์ · 1 ชม."],["3h","3 ชั่วโมง"],["1d","1 วัน"],["3d","3 วัน"],["1w","1 สัปดาห์"]].map(([value,label])=><button key={value} className={chartRange===value?"active":""} aria-pressed={chartRange===value} onClick={()=>setChartRange(value as HistoryChartRange)}>{label}</button>)}</div></div><p className="history-trends-state" role="status">{chartState}</p><div className="history-chart-grid"><HistoryTrendChart rows={chartRows} metric="voltage" gapMinutes={chartRange==="1w"?120:chartRange==="3d"?45:15}/><HistoryTrendChart rows={chartRows} metric="temperature" gapMinutes={chartRange==="1w"?120:chartRange==="3d"?45:15}/><HistoryTrendChart rows={chartRows} metric="dc" gapMinutes={chartRange==="1w"?120:chartRange==="3d"?45:15}/></div></section>}<section className="panel list-panel history-results"><div className="panel-heading"><div><h2>{kind==="telemetry"?"ค่าจากสถานี":incident?"วิเคราะห์เหตุการณ์":"ประวัติ Alarm"}</h2><p>{activeStation?.name??station} · {kind==="telemetry"&&live?from+" ถึง "+to+" · MariaDB / site_log":"ข้อมูลตัวอย่าง"}</p></div>{!incident&&<label className="search-box compact"><Icon name="search" size={16}/><input placeholder="ค้นหาเวลา" value={query} onChange={e=>setQuery(e.target.value)}/></label>}</div>{kind==="telemetry"?<div className="table-wrap"><table><thead><tr><th>เวลาในบันทึก</th><th>สถานี</th><th>เฟส 1 (V)</th><th>เฟส 2 (V)</th><th>เฟส 3 (V)</th><th>โหลด AC (V)</th><th>load_dc*</th><th>อุณหภูมิ (°C)</th><th>ความชื้น (%)</th></tr></thead><tbody>{live?visibleHistoryRows.map((r,i)=><tr key={r.dt+"-"+i}><td>{r.dt}</td><td>{r.station}</td><td>{r.mainAc1?.toFixed(1)??"—"}</td><td>{r.mainAc2?.toFixed(1)??"—"}</td><td>{r.mainAc3?.toFixed(1)??"—"}</td><td>{r.loadAc?.toFixed(1)??"—"}</td><td>{r.loadDc?.toFixed(2)??"—"}</td><td>{r.temperature?.toFixed(1)??"—"}</td><td>{r.humidity?.toFixed(1)??"—"}</td></tr>):demoRows.map(r=><tr key={r.time}><td>23 ต.ค. 2569 · {r.time}</td><td>{activeStation?.name??station}</td><td>{r.mainAc1.toFixed(1)}</td><td>{r.mainAc2.toFixed(1)}</td><td>{r.mainAc3.toFixed(1)}</td><td>{r.loadAc.toFixed(1)}</td><td>{r.loadDc.toFixed(2)}</td><td>{r.temperature.toFixed(1)}</td><td>{r.humidity.toFixed(1)}</td></tr>)}</tbody></table></div>:incident?<><div className="incident-overview"><div className="incident-title"><span className="incident-icon"><Icon name="bolt" size={18}/></span><div><b>{incidentSample.title}</b><small>{incidentSample.id} · สถานี {incidentSample.stationId} · เริ่ม 23 ต.ค. 2569 เวลา {incidentSample.startedAt}</small></div></div><div className="incident-duration"><small>ระยะเวลาที่ผ่านไป</small><strong>{incidentSample.elapsed}</strong><span>ยังไม่พบเวลาสิ้นสุดเหตุ</span></div></div><div className="incident-table-wrap"><table><thead><tr><th>ช่วงเหตุการณ์</th><th>เวลา</th><th>ขาเข้า F1 (V)</th><th>F2 (V)</th><th>F3 (V)</th><th>โหลด AC (V)</th><th>load_dc*</th><th>gen_on · รหัสดิบ</th></tr></thead><tbody>{incidentSample.snapshots.map(s=><tr key={s.label}><td><span className={s.label==="ค่าล่าสุด"?"incident-stage latest":"incident-stage"}>{s.label}</span></td><td>{s.time}</td><td>{s.mainAc1.toFixed(1)}</td><td>{s.mainAc2.toFixed(1)}</td><td>{s.mainAc3.toFixed(1)}</td><td>{s.loadAc.toFixed(1)}</td><td><b>{s.loadDc.toFixed(2)}</b></td><td><code>{s.genOn}</code></td></tr>)}</tbody></table></div><div className="incident-caveats"><span>ตัวอย่างนี้เป็นข้อมูลจำลองเพื่อสาธิตการเปรียบเทียบ</span><span>load_dc ยังไม่ยืนยันหน่วย · gen_on แสดงรหัสดิบ ยังไม่สรุปว่า GEN ทำงานหรือไม่</span></div></>:<div className="table-wrap"><table><thead><tr><th>เวลาเริ่ม</th><th>เหตุการณ์</th><th>ระดับ</th><th>สถานะ</th></tr></thead><tbody>{initialAlarms.map(a=><tr key={a.id}><td>{a.started}</td><td>{a.title}</td><td>{a.severity==="critical"?"วิกฤต":"เฝ้าระวัง"}</td><td>{a.resolvedAt?"คืนสู่ปกติ":a.acknowledgedAt?"รับทราบแล้ว":"กำลังดำเนินการ"}</td></tr>)}</tbody></table><div className="table-footnote">ประวัติ Alarm นี้ยังเป็นข้อมูลตัวอย่าง ไม่มีตารางเก็บเหตุการณ์ย้อนหลัง</div></div>}{kind==="telemetry"&&<div className="table-footnote" role="status">{live?historyState:"ข้อมูลตัวอย่าง · ยังไม่ได้เชื่อมต่อฐานข้อมูล"}{historyLimitReached&&" · แสดงสูงสุด 5,000 รายการ กรุณาจำกัดช่วงวันที่"}<br/>* load_dc แสดงค่าดิบ หน่วยยังรอยืนยัน</div>}</section></>;
}

function StationSettingsView({ stationData, configs, onSave, powerConfigs, onSavePower, configError }: { stationData: Station[]; configs: Record<string, StationElectricalConfig>; onSave: (stationId: string, config: StationElectricalConfig) => Promise<boolean>; powerConfigs: Record<string, StationPowerConfig>; onSavePower: (stationId: string, config: StationPowerConfig) => Promise<boolean>; configError: string }) {
  const [drafts, setDrafts] = useState<Record<string, StationElectricalConfig>>({});
  const [powerDrafts, setPowerDrafts] = useState<Record<string, StationPowerConfig>>({});
  const [activeTab, setActiveTab] = useState<StationConfigTab>("electrical");
  const [selectedStationId, setSelectedStationId] = useState(stationData[0]?.id ?? "");
  const [pendingSave, setPendingSave] = useState<PendingStationSave | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const configFor = (stationId: string) => drafts[stationId] ?? configs[stationId] ?? defaultStationConfig();
  const powerConfigFor = (stationId: string) => powerDrafts[stationId] ?? powerConfigs[stationId] ?? defaultStationPowerConfig();
  const selectedStation = stationData.find(station => station.id === selectedStationId) ?? stationData[0];
  const unconfirmedCount = stationData.filter(station => !(configs[station.id]?.confirmed)).length;
  const edit = (stationId: string, changes: Partial<StationElectricalConfig>) => {
    setDrafts(previous => ({ ...previous, [stationId]: { ...configFor(stationId), ...changes } }));
  };
  const completeSave = async () => {
    if (!pendingSave) return;
    const category = pendingSave.kind === "electrical" ? "ระบบไฟฟ้า" : pendingSave.kind === "battery" ? "Battery Backup" : "เครื่องกำเนิดไฟฟ้า";
    setSaving(true);
    setSaveError(null);
    try {
      let saved = false;
      if (pendingSave.kind === "electrical" && pendingSave.electricalConfig) {
        const config = { ...pendingSave.electricalConfig, confirmed: true };
        saved = await onSave(pendingSave.stationId, config);
        if (saved) setDrafts(previous => ({ ...previous, [pendingSave.stationId]: config }));
      } else if (pendingSave.powerConfig) saved = await onSavePower(pendingSave.stationId, pendingSave.powerConfig);
      if (!saved) throw new Error("บันทึกคอนฟิกไม่สำเร็จ กรุณาตรวจสอบ SUPABASE_SECRET_KEY ใน Vercel > Settings > Environment Variables และตรวจว่าเลือก Production แล้ว deploy ใหม่");
      setPendingSave(null);
      setSaveSuccess(`บันทึก${category}ของสถานี ${pendingSave.stationName} ลงฐานข้อมูลส่วนกลางเรียบร้อยแล้ว`);
    } catch (error) {
      setPendingSave(null);
      setSaveError(error instanceof Error ? error.message : "บันทึกคอนฟิกไม่สำเร็จ กรุณาตรวจสอบการตั้งค่า Supabase ใน Vercel");
    } finally {
      setSaving(false);
    }
  };
  return <>
    <div className="page-heading"><div><div className="eyebrow">ตั้งค่าได้โดยผู้เข้าชมทุกคน</div><h1>กำหนดค่าสถานี</h1><p>ข้อมูลระบบไฟฟ้า แบตเตอรี่สำรอง และเครื่องกำเนิดไฟฟ้ารายสถานี</p></div><span className="demo-tag"><i/>บันทึกส่วนกลาง</span></div>
    {configError&&<div className="auth-error" role="alert">{configError}</div>}
    <div className="health-banner station-config-notice"><span className="health-symbol"><Icon name="settings" size={21}/></span><div><strong>คอนฟิกชุดเดียวกันสำหรับผู้ใช้ที่อนุมัติแล้ว</strong><p>ข้อมูลบันทึกใน Supabase เพื่อใช้แสดงผลและคำนวณเท่านั้น · ไม่ส่งคำสั่งควบคุมอุปกรณ์</p></div><span className="tag-neutral">{unconfirmedCount} ระบบไฟรอยืนยัน</span></div>
    <div className="station-config-tabs" role="tablist" aria-label="หมวดการตั้งค่าสถานี">
      <button role="tab" aria-selected={activeTab === "electrical"} className={activeTab === "electrical" ? "active" : ""} onClick={() => setActiveTab("electrical")}>1 · ระบบไฟฟ้า</button>
      <button role="tab" aria-selected={activeTab === "battery"} className={activeTab === "battery" ? "active" : ""} onClick={() => setActiveTab("battery")}>2 · Battery Backup</button>
      <button role="tab" aria-selected={activeTab === "generator"} className={activeTab === "generator" ? "active" : ""} onClick={() => setActiveTab("generator")}>3 · เครื่องกำเนิดไฟฟ้า</button>
    </div>
    {activeTab === "electrical" ? <section className="station-config-list" aria-label="การตั้งค่าไฟฟ้ารายสถานี">{stationData.map(station => {
      const config = configFor(station.id);
      return <article className="panel station-config-card" key={station.id}>
        <div className="station-config-title"><div><h2>{station.name}</h2><p>{station.id} · {station.status === "offline" ? "ออฟไลน์" : "รับข้อมูลอยู่"}</p></div><span className={config.confirmed ? "tag-neutral config-confirmed" : "tag-neutral config-pending"}>{config.confirmed ? "ยืนยันแล้ว" : "รอตรวจสอบ"}</span></div>
        <div className="station-config-fields">
          <label>ระบบไฟ<select value={config.phaseMode} onChange={event => edit(station.id, { phaseMode: event.target.value as "single" | "three" })}><option value="three">Three phase · 3 เฟส</option><option value="single">Single phase · 1 เฟส</option></select></label>
          {config.phaseMode === "single" && <label>เฟส/ช่องวัดที่ใช้งาน<select value={config.singlePhase} onChange={event => edit(station.id, { singlePhase: event.target.value as StationElectricalConfig["singlePhase"] })}><option value="F1">F1 · main_ac1</option><option value="F2">F2 · main_ac2</option><option value="F3">F3 · main_ac3</option></select></label>}
          <label>แจ้งเตือนเมื่อแรงดันต่ำกว่า<input type="number" min="1" max="500" step="1" value={config.threshold} onChange={event => edit(station.id, { threshold: Number(event.target.value) || 1 })}/></label>
          <button className="button button-primary" onClick={() => setPendingSave({ kind: "electrical", stationId: station.id, stationName: station.name, electricalConfig: config })}>{config.confirmed ? "บันทึกการแก้ไข" : "ยืนยันและบันทึก"}</button>
        </div>
        {config.phaseMode === "single" && <small className="station-config-help">ระบบจะตรวจเฉพาะ {config.singlePhase} และไม่สร้าง Alarm จากอีก 2 เฟส</small>}
      </article>;
    })}</section> : <section className="panel station-infrastructure-panel">
      <div className="station-config-toolbar"><div><h2>{activeTab === "battery" ? "ข้อมูลแบตเตอรี่สำรอง" : "ข้อมูลเครื่องกำเนิดไฟฟ้า"}</h2><p>เลือกสถานีเพื่อกำหนดอุปกรณ์และค่าประมาณการ</p></div><label>สถานี<select value={selectedStation?.id ?? ""} onChange={event => setSelectedStationId(event.target.value)}>{stationData.map(station => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label></div>
      {selectedStation && (() => {
        const config = powerConfigFor(selectedStation.id);
        const update = (changes: Partial<StationPowerConfig>) => setPowerDrafts(previous => ({ ...previous, [selectedStation.id]: { ...config, ...changes } }));
        const save = () => setPendingSave({ kind: activeTab, stationId: selectedStation.id, stationName: selectedStation.name, powerConfig: config });
        const numberField = (label: string, key: keyof StationPowerConfig, unit: string, min = 0, step = 1) => <label>{label}<div className="config-number-input"><input type="number" min={min} step={step} value={config[key]} onChange={event => update({ [key]: Math.max(min, Number(event.target.value) || 0) })}/><span>{unit}</span></div></label>;
        if (activeTab === "battery") {
          const nominalVoltage = config.batteryUnitVoltage * config.batterySeries;
          const totalAh = config.batteryUnitAh * config.batteryStrings;
          const estimatedHours = config.dcLoadWatts > 0 && config.batteryUnitAh > 0 ? (nominalVoltage * totalAh * config.batteryUsablePercent / 100 * config.batteryEfficiencyPercent / 100) / config.dcLoadWatts : null;
          return <div className="station-infrastructure-body"><div className="station-infrastructure-fields">
            {numberField("แรงดันแบตเตอรี่ต่อก้อน", "batteryUnitVoltage", "V", 0, 0.1)}{numberField("ความจุต่อก้อน", "batteryUnitAh", "Ah", 0, 1)}{numberField("จำนวนก้อนต่ออนุกรม", "batterySeries", "ก้อน", 1)}{numberField("จำนวนชุดขนาน", "batteryStrings", "ชุด", 1)}{numberField("สัดส่วนพลังงานที่นำมาใช้ได้", "batteryUsablePercent", "%", 1)}{numberField("ประสิทธิภาพระบบโดยประมาณ", "batteryEfficiencyPercent", "%", 1)}{numberField("กำลังโหลด DC รวม", "dcLoadWatts", "W", 0, 1)}
          </div><div className="backup-estimate"><span className="health-symbol"><Icon name="clock" size={19}/></span><div><small>เวลาสำรองโดยประมาณ</small><strong>{estimatedHours === null ? "กรอกความจุแบตเตอรี่และโหลด DC" : estimatedHours >= 24 ? `${(estimatedHours / 24).toFixed(1)} วัน (${estimatedHours.toFixed(1)} ชม.)` : `${estimatedHours.toFixed(1)} ชั่วโมง`}</strong><p>คำนวณจากแรงดัน × Ah × พลังงานใช้ได้ × ประสิทธิภาพ ÷ โหลด W</p></div></div><p className="station-config-help">ผลจริงขึ้นกับอายุแบตเตอรี่ อุณหภูมิ รูปแบบโหลด และแรงดันตัดของอุปกรณ์ · ค่า load_dc จากระบบยังไม่ยืนยันหน่วย จึงยังไม่นำมาคำนวณอัตโนมัติ</p><button className="button button-primary infrastructure-save" onClick={save}>บันทึกข้อมูลแบตเตอรี่</button></div>;
        }
        const generatorHours = config.generatorFuelUseLitersPerHour > 0 && config.generatorFuelLiters > 0 ? config.generatorFuelLiters / config.generatorFuelUseLitersPerHour : null;
        return <div className="station-infrastructure-body"><div className="station-infrastructure-fields">{numberField("จำนวนเครื่อง", "generatorCount", "เครื่อง", 1)}{numberField("กำลังเครื่องกำเนิดต่อเครื่อง", "generatorKva", "kVA", 0, 0.1)}{numberField("ปริมาณน้ำมันพร้อมใช้งานรวม", "generatorFuelLiters", "ลิตร", 0, 1)}{numberField("อัตราสิ้นเปลืองรวมของเครื่องที่ทำงาน", "generatorFuelUseLitersPerHour", "ลิตร/ชม.", 0, 0.1)}</div><div className="backup-estimate"><span className="health-symbol"><Icon name="bolt" size={19}/></span><div><small>เวลาทำงานโดยประมาณจากน้ำมันพร้อมใช้</small><strong>{generatorHours === null ? "กรอกน้ำมันในถังและอัตราสิ้นเปลือง" : `${generatorHours.toFixed(1)} ชั่วโมง`}</strong><p>ยังไม่รวมการสำรองน้ำมันและการเปลี่ยนแปลงโหลด</p></div></div><p className="station-config-help">ค่าที่บันทึกเป็นข้อมูลอ้างอิงเท่านั้น · สถานะ GEN จริงยังต้องอ่านจากสัญญาณ gen_on และยืนยันรูปแบบค่าจากอุปกรณ์</p><button className="button button-primary infrastructure-save" onClick={save}>บันทึกข้อมูลเครื่องกำเนิด</button></div>;
      })()}
    </section>}
    {pendingSave && <SweetAlertPopup mode="confirm" title="ยืนยันการบันทึก?" message={`ต้องการบันทึก${pendingSave.kind === "electrical" ? "ระบบไฟฟ้า" : pendingSave.kind === "battery" ? "Battery Backup" : "เครื่องกำเนิดไฟฟ้า"}ของสถานี ${pendingSave.stationName} ใช่หรือไม่`} onCancel={() => setPendingSave(null)} onConfirm={completeSave} busy={saving}/>}
    {saveError && <SweetAlertPopup mode="error" title="บันทึกไม่สำเร็จ" message={saveError} onClose={() => setSaveError(null)}/>}
    {saveSuccess && <SweetAlertPopup mode="success" title="บันทึกสำเร็จ" message={saveSuccess} onClose={() => setSaveSuccess(null)}/>}
  </>;
}

type HealthProbe<T = unknown> = { status: "healthy" | "degraded" | "offline" | "not_configured"; latencyMs: number | null; detail: string; data?: T };
type HealthAuditEntry = { id: number; actor: string; action: string; target: string | null; summary: string; created_at: string };
type SystemHealth = {
  checkedAt: string;
  services: {
    backend: HealthProbe;
    mariadb: HealthProbe<{ stationCount: number; logCount: number; latestLogAt: string | null }>;
    supabase: HealthProbe<{ users: number; admins: number; approved: number; configurations: number }>;
    mqtt: HealthProbe;
    pipeline: HealthProbe;
    audit: HealthProbe<{ entries: HealthAuditEntry[]; count: number }>;
  };
};

const healthLabels: Record<HealthProbe["status"], string> = {
  healthy: "ใช้งานได้",
  degraded: "ทำงานบางส่วน",
  offline: "เชื่อมต่อไม่ได้",
  not_configured: "ยังไม่ได้ตั้งค่า",
};

function SystemView() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const result = await response.json() as SystemHealth & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "ตรวจสุขภาพระบบไม่สำเร็จ");
      setHealth(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ตรวจสุขภาพระบบไม่สำเร็จ");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    const interval = window.setInterval(() => { void load(); }, 30_000);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); };
  }, [load]);

  const services = health ? [
    ["Backend API", "backend", health.services.backend],
    ["MariaDB · site_cmi / site_log", "database", health.services.mariadb],
    ["Supabase · profiles / station_configs", "pipeline", health.services.supabase],
    ["MQTT Broker", "mqtt", health.services.mqtt],
    ["Data pipeline", "pipeline", health.services.pipeline],
  ] as const : [];
  const systemHealthy = health?.services.mariadb.status === "healthy" && health.services.supabase.status === "healthy";
  const thaiDate = (value: string | null | undefined) => value ? new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "ยังไม่มีข้อมูล";
  const supabaseData = health?.services.supabase.data;
  const mariaData = health?.services.mariadb.data;
  const auditData = health?.services.audit.data;

  return <>
    <div className="page-heading"><div><div className="eyebrow">การดูแลและตรวจสอบ</div><h1>สุขภาพระบบ</h1><p>ตรวจการเชื่อมต่อจริงและเวลาเช็กล่าสุด · อัปเดตอัตโนมัติทุก 30 วินาที</p></div><button className="button button-quiet" onClick={() => void load()} disabled={loading}>{loading ? "กำลังตรวจ…" : "ตรวจอีกครั้ง"}</button></div>
    <div className={`health-banner ${health ? systemHealthy ? "health-healthy" : "health-degraded" : ""}`}><span className="health-symbol"><Icon name={systemHealthy ? "check" : "settings"} size={21}/></span><div><strong>{error ? "ตรวจสอบระบบไม่สำเร็จ" : !health ? "กำลังตรวจบริการ…" : systemHealthy ? "บริการฐานข้อมูลพร้อมใช้งาน" : "มีบริการที่ต้องตรวจสอบ"}</strong><p>{health ? `ตรวจล่าสุด ${thaiDate(health.checkedAt)} · เวลาไทย` : error || "กำลังทดสอบ MariaDB และ Supabase"}</p></div><span className="tag-neutral">{health ? systemHealthy ? "LIVE" : "ตรวจพบปัญหา" : "รอตรวจ"}</span></div>
    <section className="panel service-panel"><div className="panel-heading"><div><h2>ผลตรวจบริการ</h2><p>ทดสอบการอ่านตารางที่ระบบใช้งานจริง</p></div><span className="last-check">ตรวจซ้ำทุก 30 วินาที</span></div><div className="service-list">{services.map(([name, key, probe]) => <div className="service-item" key={name}><span className={`service-icon ${key}`}><Icon name={key === "mqtt" ? "bolt" : key === "backend" ? "settings" : key === "database" ? "chart" : "check"} size={17}/></span><div className="service-info"><strong>{name}</strong><small>{probe.detail}</small></div><span className={`service-state ${probe.status}`}><i/>{healthLabels[probe.status]}{probe.latencyMs !== null ? ` · ${probe.latencyMs} ms` : ""}</span></div>)}</div></section>
    <div className="admin-grid system-health-grid"><section className="panel"><div className="panel-heading"><div><h2>ข้อมูลที่ตรวจพบ</h2><p>นับจากฐานข้อมูลจริง ณ เวลาตรวจล่าสุด</p></div></div><div className="system-metric-list"><div><span>MariaDB · สถานี</span><strong>{mariaData ? mariaData.stationCount.toLocaleString("th-TH") : "—"}</strong></div><div><span>MariaDB · รายการ site_log</span><strong>{mariaData ? mariaData.logCount.toLocaleString("th-TH") : "—"}</strong></div><div><span>site_log ล่าสุด</span><strong>{thaiDate(mariaData?.latestLogAt)}</strong></div><div><span>Supabase · ผู้ใช้ (Admin)</span><strong>{supabaseData ? `${supabaseData.users} (${supabaseData.admins})` : "—"}</strong></div><div><span>Supabase · คอนฟิกสถานี</span><strong>{supabaseData ? supabaseData.configurations : "—"}</strong></div><div><span>สถานะ Login</span><strong>เปิดใช้งาน · Admin / User</strong></div></div></section><section className="panel"><div className="panel-heading"><div><h2>Audit Log</h2><p>บันทึกการแก้คอนฟิกและจัดการผู้ใช้</p></div><span className="tag-neutral">{auditData ? `${auditData.count} รายการ` : "ยังไม่พร้อม"}</span></div>{auditData?.entries.length ? <div className="system-audit-list">{auditData.entries.map(entry => <div className="system-audit-item" key={entry.id}><span className="audit-dot blue"/><div><strong>{entry.summary}</strong><small>{entry.actor}{entry.target ? ` · ${entry.target}` : ""}</small></div><time>{thaiDate(entry.created_at)}</time></div>)}</div> : <p className="system-audit-empty">{health ? health.services.audit.detail : "กำลังโหลดประวัติ…"}</p>}</section></div>
    <section className="panel system-capabilities"><div className="panel-heading"><div><h2>ขอบเขตบริการ</h2><p>สิ่งที่ระบบทำได้และยังไม่ได้เชื่อมต่อ</p></div></div><p><strong>Data pipeline:</strong> อ่านค่า telemetry จาก MariaDB และบันทึกคอนฟิก/บัญชีลง Supabase ผ่าน API ฝั่งเซิร์ฟเวอร์ ระบบยังไม่ส่งคำสั่งควบคุมอุปกรณ์</p><p><strong>MQTT:</strong> ยังไม่ตั้งค่า Broker จึงไม่มีการรับส่งข้อมูล MQTT</p><p><strong>Audit Log:</strong> บันทึกการแก้คอนฟิกและการจัดการบัญชีลง Supabase</p></section>
  </>;
}

function Dashboard() {
  const { profile, logout } = useAppAuth();
  const isAdmin = profile.role === "admin";
  const [view, setView] = useState<View>("overview");  const [historyStation, setHistoryStation] = useState("CM-001");
  const [stationData, setStationData] = useState<Station[]>(stations);
  const [liveData, setLiveData] = useState(false);
  const [databaseOnline, setDatabaseOnline] = useState(false);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [alarms, setAlarms] = useState(initialAlarms);
  const [outageIncidents, setOutageIncidents] = useState<OutageIncident[]>([]);
  const [outageIncidentsLoaded, setOutageIncidentsLoaded] = useState(false);
  const [reminderNotice, setReminderNotice] = useState<{ title: string; message: string; stage: 30 | 60 } | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [stationConfigs, setStationConfigs] = useState<Record<string, StationElectricalConfig>>({});
  const [stationPowerConfigs, setStationPowerConfigs] = useState<Record<string, StationPowerConfig>>({});
  const [configError, setConfigError] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("nt-power-outage-incidents-v1");
      if (saved) {
        const parsed = JSON.parse(saved) as OutageIncident[];
        if (Array.isArray(parsed)) setOutageIncidents(parsed.filter(item => item && typeof item.id === "string" && typeof item.startedAt === "string"));
      }
    } catch { /* Start with a clean incident timeline when saved browser data is invalid. */ }
    setOutageIncidentsLoaded(true);
  }, []);
  useEffect(() => {
    if (!outageIncidentsLoaded) return;
    try { localStorage.setItem("nt-power-outage-incidents-v1", JSON.stringify(outageIncidents.slice(-100))); } catch { /* Keep incident state in memory if browser storage is unavailable. */ }
  }, [outageIncidents, outageIncidentsLoaded]);
  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    const loadConfigs = async () => {
      try {
        const response = await fetch("/api/config", { cache: "no-store" });
        const payload = await response.json() as { configs?: { station_id: string; electrical_config: Partial<StationElectricalConfig>; infrastructure_config: Partial<StationPowerConfig> }[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "อ่านค่าคอนฟิกไม่สำเร็จ");
        if (active) setConfigError("");
        let rows = payload.configs ?? [];
        if (rows.length === 0 && isAdmin) {
          try {
            const oldElectrical = JSON.parse(localStorage.getItem("nt-power-station-config-v1") ?? "{}") as Record<string, Partial<StationElectricalConfig>>;
            const oldInfrastructure = JSON.parse(localStorage.getItem("nt-power-infrastructure-config-v1") ?? "{}") as Record<string, Partial<StationPowerConfig>>;
            const oldStationIds = new Set([...Object.keys(oldElectrical), ...Object.keys(oldInfrastructure)]);
            for (const stationId of oldStationIds) {
              const saved = await fetch("/api/config", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ stationId, electrical: oldElectrical[stationId] ?? defaultStationConfig(), infrastructure: oldInfrastructure[stationId] ?? defaultStationPowerConfig() }),
              });
              if (!saved.ok) throw new Error("นำเข้าคอนฟิกเดิมไม่สำเร็จ");
            }
            if (oldStationIds.size) {
              const refreshed = await fetch("/api/config", { cache: "no-store" });
              if (!refreshed.ok) throw new Error("อ่านคอนฟิกหลังนำเข้าไม่สำเร็จ");
              const refreshedPayload = await refreshed.json() as { configs?: typeof rows };
              rows = refreshedPayload.configs ?? [];
              localStorage.removeItem("nt-power-station-config-v1");
              localStorage.removeItem("nt-power-infrastructure-config-v1");
            }
          } catch (error) {
            if (active) setConfigError(error instanceof Error ? error.message : "นำเข้าคอนฟิกเดิมไม่สำเร็จ");
          }
        }
        const electrical: Record<string, StationElectricalConfig> = {};
        const infrastructure: Record<string, StationPowerConfig> = {};
        for (const row of rows) {
          const threshold = Number(row.electrical_config?.threshold);
          electrical[row.station_id] = {
            phaseMode: row.electrical_config?.phaseMode === "single" ? "single" : "three",
            singlePhase: row.electrical_config?.singlePhase === "F2" || row.electrical_config?.singlePhase === "F3" ? row.electrical_config.singlePhase : "F1",
            threshold: Number.isFinite(threshold) && threshold >= 1 && threshold <= 500 ? threshold : 150,
            confirmed: row.electrical_config?.confirmed === true,
          };
          const defaults = defaultStationPowerConfig();
          infrastructure[row.station_id] = Object.fromEntries(Object.keys(defaults).map(key => {
            const value = Number(row.infrastructure_config?.[key as keyof StationPowerConfig]);
            return [key, Number.isFinite(value) && value >= 0 ? value : defaults[key as keyof StationPowerConfig]];
          })) as unknown as StationPowerConfig;
        }
        if (active) { setStationConfigs(electrical); setStationPowerConfigs(infrastructure); }
      } catch (error) {
        if (active) setConfigError(error instanceof Error ? error.message : "อ่านค่าคอนฟิกไม่สำเร็จ");
      }
    };
    void loadConfigs();
    const timer = window.setInterval(() => void loadConfigs(), 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [isAdmin]);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/stations", { cache: "no-store" });
        const payload = await response.json() as { source?: string; stations?: Station[] };
        if (active) setDatabaseOnline(response.ok && payload.source === "mariadb");
        if (active && response.ok && payload.stations?.length) {
          setStationData(payload.stations);
          setLiveData(true);
        }
      } catch { if (active) { setDatabaseOnline(false); setLiveData(false); } }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!liveData || !outageIncidentsLoaded || !stationData.length) return;
    const detectedAt = new Date().toISOString();
    setOutageIncidents(previous => {
      let changed = false;
      const next = [...previous];
      for (const station of stationData) {
        if (station.status === "offline") continue;
        const config = stationConfigs[station.id] ?? defaultStationConfig();
        const failedPhases = failedVoltagePhases(station, config);
        const index = next.findIndex(event => event.stationId === station.id && !event.resolvedAt);
        if (failedPhases.length) {
          if (index < 0) {
            next.push({
              id: `OUTAGE-${station.id}-${Date.now()}`,
              stationId: station.id,
              stationName: station.name,
              startedAt: detectedAt,
              startDc: station.loadDc,
              latestDc: station.loadDc,
              latestDcAt: station.lastSeenAt ?? detectedAt,
              phaseList: failedPhases,
              healthyPolls: 0,
              reminder30Sent: false,
              escalation60Sent: false,
            });
            changed = true;
          } else {
            const event = next[index];
            if (event.healthyPolls !== 0 || event.latestDc !== station.loadDc || event.phaseList.join(",") !== failedPhases.join(",")) {
              next[index] = { ...event, healthyPolls: 0, latestDc: station.loadDc, latestDcAt: station.lastSeenAt ?? detectedAt, phaseList: failedPhases };
              changed = true;
            } else if (event.latestDcAt !== (station.lastSeenAt ?? detectedAt)) {
              next[index] = { ...event, latestDcAt: station.lastSeenAt ?? detectedAt };
              changed = true;
            }
          }
        } else if (index >= 0) {
          const monitored = config.phaseMode === "single" ? [config.singlePhase] : ["F1", "F2", "F3"];
          const values = monitored.map(phase => station[phase === "F1" ? "mainAc1" : phase === "F2" ? "mainAc2" : "mainAc3"]);
          const healthy = values.every(value => value !== null && value >= config.threshold);
          if (healthy) {
            const event = next[index];
            const healthyPolls = event.healthyPolls + 1;
            if (healthyPolls >= 2) {
              next[index] = { ...event, healthyPolls, resolvedAt: detectedAt, latestDc: station.loadDc, latestDcAt: station.lastSeenAt ?? detectedAt };
            } else next[index] = { ...event, healthyPolls, latestDc: station.loadDc, latestDcAt: station.lastSeenAt ?? detectedAt };
            changed = true;
          }
        }
      }
      return changed ? next.slice(-100) : previous;
    });
  }, [stationData, liveData, stationConfigs, outageIncidentsLoaded]);
  useEffect(() => {
    if (!outageIncidentsLoaded) return;
    let changed = false;
    let latestNotice: { title: string; message: string; stage: 30 | 60 } | null = null;
    const updated = outageIncidents.map(event => {
      if (event.resolvedAt) return event;
      const elapsedMs = clockNow - new Date(event.startedAt).getTime();
      if (elapsedMs >= 60 * 60 * 1000 && !event.escalation60Sent) {
        changed = true;
        latestNotice = { title: `ยกระดับเหตุไฟฟ้าขัดข้อง · ${event.stationName}`, message: `เหตุยังไม่คลี่คลายเกิน 1 ชั่วโมง · DC ล่าสุด ${event.latestDc?.toFixed(1) ?? "ไม่มีข้อมูล"} · GEN ${stationData.find(station => station.id === event.stationId)?.genOn === 255 ? "ทำงาน" : stationData.find(station => station.id === event.stationId)?.genOn === 0 ? "ไม่ทำงาน" : "ไม่ทราบสถานะ"}`, stage: 60 };
        return { ...event, reminder30Sent: true, escalation60Sent: true };
      }
      if (elapsedMs >= 30 * 60 * 1000 && !event.reminder30Sent && !event.acknowledgedAt) {
        changed = true;
        latestNotice = { title: `เตือนซ้ำ · ${event.stationName}`, message: `ยังไม่มีผู้รับทราบเหตุเกิน 30 นาที · DC ล่าสุด ${event.latestDc?.toFixed(1) ?? "ไม่มีข้อมูล"}`, stage: 30 };
        return { ...event, reminder30Sent: true };
      }
      return event;
    });
    if (changed) setOutageIncidents(updated);
    if (latestNotice) setReminderNotice(latestNotice);
  }, [clockNow, outageIncidents, outageIncidentsLoaded, stationData]);
  const alarmCandidates = useMemo<Alarm[]>(() => {
    if (liveData) {
      const outages: Alarm[] = outageIncidents.map(event => {
        const current = stationData.find(station => station.id === event.stationId);
        const generatorCode = current?.genOn;
        const generatorState = generatorCode === 0 ? "off" as const : generatorCode === 255 ? "on" as const : "unknown" as const;
        const generatorLabel = generatorState === "off" ? "GEN ไม่ทำงาน" : generatorState === "on" ? "GEN ทำงาน" : "GEN ไม่ทราบสถานะ";
        const config = stationPowerConfigs[event.stationId];
        const startedTime = new Date(event.startedAt).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
        return {
          id: `POWER-OUTAGE-${event.stationId}`,
          stationId: event.stationId,
          station: event.stationName,
          title: event.resolvedAt ? `ไฟฟ้าขาเข้ากลับปกติ · เหตุเดิม ${event.phaseList.join(", ")} · ${generatorLabel}` : `ไฟฟ้าขาเข้าขัดข้อง · ${event.phaseList.join(", ")} · ${generatorLabel}`,
          severity: "critical",
          started: `วันนี้ ${startedTime}`,
          detectedAt: event.startedAt,
          dcAtStart: event.startDc,
          dcLatest: current?.status === "offline" ? event.latestDc : current?.loadDc ?? event.latestDc,
          dcLatestAt: current?.status === "offline" ? event.latestDcAt ?? undefined : current?.lastSeenAt ?? event.latestDcAt ?? undefined,
          generatorState,
          backupHours: estimatedBackupHours(config),
          elapsedText: elapsedText(event.startedAt, clockNow),
          reminderStage: event.escalation60Sent ? 60 : event.reminder30Sent ? 30 : undefined,
          acknowledgedAt: event.acknowledgedAt ? clockText(event.acknowledgedAt) : undefined,
          acknowledgedBy: event.acknowledgedAt ? "ผู้ใช้งาน" : undefined,
          resolvedAt: event.resolvedAt ? clockText(event.resolvedAt) : undefined,
        };
      });
      const offline = stationData.filter(station => station.status === "offline").map(station => ({
        id: `OFFLINE-${station.id}`,
        stationId: station.id,
        station: station.name,
        title: "ไม่ได้รับข้อมูลจากอุปกรณ์",
        severity: "critical" as const,
        started: station.updated === "—" ? "ไม่พบเวลาจากอุปกรณ์" : `ข้อมูลล่าสุด ${station.updated}`,
      }));
      return [...outages, ...offline];
    }
    const voltage = lowVoltageAlarms(stationData, stationConfigs);
    return [...initialAlarms.filter(alarm => alarm.id !== "AL-24018"), ...voltage];
  }, [stationData, liveData, stationConfigs, stationPowerConfigs, outageIncidents, clockNow]);
  const activeAlarms = useMemo(() => alarmCandidates.map(alarm => {
    const previous = alarms.find(item => item.id === alarm.id);
    return previous && !alarm.acknowledgedAt ? { ...alarm, acknowledgedBy: previous.acknowledgedBy, acknowledgedAt: previous.acknowledgedAt } : alarm;
  }), [alarmCandidates, alarms]);
  useEffect(() => {
    const activeIds = new Set(alarmCandidates.map(alarm => alarm.id));
    setAlarms(previous => {
      const next = previous.filter(alarm => !alarm.id.startsWith("VOLTAGE-LOW-") || activeIds.has(alarm.id));
      return next.length === previous.length ? previous : next;
    });
  }, [alarmCandidates]);
  const acknowledgeAlarm = (alarm: Alarm) => {
    const acknowledgedAt = new Date().toISOString();
    const displayTime = clockText(acknowledgedAt);
    if (alarm.id.startsWith("POWER-OUTAGE-")) {
      setOutageIncidents(previous => previous.map(event => event.stationId === alarm.stationId ? { ...event, acknowledgedAt } : event));
    }
    setAlarms(previous => [...previous.filter(item => item.id !== alarm.id), { ...alarm, acknowledgedBy: "คุณ", acknowledgedAt: displayTime }]);
  };
  const persistConfig = async (stationId: string, electrical: StationElectricalConfig, infrastructure: StationPowerConfig) => {
    setConfigError("");
    try {
      const response = await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stationId, electrical, infrastructure }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "บันทึกคอนฟิกไม่สำเร็จ");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "บันทึกคอนฟิกไม่สำเร็จ";
      setConfigError(message);
      throw new Error(message);
    }
  };
  const saveStationConfig = async (stationId: string, config: StationElectricalConfig) => {
    if (!isAdmin) return false;
    const saved = await persistConfig(stationId, config, stationPowerConfigs[stationId] ?? defaultStationPowerConfig());
    if (saved) setStationConfigs(previous => ({ ...previous, [stationId]: config }));
    return saved;
  };
  const saveStationPowerConfig = async (stationId: string, config: StationPowerConfig) => {
    if (!isAdmin) return false;
    const saved = await persistConfig(stationId, stationConfigs[stationId] ?? defaultStationConfig(), config);
    if (saved) setStationPowerConfigs(previous => ({ ...previous, [stationId]: config }));
    return saved;
  };
  const visibleNavItems = navItems.filter(item => isAdmin || (item.id !== "station-settings" && item.id !== "users" && item.id !== "system"));
  const active = navItems.find(x=>x.id===view) ?? navItems[0];
  const openStationHistory = (station: Station) => { setHistoryStation(station.id); setSelectedStation(null); setView("history"); };
  return <div className="app-shell" data-theme={theme}>
    {reminderNotice && <div className={`outage-reminder-toast stage-${reminderNotice.stage}`} role="alert"><div><strong>{reminderNotice.title}</strong><p>{reminderNotice.message}</p><small>DC แสดงค่าดิบจาก load_dc · หน่วยยังรอยืนยัน</small></div><button onClick={() => setReminderNotice(null)} aria-label="ปิดข้อความเตือน">×</button></div>}
    <aside className={`sidebar ${mobileNav?"open":""}`}><div className="brand"><LogoMark/><span><strong>NT POWER</strong><small>CHIANG MAI</small></span><button className="icon-button mobile-close" onClick={()=>setMobileNav(false)}><Icon name="close"/></button></div><div className="workspace-switch"><div className="workspace-icon">CM</div><span><strong>เชียงใหม่</strong><small>Power Monitor</small></span><span className="workspace-chevron">⌄</span></div><div className="nav-caption">เมนูหลัก</div><nav>{visibleNavItems.map(item=><button key={item.id} className={`nav-link ${view===item.id?"active":""}`} onClick={()=>{setView(item.id);setMobileNav(false);setSelectedStation(null)}}><Icon name={item.icon} size={18}/><span>{item.label}</span>{item.id==="alarms"&&<b className="nav-count">{activeAlarms.filter(a=>!a.acknowledgedAt&&!a.resolvedAt).length}</b>}</button>)}</nav><div className="sidebar-bottom"><div className="monitor-status"><span className="monitor-dot"/><span><strong>{liveData?"เชื่อมต่อแล้ว":"ต้นแบบ"}</strong><small>{liveData?"MariaDB · อัปเดตทุก 30 วินาที":"ไม่มีการเชื่อมต่อข้อมูลจริง"}</small></span><span className="info-mark">i</span></div><div className="profile-row"><div className="profile-avatar">{profile.username.slice(0, 1).toUpperCase()}</div><span><strong>{profile.username}</strong><small>{isAdmin ? "Admin" : "ผู้ใช้งาน"}</small></span><button className="profile-logout" onClick={() => void logout()}>ออกจากระบบ</button></div></div></aside>
    {mobileNav&&<button className="nav-scrim" aria-label="ปิดเมนู" onClick={()=>setMobileNav(false)}/>}
    <main className="main-area"><header className="topbar"><button className="mobile-menu icon-button" onClick={()=>setMobileNav(true)} aria-label="เปิดเมนู"><Icon name="menu"/></button><div className="breadcrumbs"><span>Power Monitor</span><span className="crumb-sep">/</span><strong>{active.label}</strong></div><div className="topbar-right"><span className={`connection-state ${databaseOnline?"is-live":"is-demo"}`} aria-label={databaseOnline?"ระบบเชื่อมต่อ MariaDB แล้ว":"โหมดสาธิต ยังไม่เชื่อมต่อ MariaDB"} title={databaseOnline?"ระบบเชื่อมต่อ MariaDB แล้ว":"โหมดสาธิต ยังไม่เชื่อมต่อ MariaDB"}><i/><span>{databaseOnline?(liveData?"MariaDB · Live":"MariaDB · Online"):"Demo mode"}</span></span><TopbarClock/><span className="top-divider"/><button className="top-icon theme-toggle" onClick={()=>setTheme(theme==="light"?"dark":"light")} aria-label={theme==="light"?"เปิดโหมดมืด":"เปิดโหมดสว่าง"} title={theme==="light"?"เปิดโหมดมืด":"เปิดโหมดสว่าง"}><Icon name={theme==="light"?"moon":"sun"} size={18}/><span>{theme==="light"?"Dark":"Light"}</span></button><button className="top-icon" aria-label="การแจ้งเตือน"><Icon name="bell" size={19}/><i/></button></div></header><div className="content-area">{view==="overview"&&<Overview onSelect={setSelectedStation} onNavigate={setView} onAcknowledge={acknowledgeAlarm} stationData={stationData} live={liveData} alarms={activeAlarms} selectedStation={selectedStation} onCloseStation={() => setSelectedStation(null)} onHistory={openStationHistory}/ >}{view==="stations"&&<StationsView onSelect={setSelectedStation} stationData={stationData} live={liveData} alarms={activeAlarms}/ >}{view==="alarms"&&<AlarmsView alarms={activeAlarms} onAcknowledge={acknowledgeAlarm} live={liveData}/ >}{view==="history"&&<HistoryView initialStation={historyStation} stationData={stationData} live={liveData}/ >}{view==="station-settings"&&<StationSettingsView stationData={stationData} configs={stationConfigs} onSave={saveStationConfig} powerConfigs={stationPowerConfigs} onSavePower={saveStationPowerConfig} configError={configError}/ >}{view==="system"&&<SystemView/>}{view==="users"&&<AdminUsersView/>}<footer>NT Chiang Mai Power Monitor <span>·</span> {liveData?"ข้อมูล MariaDB · อัปเดตทุก 30 วินาที":"Prototype · ข้อมูลตัวอย่างจนกว่าจะเชื่อมต่อฐานข้อมูลได้"}</footer></div></main>
     {selectedStation&&view !== "overview"&&<StationDetail station={selectedStation} live={liveData} onClose={()=>setSelectedStation(null)} onHistory={openStationHistory}/>}
  </div>;
}

export default function Home() {
  return <AuthGate><Dashboard/></AuthGate>;
}
