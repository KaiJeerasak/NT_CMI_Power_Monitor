import "server-only";
import mysql, { type Pool } from "mysql2/promise";

declare global {
  // eslint-disable-next-line no-var
  var powerMonitorDbPool: Pool | undefined;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function getDbPool() {
  if (!globalThis.powerMonitorDbPool) {
    globalThis.powerMonitorDbPool = mysql.createPool({
      host: requiredEnv("DB_HOST"),
      port: Number(process.env.DB_PORT || 3306),
      database: requiredEnv("DB_NAME"),
      user: requiredEnv("DB_USER"),
      password: requiredEnv("DB_PASSWORD"),
      charset: "utf8mb4",
      connectionLimit: 5,
      connectTimeout: 8000,
      multipleStatements: false,
      decimalNumbers: true,
    });
  }
  return globalThis.powerMonitorDbPool;
}
