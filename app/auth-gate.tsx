"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type AppProfile = { id: string; username: string; role: "admin" | "user"; status: "pending" | "approved" | "rejected" | "disabled" };
type AuthContextValue = { profile: AppProfile; logout: () => Promise<void>; reload: () => Promise<void> };
const AuthContext = createContext<AuthContextValue | null>(null);

export function useAppAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAppAuth must be used inside AuthGate");
  return value;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState("");
  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const data = await response.json() as { profile?: AppProfile | null; error?: string };
      if (response.ok || response.status !== 503) setProfile(data.profile ?? null);
      setSetupError(response.status === 503 ? data.error ?? "ตรวจสอบการตั้งค่า Supabase" : "");
    } catch {
      setSetupError("ติดต่อระบบยืนยันตัวตนไม่ได้");
      setProfile(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void reload(); }, 0);
    const refresh = window.setInterval(() => { void reload(); }, 60_000);
    return () => { window.clearTimeout(timer); window.clearInterval(refresh); };
  }, [reload]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setProfile(null);
  }, []);

  if (loading) return <main className="auth-screen"><div className="auth-card"><span className="auth-mark">NT</span><p>กำลังตรวจสอบบัญชี...</p></div></main>;
  if (!profile) return <AuthForm setupError={setupError} onSignedIn={reload}/>;
  if (profile.status !== "approved") {
    const heading = profile.status === "pending" ? "รอ Admin อนุมัติบัญชี" : profile.status === "rejected" ? "คำขอใช้งานไม่ได้รับอนุมัติ" : "บัญชีถูกระงับ";
    return <main className="auth-screen"><section className="auth-card"><span className="auth-mark">NT</span><div className="auth-eyebrow">POWER MONITOR</div><h1>{heading}</h1><p>บัญชี <strong>{profile.username}</strong> ยังไม่สามารถเข้าใช้งานระบบได้ หากต้องการข้อมูลเพิ่มเติม กรุณาติดต่อผู้ดูแลระบบ</p><button className="auth-secondary" onClick={() => void logout()}>ออกจากระบบ</button></section></main>;
  }

  return <AuthContext.Provider value={{ profile, logout, reload }}>{children}</AuthContext.Provider>;
}

function AuthForm({ setupError, onSignedIn }: { setupError: string; onSignedIn: () => Promise<void> }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(setupError);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? "ดำเนินการไม่สำเร็จ");
      if (mode === "register") {
        setMessage(result.message ?? "ลงทะเบียนแล้ว กรุณารอ Admin อนุมัติ");
        setMode("login"); setPassword("");
      } else await onSignedIn();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "ดำเนินการไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  return <main className="auth-screen"><section className="auth-card">
    <span className="auth-mark">NT</span><div className="auth-eyebrow">CHIANG MAI · POWER MONITOR</div>
    <h1>{mode === "login" ? "เข้าสู่ระบบ" : "ลงทะเบียนใช้งาน"}</h1>
    <p>{mode === "login" ? "ลงชื่อเข้าใช้เพื่อติดตามสถานีและข้อมูลพลังงาน" : "บัญชีใหม่จะเริ่มใช้งานได้หลัง Admin อนุมัติ"}</p>
    <form onSubmit={submit} className="auth-form">
      <label>ชื่อผู้ใช้<input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" minLength={3} maxLength={30} required placeholder="ชื่อผู้ใช้"/></label>
      <label>รหัสผ่าน<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 8 : 1} maxLength={72} required placeholder="รหัสผ่าน"/></label>
      {error && <div className="auth-error" role="alert">{error}</div>}{message && <div className="auth-success" role="status">{message}</div>}
      <button className="auth-primary" disabled={busy}>{busy ? "กำลังดำเนินการ..." : mode === "login" ? "เข้าสู่ระบบ" : "ส่งคำขอลงทะเบียน"}</button>
    </form>
    <button className="auth-link" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setMessage(""); }}>
      {mode === "login" ? "ยังไม่มีบัญชี? ลงทะเบียนใช้งาน" : "มีบัญชีแล้ว? กลับไปเข้าสู่ระบบ"}
    </button>
  </section></main>;
}
