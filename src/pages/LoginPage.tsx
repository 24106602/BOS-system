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
      setMessage(error instanceof Error ? error.message : "\u767b\u5f55\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5");
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
      setMessage(error instanceof Error ? error.message : "\u53d1\u9001\u5bc6\u7801\u91cd\u7f6e\u90ae\u4ef6\u5931\u8d25");
      setMessageType("error");
    } finally {
      setResetting(false);
    }
  };

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <div style={styles.brandPanel}>
          <div style={styles.logo}>\u6821</div>
          <p style={styles.eyebrow}>BOS DATA GOVERNANCE PLATFORM</p>
          <h1 style={styles.brandTitle}>BOS \u6570\u636e\u6cbb\u7406\u5e73\u53f0</h1>
          <p style={styles.brandText}>\u9762\u5411\u5b66\u6821\u7ba1\u7406\u90e8\u95e8\u4e0e\u5b66\u9662\u7684\u6570\u636e\u6cbb\u7406\u5e73\u53f0\uff0c\u652f\u6301\u7ebf\u4e0a\u591a\u4eba\u767b\u5f55\u4e0e\u6743\u9650\u9694\u79bb\u3002</p>
          <div style={styles.brandLine} />
          <p style={styles.brandNote}>\u89c4\u8303\u4e0a\u8f7d\u3001\u81ea\u52a8\u6cbb\u7406\u3001\u96c6\u4e2d\u6c47\u603b</p>
        </div>

        <form style={styles.loginPanel} onSubmit={submitLogin}>
          <p style={styles.loginEyebrow}>\u8d26\u53f7\u767b\u5f55</p>
          <h2 style={styles.title}>BOS \u6570\u636e\u6cbb\u7406\u5e73\u53f0</h2>
          <p style={styles.tip}>
            {currentProfile
              ? `\u5f53\u524d\u5df2\u767b\u5f55\uff1a${currentProfile.display_name || currentProfile.college_name || "\u5df2\u767b\u5f55\u7528\u6237"}`
              : "\u8bf7\u8f93\u5165 Supabase Auth \u8d26\u53f7\u548c\u5bc6\u7801"}
          </p>

          {envMessage && <div style={styles.errorBox}>{envMessage}</div>}
          {message && !envMessage && (
            <div style={messageType === "success" ? styles.successBox : styles.errorBox}>{message}</div>
          )}

          <label style={styles.fieldLabel}>
            <span>\u8d26\u53f7 / \u90ae\u7bb1</span>
            <input
              style={styles.input}
              value={account}
              autoComplete="username"
              placeholder="\u8bf7\u8f93\u5165\u8d26\u53f7\u6216\u90ae\u7bb1"
              disabled={busy}
              onChange={(event) => setAccount(event.target.value)}
            />
          </label>

          <label style={styles.fieldLabel}>
            <span>\u5bc6\u7801</span>
            <input
              style={styles.input}
              value={password}
              type="password"
              autoComplete="current-password"
              placeholder="\u8bf7\u8f93\u5165\u5bc6\u7801"
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <button type="submit" style={busy || envMessage ? styles.submitDisabled : styles.submit} disabled={busy || Boolean(envMessage)}>
            {loading ? "\u767b\u5f55\u4e2d..." : "\u767b\u5f55"}
          </button>
          <button type="button" style={styles.forgotButton} disabled={busy} onClick={sendResetEmail}>
            {resetting ? "\u6b63\u5728\u53d1\u9001..." : "\u5fd8\u8bb0\u5bc6\u7801"}
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
