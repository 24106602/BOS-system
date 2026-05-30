import type { CSSProperties, ReactNode } from "react";

type AdminLayoutProps = {
  path: string;
  onNavigate: (to: string) => void;
  onLogout: () => void;
  children: ReactNode;
};

const menus = [
  { path: "/admin/colleges", label: "学院提交情况" },
  { path: "/admin/student-summary", label: "本专科信息汇总" },
  { path: "/admin/family-summary", label: "家庭成员信息汇总" },
  { path: "/admin/students", label: "困难生数据库" },
  { path: "/admin/summary", label: "全校数据汇总" },
];

export default function AdminLayout({ path, onNavigate, onLogout, children }: AdminLayoutProps) {
  return (
    <div style={styles.page}>
      <aside style={styles.sidebar}>
        <h2 style={styles.title}>学校管理员端</h2>
        <button
          onClick={() => onNavigate("/admin")}
          style={path === "/admin" ? styles.activeMenu : styles.menu}
        >
          管理员首页
        </button>
        <div style={styles.groupLabel}>困难生业务</div>
        {menus.map((item) => (
          <button
            key={item.path}
            onClick={() => onNavigate(item.path)}
            style={path === item.path ? styles.activeMenu : styles.menu}
          >
            {item.label}
          </button>
        ))}
        <button onClick={onLogout} style={styles.logout}>退出角色</button>
      </aside>
      <main style={styles.main}>{children}</main>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    height: "100vh",
    display: "grid",
    gridTemplateColumns: "240px minmax(0, 1fr)",
    background: "#f1f5f9",
  },
  sidebar: {
    background: "#0f172a",
    color: "#fff",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  title: {
    margin: "0 0 8px 0",
    fontSize: 20,
  },
  groupLabel: {
    color: "#bfdbfe",
    fontSize: 14,
    fontWeight: 700,
    padding: "8px 2px 2px",
  },
  menu: {
    background: "#1e293b",
    color: "#e2e8f0",
    border: "1px solid #334155",
    borderRadius: 10,
    padding: "10px 12px",
    textAlign: "left",
    cursor: "pointer",
  },
  activeMenu: {
    background: "#2563eb",
    color: "#fff",
    border: "1px solid #1d4ed8",
    borderRadius: 10,
    padding: "10px 12px",
    textAlign: "left",
    cursor: "pointer",
    fontWeight: 700,
  },
  logout: {
    marginTop: "auto",
    background: "#dc2626",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 12px",
    cursor: "pointer",
  },
  main: {
    minWidth: 0,
    overflow: "auto",
    padding: 16,
  },
};
