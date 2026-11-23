import type { Alarm, Station } from "./demo-data";

export const MONITOR_SNAPSHOT_KEY = "nt-power-monitor-map-snapshot-v1";

export type MonitorSnapshot = {
  version: 1;
  updatedAt: string;
  stations: Station[];
  alarms: Alarm[];
};
