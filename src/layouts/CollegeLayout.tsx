import type { CSSProperties, ReactNode } from "react";

type CollegeLayoutProps = {
  path: string;
  onNavigate: (to: string) => void;
  onLogout: () => void;
  children: ReactNode;
};

const menus = [
  { path: "/college", label: "学院首页" },
  { path: "/college/upload", label: "上传数据" },
  { path: "/college/records", label: "提交记录" },
];

export default function CollegeLayout({ path, onNavigate, onLogout, children }: CollegeLayoutProps) {
  return (
    <div style={styles.page}>
      <aside style={styles.sidebar}>
        <h2 style={styles.title}>学院端</h2>
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
    gridTemplateColumns: "220px minmax(0, 1fr)",
    background: "#f1f5f9",
  },
  sidebar: {
    background: "#0b3b2e",
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
  menu: {
    background: "#14532d",
    color: "#dcfce7",
    border: "1px solid #166534",
    borderRadius: 10,
    padding: "10px 12px",
    textAlign: "left",
    cursor: "pointer",
  },
  activeMenu: {
    background: "#16a34a",
    color: "#fff",
    border: "1px solid #15803d",
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
