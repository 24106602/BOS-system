import type { CSSProperties } from "react";

type Role = "admin" | "college";

type LoginPageProps = {
  currentRole: Role | null;
  onSelectRole: (role: Role) => void;
};

export default function LoginPage({ currentRole, onSelectRole }: LoginPageProps) {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>数据治理平台入口</h1>
        <p style={styles.tip}>当前角色：{currentRole ? (currentRole === "admin" ? "学校管理员" : "学院用户") : "未选择"}</p>
        <div style={styles.buttons}>
          <button style={styles.admin} onClick={() => onSelectRole("admin")}>学校管理员</button>
          <button style={styles.college} onClick={() => onSelectRole("college")}>学院用户</button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    height: "100vh",
    background: "#f1f5f9",
    display: "grid",
    placeItems: "center",
    padding: 16,
  },
  card: {
    width: "min(560px, 100%)",
    background: "#fff",
    borderRadius: 16,
    padding: 24,
    border: "1px solid #cbd5e1",
  },
  title: {
    margin: "0 0 12px 0",
    color: "#0f172a",
  },
  tip: {
    color: "#475569",
    marginBottom: 14,
  },
  buttons: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  admin: {
    border: "none",
    background: "#2563eb",
    color: "#fff",
    borderRadius: 12,
    padding: "12px 14px",
    cursor: "pointer",
    fontWeight: 700,
  },
  college: {
    border: "none",
    background: "#16a34a",
    color: "#fff",
    borderRadius: 12,
    padding: "12px 14px",
    cursor: "pointer",
    fontWeight: 700,
  },
};
