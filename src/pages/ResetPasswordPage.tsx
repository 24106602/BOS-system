import { useState, type CSSProperties, type FormEvent } from "react";
import { isSupabaseConfigured, SUPABASE_ENV_ERROR } from "../lib/supabaseClient";
import { updateRecoveryPassword } from "../services/authService";

type ResetPasswordPageProps = {
  onComplete: () => void;
};

export default function ResetPasswordPage({ onComplete }: ResetPasswordPageProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const envMessage = isSupabaseConfigured ? "" : SUPABASE_ENV_ERROR;
  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const submitDisabled = loading || Boolean(success) || !newPassword || !confirmPassword || passwordsMismatch;

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (envMessage) {
      setError(envMessage);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccess("");
      await updateRecoveryPassword(newPassword);
      setSuccess("密码修改成功，请使用新密码登录");
      window.setTimeout(onComplete, 800);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "修改密码失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={styles.page}>
      <form style={styles.panel} onSubmit={submitPassword}>
        <p style={styles.eyebrow}>PASSWORD RECOVERY</p>
        <h1 style={styles.title}>修改密码</h1>
        <p style={styles.tip}>请设置新的登录密码，修改成功后系统会返回登录页。</p>

        {envMessage && <div style={styles.errorBox}>{envMessage}</div>}
        {error && !envMessage && <div style={styles.errorBox}>{error}</div>}
        {passwordsMismatch && !error && <div style={styles.errorBox}>两次输入的新密码不一致</div>}
        {success && <div style={styles.successBox}>{success}</div>}

        <label style={styles.fieldLabel}>
          <span>新密码</span>
          <input
            style={styles.input}
            value={newPassword}
            type="password"
            autoComplete="new-password"
            placeholder="请输入新密码"
            disabled={loading || Boolean(success)}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </label>

        <label style={styles.fieldLabel}>
          <span>确认新密码</span>
          <input
            style={styles.input}
            value={confirmPassword}
            type="password"
            autoComplete="new-password"
            placeholder="请再次输入新密码"
            disabled={loading || Boolean(success)}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>

        <button type="submit" style={submitDisabled ? styles.submitDisabled : styles.submit} disabled={submitDisabled}>
          {loading ? "正在修改..." : "确认修改"}
        </button>
      </form>
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
  panel: {
    width: "min(460px, 100%)",
    border: "1px solid #d9e3ee",
    borderRadius: 8,
    padding: "42px 44px",
    background: "#fff",
    boxShadow: "0 18px 44px rgba(15, 35, 64, 0.12)",
  },
  eyebrow: {
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
    lineHeight: 1.7,
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
};
