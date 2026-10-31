"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppProfile } from "./auth-gate";

type ManagedUser = AppProfile & { created_at: string };
type UserRole = AppProfile["role"];
type UserStatus = AppProfile["status"];

export function AdminUsersView() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [status, setStatus] = useState<"approved" | "pending">("approved");

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

  const createUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setNotice(""); setSaving(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, role, status }),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? "สร้างบัญชีไม่สำเร็จ");
      setUsername(""); setPassword(""); setRole("user"); setStatus("approved");
      setNotice(result.message ?? "สร้างบัญชีเรียบร้อย");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "สร้างบัญชีไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const updateUser = async (user: ManagedUser, changes: { role?: UserRole; status?: UserStatus }) => {
    setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, ...changes }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "บันทึกการเปลี่ยนแปลงไม่สำเร็จ");
      setNotice(`บันทึกสิทธิ์ของ ${user.username} แล้ว`);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "บันทึกการเปลี่ยนแปลงไม่สำเร็จ"); }
  };

  return <>
    <div className="page-heading"><div><div className="eyebrow">ADMIN · การจัดการบัญชี</div><h1>ผู้ใช้งานและสิทธิ์</h1><p>สร้างบัญชี กำหนดบทบาท และอนุมัติการใช้งาน</p></div><button className="button button-quiet" onClick={() => void load()}>รีเฟรชรายการ</button></div>
    <div className="admin-public-notice" role="note"><strong>สำหรับ Admin เท่านั้น</strong><span>การสร้างบัญชี เปลี่ยนบทบาท และอนุมัติผู้ใช้ถูกตรวจสิทธิ์จากเซิร์ฟเวอร์</span></div>
    <section className="panel admin-create-panel">
      <div className="panel-heading"><div><h2>สร้างบัญชีผู้ใช้</h2><p>บัญชีนี้เข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านได้เมื่อเปิดหน้า Login</p></div></div>
      <form className="admin-create-form" onSubmit={createUser}>
        <label>ชื่อผู้ใช้<input value={username} onChange={event => setUsername(event.target.value)} minLength={3} maxLength={30} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,29}" autoComplete="off" required placeholder="a-z, 0-9, จุด, ขีดล่าง หรือขีดกลาง"/></label>
        <label>รหัสผ่านเริ่มต้น<input type="password" value={password} onChange={event => setPassword(event.target.value)} minLength={8} maxLength={72} autoComplete="new-password" required placeholder="อย่างน้อย 8 ตัวอักษร"/></label>
        <label>บทบาท<select value={role} onChange={event => setRole(event.target.value as UserRole)}><option value="user">ผู้ใช้งาน (User)</option><option value="admin">ผู้ดูแลระบบ (Admin)</option></select></label>
        <label>สถานะเริ่มต้น<select value={status} onChange={event => setStatus(event.target.value as "approved" | "pending")}><option value="approved">อนุมัติ ใช้งานได้</option><option value="pending">รออนุมัติ</option></select></label>
        <button className="button button-primary admin-create-submit" disabled={saving}>{saving ? "กำลังสร้างบัญชี…" : "สร้างบัญชี"}</button>
      </form>
    </section>
    {error && <p className="admin-error" role="alert">{error}</p>}{notice && <p className="admin-success" role="status">{notice}</p>}
    <section className="panel admin-users-panel"><div className="panel-heading"><div><h2>บัญชีผู้ใช้</h2><p>กำหนดบทบาทและสถานะของแต่ละบัญชี</p></div><span className="tag-neutral">{users.filter(user => user.status === "pending").length} รออนุมัติ</span></div>
      {loading ? <p className="admin-empty">กำลังโหลด...</p> : users.length === 0 ? <p className="admin-empty">ยังไม่มีบัญชีผู้ใช้</p> : <div className="admin-user-list">{users.map(user => <article className="admin-user-row" key={user.id}><div className="admin-user-avatar">{user.username.slice(0, 1).toUpperCase()}</div><div className="admin-user-info"><strong>{user.username}</strong><small>สมัคร {new Date(user.created_at).toLocaleDateString("th-TH")}</small></div><label className="admin-row-select">บทบาท<select aria-label={`บทบาท ${user.username}`} value={user.role} onChange={event => void updateUser(user, { role: event.target.value as UserRole })}><option value="user">User</option><option value="admin">Admin</option></select></label><span className={`approval-status ${user.status}`}>{user.status === "pending" ? "รออนุมัติ" : user.status === "approved" ? "อนุมัติแล้ว" : user.status === "rejected" ? "ไม่อนุมัติ" : "ระงับ"}</span><div className="admin-user-actions">{user.status !== "approved" && <button className="button button-primary" onClick={() => void updateUser(user, { status: "approved" })}>อนุมัติ</button>}{user.status === "pending" && <button className="button button-quiet" onClick={() => void updateUser(user, { status: "rejected" })}>ไม่อนุมัติ</button>}{user.status === "approved" && <button className="button button-quiet" onClick={() => void updateUser(user, { status: "disabled" })}>ระงับบัญชี</button>}{user.status === "disabled" && <button className="button button-quiet" onClick={() => void updateUser(user, { status: "approved" })}>เปิดใช้อีกครั้ง</button>}</div></article>)}</div>}
    </section>
  </>;
}
