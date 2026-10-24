export type Status = "normal" | "warning" | "fault" | "offline";

export type Station = {
  id: string;
  name: string;
  district: string;
  status: Status;
  updated: string;
  mainAc1: number | null;
  mainAc2: number | null;
  mainAc3: number | null;
  loadAc: number | null;
  loadDc: number | null;
  temperature: number | null;
  humidity: number | null;
  wifi: number | null;
  commonAlarm: number | null;
  nodeStatus: number | null;
  mainFail: number | null;
  ats: number | null;
  genOn: number | null;
  autoBlock: number | null;
  x: number;
  y: number;
  lat?: number;
  lon?: number;
  ageSeconds?: number | null;
  lastSeenAt?: string | null;
  sourceTimestamp?: string | null;
};

export const stations: Station[] = [
  { id: "CM-001", name: "ศูนย์โทรคมนาคมเชียงใหม่", district: "เมืองเชียงใหม่", status: "normal", updated: "10:42:18", mainAc1: 230, mainAc2: 229, mainAc3: 231, loadAc: 38, loadDc: 53.4, temperature: 31.3, humidity: 54.6, wifi: -28, commonAlarm: 1, nodeStatus: 0, mainFail: 0, ats: 0, genOn: 0, autoBlock: 0, x: 48, y: 43 },
  { id: "CM-002", name: "สถานีสันทราย", district: "สันทราย", status: "warning", updated: "10:42:11", mainAc1: 235, mainAc2: 237, mainAc3: 233, loadAc: 240, loadDc: 54.0, temperature: null, humidity: null, wifi: -43, commonAlarm: 0, nodeStatus: 0, mainFail: 0, ats: null, genOn: 0, autoBlock: 0, x: 61, y: 35 },
  { id: "CM-003", name: "สถานีหางดง", district: "หางดง", status: "normal", updated: "10:42:05", mainAc1: 228, mainAc2: 229, mainAc3: 232, loadAc: 0, loadDc: 15.4, temperature: 20.8, humidity: 85.4, wifi: -32, commonAlarm: 1, nodeStatus: 1, mainFail: 0, ats: 0, genOn: 0, autoBlock: 0, x: 41, y: 57 },
  // null means no value was received; numeric 0 is a real reading and must remain visible.
  { id: "CM-004", name: "สถานีแม่ริม", district: "แม่ริม", status: "offline", updated: "09:58:34", mainAc1: null, mainAc2: null, mainAc3: null, loadAc: null, loadDc: null, temperature: null, humidity: null, wifi: null, commonAlarm: null, nodeStatus: 1, mainFail: null, ats: null, genOn: null, autoBlock: null, x: 46, y: 28 },
  { id: "CM-005", name: "สถานีสารภี", district: "สารภี", status: "normal", updated: "10:41:58", mainAc1: 231, mainAc2: 234, mainAc3: 230, loadAc: 0, loadDc: 15.4, temperature: 22.1, humidity: 68.4, wifi: -35, commonAlarm: 0, nodeStatus: 0, mainFail: 0, ats: 0, genOn: 0, autoBlock: 0, x: 58, y: 57 },
  { id: "CM-006", name: "สถานีสันกำแพง", district: "สันกำแพง", status: "fault", updated: "10:42:14", mainAc1: 220, mainAc2: 219, mainAc3: 222, loadAc: 225, loadDc: 52.0, temperature: 35.3, humidity: 47.7, wifi: -27, commonAlarm: 1, nodeStatus: 0, mainFail: 0, ats: 0, genOn: 255, autoBlock: 0, x: 70, y: 48 },
  { id: "CM-007", name: "สถานีจอมทอง", district: "จอมทอง", status: "normal", updated: "10:41:40", mainAc1: 230, mainAc2: 229, mainAc3: 231, loadAc: 38, loadDc: 53.0, temperature: 27.5, humidity: 64.4, wifi: -22, commonAlarm: 0, nodeStatus: 0, mainFail: 0, ats: null, genOn: null, autoBlock: null, x: 32, y: 77 },
  { id: "CM-008", name: "สถานีดอยสะเก็ด", district: "ดอยสะเก็ด", status: "normal", updated: "10:41:52", mainAc1: 235, mainAc2: 236, mainAc3: 233, loadAc: 240, loadDc: 54.0, temperature: 24.8, humidity: 61.0, wifi: -40, commonAlarm: 0, nodeStatus: 0, mainFail: 0, ats: 0, genOn: 0, autoBlock: 0, x: 77, y: 34 },
  { id: "CM-009", name: "ชส.แม่อาย", district: "แม่อาย", status: "offline", updated: "—", mainAc1: null, mainAc2: null, mainAc3: null, loadAc: null, loadDc: null, temperature: null, humidity: null, wifi: null, commonAlarm: null, nodeStatus: null, mainFail: null, ats: null, genOn: null, autoBlock: null, x: 86, y: 12, lat: 19.964847, lon: 99.308179 },
  { id: "CM-010", name: "ชส.อมก๋อย", district: "อมก๋อย", status: "offline", updated: "—", mainAc1: null, mainAc2: null, mainAc3: null, loadAc: null, loadDc: null, temperature: null, humidity: null, wifi: null, commonAlarm: null, nodeStatus: null, mainFail: null, ats: null, genOn: null, autoBlock: null, x: 18, y: 91, lat: 17.802517, lon: 98.363526 },
];

