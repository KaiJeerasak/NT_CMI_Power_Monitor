"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppProfile } from "./auth-gate";

type ManagedUser = AppProfile & { created_at: string };

export function AdminUsersView() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const result = await response.json() as { users?: ManagedUser[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "โหลดบัญชีไม่สำเร็จ");
      setUsers(result.users ?? []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "โหลดบัญชีไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const updateStatus = async (user: ManagedUser, status: "approved" | "rejected" | "disabled") => {
    setError("");
    try {
      const response = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: user.id, status }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "เปลี่ยนสถานะไม่สำเร็จ");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "เปลี่ยนสถานะไม่สำเร็จ"); }
  };

  return <><div className="page-heading"><div><div className="eyebrow">PUBLIC MANAGEMENT · ไม่ต้อง login</div><h1>ผู้ใช้งานและสิทธิ์</h1><p>ผู้เข้าชมทุกคนสามารถอนุมัติหรือระงับบัญชีได้</p></div><button className="button button-quiet" onClick={() => void load()}>รีเฟรชรายการ</button></div>
    <section className="panel admin-users-panel"><div className="panel-heading"><div><h2>บัญชีผู้ใช้</h2><p>เปลี่ยนสถานะบัญชีได้โดยไม่ต้องเข้าสู่ระบบ</p></div><span className="tag-neutral">{users.filter(user => user.status === "pending").length} รออนุมัติ</span></div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {loading ? <p className="admin-empty">กำลังโหลด...</p> : users.length === 0 ? <p className="admin-empty">ยังไม่มีบัญชีผู้ใช้</p> : <div className="admin-user-list">{users.map(user => <article className="admin-user-row" key={user.id}><div className="admin-user-avatar">{user.username.slice(0, 1).toUpperCase()}</div><div className="admin-user-info"><strong>{user.username}</strong><small>{user.role === "admin" ? "Admin" : "ผู้ใช้งาน"} · สมัคร {new Date(user.created_at).toLocaleDateString("th-TH")}</small></div><span className={`approval-status ${user.status}`}>{user.status === "pending" ? "รออนุมัติ" : user.status === "approved" ? "อนุมัติแล้ว" : user.status === "rejected" ? "ไม่อนุมัติ" : "ระงับ"}</span><div className="admin-user-actions">{user.status !== "approved" && <button className="button button-primary" onClick={() => void updateStatus(user, "approved")}>อนุมัติ</button>}{user.status === "pending" && <button className="button button-quiet" onClick={() => void updateStatus(user, "rejected")}>ไม่อนุมัติ</button>}{user.status === "approved" && user.role !== "admin" && <button className="button button-quiet" onClick={() => void updateStatus(user, "disabled")}>ระงับบัญชี</button>}{user.status === "disabled" && <button className="button button-quiet" onClick={() => void updateStatus(user, "rejected")}>ยกเลิกการระงับ</button>}</div></article>)}</div>}
    </section>
  </>;
}
