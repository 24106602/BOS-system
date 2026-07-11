import { useState, type CSSProperties, type FormEvent } from "react";
import { isSupabaseConfigured, SUPABASE_ENV_ERROR } from "../lib/supabaseClient";
import { getProfileLandingPath, sendPasswordResetEmail, signInWithPassword } from "../services/authService";
import type { UserProfile } from "../types/auth";

type LoginPageProps = {
  currentProfile: UserProfile | null;
  initialError?: string;
  onLogin: (profile: UserProfile, nextPath: string) => void;
};

export default function LoginPage({ currentProfile, initialError = "", onLogin }: LoginPageProps) {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(initialError);
  const [messageType, setMessageType] = useState<"error" | "success">("error");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const envMessage = isSupabaseConfigured ? "" : SUPABASE_ENV_ERROR;
  const busy = loading || resetting;

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (envMessage) {
      setMessage(envMessage);
      setMessageType("error");
      return;
    }

    try {
      setLoading(true);
      setMessage("");
      setMessageType("error");
      const profile = await signInWithPassword(account, password);
      onLogin(profile, getProfileLandingPath(profile));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败，请稍后重试");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  };

  const sendResetEmail = async () => {
    if (envMessage) {
      setMessage(envMessage);
      setMessageType("error");
      return;
    }

    try {
      setResetting(true);
      setMessage("");
      const result = await sendPasswordResetEmail(account);
      setMessage(result);
      setMessageType("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "发送密码重置邮件失败");
      setMessageType("error");
    } finally {
      setResetting(false);
    }
  };

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <div style={styles.brandPanel}>
          <div style={styles.logo}>校</div>
          <p style={styles.eyebrow}>BOS DATA GOVERNANCE PLATFORM</p>
          <h1 style={styles.brandTitle}>BOS 数据治理平台</h1>
          <p style={styles.brandText}>面向学校管理部门与学院的数据治理平台，支持线上多人登录与权限隔离。</p>
          <div style={styles.brandLine} />
          <p style={styles.brandNote}>规范上载、自动治理、集中汇总</p>
        </div>

        <form style={styles.loginPanel} onSubmit={submitLogin}>
          <p style={styles.loginEyebrow}>账号登录</p>
          <h2 style={styles.title}>BOS 数据治理平台</h2>
          <p style={styles.tip}>
            {currentProfile
              ? `当前已登录：${currentProfile.display_name || currentProfile.college_name || "已登录用户"}`
              : "请输入 Supabase Auth 账号和密码"}
          </p>

          {envMessage && <div style={styles.errorBox}>{envMessage}</div>}
          {message && !envMessage && (
            <div style={messageType === "success" ? styles.successBox : styles.errorBox}>{message}</div>
          )}

          <label style={styles.fieldLabel}>
            <span>账号 / 邮箱</span>
            <input
              style={styles.input}
              value={account}
              autoComplete="username"
              placeholder="请输入账号或邮箱"
              disabled={busy}
              onChange={(event) => setAccount(event.target.value)}
            />
          </label>

          <label style={styles.fieldLabel}>
            <span>密码</span>
            <input
              style={styles.input}
              value={password}
              type="password"
              autoComplete="current-password"
              placeholder="请输入密码"
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <button type="submit" style={busy || envMessage ? styles.submitDisabled : styles.submit} disabled={busy || Boolean(envMessage)}>
            {loading ? "登录中..." : "登录"}
          </button>
          <button type="button" style={styles.forgotButton} disabled={busy} onClick={sendResetEmail}>
            {resetting ? "正在发送..." : "忘记密码"}
          </button>
        </form>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 24,
    background: "#eaf1f8",
  },
  shell: {
    width: "min(900px, 100%)",
    minHeight: 460,
    display: "grid",
    gridTemplateColumns: "minmax(260px, 0.85fr) minmax(360px, 1.15fr)",
    overflow: "hidden",
    background: "#fff",
    border: "1px solid #d9e3ee",
    borderRadius: 8,
    boxShadow: "0 18px 44px rgba(15, 35, 64, 0.12)",
  },
  brandPanel: {
    padding: "46px 38px",
    color: "#fff",
    background: "#0b1428",
  },
  logo: {
    width: 54,
    height: 54,
    display: "grid",
    placeItems: "center",
    marginBottom: 42,
    borderRadius: 8,
    color: "#fff",
    background: "#008de5",
    fontSize: 24,
    fontWeight: 900,
  },
  eyebrow: {
    margin: "0 0 12px",
    color: "#72c7ff",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0,
  },
  brandTitle: {
    margin: 0,
    fontSize: 30,
    lineHeight: 1.25,
  },
  brandText: {
    margin: "14px 0 0",
    color: "#b8c7dc",
    fontSize: 14,
    lineHeight: 1.8,
  },
  brandLine: {
    width: 46,
    height: 3,
    marginTop: 34,
    borderRadius: 2,
    background: "#00a8ff",
  },
  brandNote: {
    margin: "15px 0 0",
    color: "#8ea2bf",
    fontSize: 13,
  },
  loginPanel: {
    padding: "54px 48px",
  },
  loginEyebrow: {
    margin: 0,
    color: "#0077d4",
    fontSize: 13,
    fontWeight: 800,
  },
  title: {
    margin: "10px 0 8px",
    color: "#101d34",
    fontSize: 28,
  },
  tip: {
    margin: "0 0 22px",
    color: "#718096",
    fontSize: 14,
  },
  fieldLabel: {
    display: "grid",
    gap: 7,
    marginBottom: 14,
    color: "#40526a",
    fontSize: 13,
    fontWeight: 700,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #cfdbe7",
    borderRadius: 6,
    padding: "11px 12px",
    color: "#15304f",
    background: "#fff",
    fontSize: 14,
  },
  errorBox: {
    marginBottom: 14,
    border: "1px solid #ffd4da",
    borderRadius: 6,
    padding: "10px 12px",
    background: "#fff1f2",
    color: "#b42336",
    fontSize: 13,
    fontWeight: 700,
  },
  successBox: {
    marginBottom: 14,
    border: "1px solid #bbf7d0",
    borderRadius: 6,
    padding: "10px 12px",
    background: "#f0fdf4",
    color: "#047857",
    fontSize: 13,
    fontWeight: 700,
  },
  submit: {
    width: "100%",
    border: "none",
    borderRadius: 7,
    padding: "12px 14px",
    color: "#fff",
    background: "#0077d4",
    cursor: "pointer",
    fontSize: 15,
    fontWeight: 800,
  },
  submitDisabled: {
    width: "100%",
    border: "none",
    borderRadius: 7,
    padding: "12px 14px",
    color: "#fff",
    background: "#a6b4c5",
    cursor: "not-allowed",
    fontSize: 15,
    fontWeight: 800,
  },
  forgotButton: {
    width: "100%",
    marginTop: 10,
    border: "none",
    background: "transparent",
    color: "#0077d4",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 800,
  },
};
