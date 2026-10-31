import "server-only";
import { privilegedRestRequest } from "@/lib/supabase-rest";

export async function writeAuditLog(entry: {
  actor?: string;
  action: string;
  target?: string | null;
  summary: string;
}) {
  try {
    const response = await privilegedRestRequest("audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        actor: entry.actor ?? "ผู้เข้าชม",
        action: entry.action,
        target: entry.target ?? null,
        summary: entry.summary,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) console.warn("Audit log write failed", response.status);
  } catch (error) {
    console.warn("Audit log write failed", error instanceof Error ? error.name : "unknown error");
  }
}
