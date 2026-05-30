import type { CSSProperties, ReactNode } from "react";

type CollegeLayoutProps = {
  path: string;
  onNavigate: (to: string) => void;
  onLogout: () => void;
  children: ReactNode;
};

const menus = [
  { path: "/college/upload", label: "数据处理", mark: "▦" },
  { path: "/college/records", label: "提交记录", mark: "▤" },
];

export default function CollegeLayout({ path, onNavigate, onLogout, children }: CollegeLayoutProps) {
  return (
    <div style={styles.page}>
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <div style={styles.brandIcon}>校</div>
          <div>
            <div style={styles.brandTitle}>困难生业务系统</div>
            <div style={styles.brandSub}>学院数据治理平台</div>
          </div>
        </div>

        <div style={styles.sideBlock}>
          <div style={styles.caption}>当前视图</div>
          <div style={styles.roleBadge}>学院（部）端</div>
        </div>

        <nav style={styles.nav}>
          <div style={styles.groupLabel}>困难生业务</div>
          {menus.map((item) => (
            <button
              key={item.path}
              onClick={() => onNavigate(item.path)}
              style={path === item.path ? styles.activeMenu : styles.menu}
            >
              <span style={styles.menuMark}>{item.mark}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div style={styles.syncCard}>
          <div style={styles.syncTitle}><span style={styles.pulse}>●</span> 数据治理状态</div>
          <div style={styles.syncText}>治理通过后方可上载到学校端，异常数据会进入不通过预览。</div>
        </div>

        <button onClick={onLogout} style={styles.logout}>退出当前角色</button>
      </aside>

      <div style={styles.workspace}>
        <header style={styles.topbar}>
          <div>
            <div style={styles.topTitle}>学生事务数据治理平台</div>
            <div style={styles.breadcrumb}>学院（部）端 / 困难生业务 / 数据处理</div>
          </div>
          <div style={styles.topRight}>
            <span style={styles.topBadge}>学院数据上载</span>
            <span style={styles.adminName}>学院经办人</span>
          </div>
        </header>
        <main style={styles.main}>{children}</main>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "grid",
    gridTemplateColumns: "252px minmax(0, 1fr)",
    background: "#eef3f8",
  },
  sidebar: {
    minHeight: "100vh",
    background: "#0b1428",
    color: "#fff",
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid #1a2945",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "22px 18px",
    borderBottom: "1px solid #1b2a44",
  },
  brandIcon: {
    width: 42,
    height: 42,
    display: "grid",
    placeItems: "center",
    borderRadius: 8,
    background: "#0495e8",
    color: "#fff",
    fontSize: 20,
    fontWeight: 800,
  },
  brandTitle: { fontSize: 17, fontWeight: 800 },
  brandSub: { marginTop: 3, color: "#28b8ff", fontSize: 12 },
  sideBlock: {
    padding: "16px 18px",
    borderBottom: "1px solid #1b2a44",
  },
  caption: { color: "#95a8c7", fontSize: 12, marginBottom: 8 },
  roleBadge: {
    display: "inline-flex",
    padding: "5px 9px",
    borderRadius: 999,
    border: "1px solid #145d77",
    background: "#0b263a",
    color: "#55ccff",
    fontSize: 12,
    fontWeight: 700,
  },
  nav: { padding: "12px 10px" },
  groupLabel: {
    padding: "15px 10px 7px",
    color: "#8ba0c3",
    fontSize: 12,
    fontWeight: 700,
  },
  menu: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: "none",
    borderRadius: 6,
    padding: "10px 11px",
    background: "transparent",
    color: "#c6d2e6",
    cursor: "pointer",
    textAlign: "left",
    fontSize: 14,
  },
  activeMenu: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: "none",
    borderRadius: 6,
    padding: "10px 11px",
    background: "#078ed8",
    color: "#fff",
    cursor: "pointer",
    textAlign: "left",
    fontSize: 14,
    fontWeight: 700,
  },
  menuMark: { width: 18, textAlign: "center", fontSize: 17 },
  syncCard: {
    margin: "auto 12px 12px",
    padding: 12,
    border: "1px solid #203352",
    borderRadius: 8,
    background: "#0d172b",
  },
  syncTitle: { color: "#fff", fontSize: 13, fontWeight: 700 },
  pulse: { color: "#21d59c", marginRight: 6 },
  syncText: { marginTop: 7, color: "#9cb0ce", fontSize: 12, lineHeight: 1.7 },
  logout: {
    margin: "0 12px 16px",
    border: "1px solid #2c3b55",
    borderRadius: 6,
    padding: "9px 10px",
    background: "#132039",
    color: "#cbd7eb",
    cursor: "pointer",
  },
  workspace: { minWidth: 0 },
  topbar: {
    height: 68,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 24px",
    background: "#fff",
    borderBottom: "1px solid #d7e1ed",
  },
  topTitle: { color: "#162238", fontSize: 18, fontWeight: 800 },
  breadcrumb: { marginTop: 5, color: "#8290a6", fontSize: 12 },
  topRight: { display: "flex", alignItems: "center", gap: 14 },
  topBadge: {
    padding: "6px 9px",
    border: "1px solid #bcd9f5",
    borderRadius: 999,
    background: "#f3f9ff",
    color: "#0879c5",
    fontSize: 12,
    fontWeight: 700,
  },
  adminName: { color: "#334155", fontSize: 13, fontWeight: 700 },
  main: { minWidth: 0, padding: 18 },
};