export type Alarm = {
  id: string;
  stationId: string;
  station: string;
  title: string;
  severity: "critical" | "warning";
  started: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  detectedAt?: string;
  dcAtStart?: number | null;
  dcLatest?: number | null;
  dcLatestAt?: string;
  generatorState?: "off" | "on" | "unknown";
  backupHours?: number | null;
  elapsedText?: string;
  reminderStage?: 30 | 60;
};

export const initialAlarms: Alarm[] = [
  { id: "AL-24018", stationId: "CM-006", station: "สถานีสันกำแพง", title: "แรงดันไฟฟ้าต่ำกว่าค่าปกติ", severity: "critical", started: "วันนี้ 10:31:42" },
  { id: "AL-24017", stationId: "CM-002", station: "สถานีสันทราย", title: "โหลดกระแสสูงกว่าช่วงเฝ้าระวัง", severity: "warning", started: "วันนี้ 10:18:06", acknowledgedBy: "ผู้ดูแลระบบ", acknowledgedAt: "10:20:14" },
  { id: "AL-24012", stationId: "CM-004", station: "สถานีแม่ริม", title: "ไม่ได้รับข้อมูลจากอุปกรณ์", severity: "warning", started: "วันนี้ 09:58:34" },
  { id: "AL-24003", stationId: "CM-005", station: "สถานีสารภี", title: "เชื่อมต่อข้อมูลกลับมาแล้ว", severity: "warning", started: "วันนี้ 08:42:12", resolvedAt: "09:02:28" },
];

export const readings = [
  { time: "09:00", mainAc1: 230, mainAc2: 229, mainAc3: 231, loadAc: 38, loadDc: 53.4, temperature: 31.0, humidity: 54.0, wifi: -28 },
  { time: "09:15", mainAc1: 231, mainAc2: 230, mainAc3: 232, loadAc: 39, loadDc: 53.5, temperature: 31.2, humidity: 54.2, wifi: -29 },
  { time: "09:30", mainAc1: 229, mainAc2: 228, mainAc3: 230, loadAc: 36, loadDc: 53.4, temperature: 31.3, humidity: 54.6, wifi: -28 },
  { time: "09:45", mainAc1: 230, mainAc2: 228, mainAc3: 231, loadAc: 0, loadDc: 53.3, temperature: 31.4, humidity: 54.8, wifi: -30 },
  { time: "10:00", mainAc1: 232, mainAc2: 231, mainAc3: 233, loadAc: 41, loadDc: 53.6, temperature: 31.5, humidity: 55.0, wifi: -28 },
  { time: "10:15", mainAc1: 230, mainAc2: 229, mainAc3: 232, loadAc: 40, loadDc: 53.5, temperature: 31.3, humidity: 54.8, wifi: -29 },
  { time: "10:30", mainAc1: 231, mainAc2: 230, mainAc3: 231, loadAc: 37, loadDc: 53.4, temperature: 31.2, humidity: 54.6, wifi: -28 },
  { time: "10:45", mainAc1: 230, mainAc2: 229, mainAc3: 231, loadAc: 38, loadDc: 53.5, temperature: 31.3, humidity: 54.6, wifi: -28 },
];

export const incidentSample = {
  id: "INC-DEMO-006",
  stationId: "CM-006",
  title: "ตัวอย่างเหตุขัดข้องทางไฟฟ้า",
  startedAt: "10:18:24",
  elapsed: "24 นาที",
  snapshots: [
    { label: "ก่อนเกิดเหตุ", time: "10:15:00", mainAc1: 230, mainAc2: 229, mainAc3: 232, loadAc: 40, loadDc: 53.5, genOn: 0 },
    { label: "เริ่มเหตุ", time: "10:18:24", mainAc1: 220, mainAc2: 219, mainAc3: 222, loadAc: 225, loadDc: 52.7, genOn: 255 },
    { label: "ค่าล่าสุด", time: "10:42:14", mainAc1: 220, mainAc2: 219, mainAc3: 222, loadAc: 225, loadDc: 52.0, genOn: 255 },
  ],
};

export const labelForStatus: Record<Status, string> = {
  normal: "ปกติ", warning: "เฝ้าระวัง", fault: "ขัดข้อง", offline: "ออฟไลน์",
};
