"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// 登录页：未登录用户在此登录或注册；已登录用户自动送回工作台
// （因此「登录新用户」必须先退出当前用户，符合产品要求）
export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login"); // 登录 / 注册 切换
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // 已登录则直接回工作台
  useEffect(() => {
    fetch("/api/auth/me").then((res) => { if (res.ok) router.replace("/"); });
  }, [router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setBusy(true);
    try {
      const res = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "操作失败，请重试"); return; }
      router.replace("/"); // 登录 / 注册成功，进入工作台
    } finally { setBusy(false); }
  }

  const field = (name: string, label: string, type = "text", placeholder = "") => (
    <label key={name}>{label}<input required type={type} value={values[name] ?? ""} placeholder={placeholder}
      onChange={(e) => setValues({ ...values, [name]: e.target.value })} /></label>
  );

  return <main className="auth-page">
    <div className="auth-card">
      <div className="app-brand" style={{ marginBottom: 26 }}>
        <span>A</span><div><b>AgileCampus</b><small>敏捷项目工作台</small></div>
      </div>
      <div className="auth-tabs">
        <button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>登 录</button>
        <button className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); }}>注 册</button>
      </div>
      <form onSubmit={submit}>
        <div className="form-fields" style={{ marginTop: 22 }}>
          {mode === "register" && field("studentId", "学工号", "text", "请输入学工号")}
          {field("email", "邮箱", "email", "example@stu.edu.cn")}
          {field("password", "密码", "password", mode === "register" ? "至少 6 位" : "请输入密码")}
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="primary full" type="submit" disabled={busy}>{busy ? "请稍候…" : mode === "login" ? "登录工作台" : "注册并登录"}</button>
      </form>
      <p className="auth-hint">无需填写真实姓名——注册后可在「个人设置」中设置展示名称，以及性别、地区与个人简介</p>
    </div>
  </main>;
}
