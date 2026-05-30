import type { CSSProperties } from "react";

const stats = [
  ["10", "学院（部）总数", "#0077d4"],
  ["0", "本专科已上载", "#0b9b6f"],
  ["0", "家庭成员已上载", "#7c5ce6"],
  ["0", "待处理异常", "#d83a4e"],
];

export default function AdminHomePage() {
  return (
    <section>
      <div style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>学校管理员端</div>
          <h1 style={styles.title}>困难生业务总览</h1>
          <p style={styles.text}>统一查看学院上载进度、学校困难生总库和全校汇总数据。</p>
        </div>
        <div style={styles.heroBadge}>系统运行正常</div>
      </div>

      <div style={styles.statGrid}>
        {stats.map(([value, label, color]) => (
          <div key={label} style={styles.statCard}>
            <strong style={{ ...styles.statValue, color }}>{value}</strong>
            <div style={styles.statLabel}>{label}</div>
          </div>
        ))}
      </div>

      <div style={styles.grid}>
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>业务流程</h2>
          <div style={styles.step}>1. 学院完成本专科与家庭成员信息治理</div>
          <div style={styles.step}>2. 数据无不通过项后上载到学校端</div>
          <div style={styles.step}>3. 系统按身份证号自动关联并形成总库</div>
        </section>
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>数据同步状态</h2>
          <div style={styles.statusRow}><span style={styles.dot} />本专科信息汇总：等待学院上载</div>
          <div style={styles.statusRow}><span style={styles.dot} />家庭成员信息汇总：等待学院上载</div>
          <div style={styles.statusRow}><span style={styles.dot} />全校汇总看板：自动统计已通过数据</div>
        </section>
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  hero: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: 20,
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    background: "#fff",
    boxShadow: "0 4px 14px rgba(15, 35, 64, 0.05)",
  },
  eyebrow: { color: "#0077d4", fontSize: 13, fontWeight: 800 },
  title: { margin: "5px 0 7px", color: "#172033", fontSize: 26 },
  text: { margin: 0, color: "#63738a", fontSize: 14 },
  heroBadge: {
    padding: "7px 10px",
    borderRadius: 999,
    background: "#e9f8f2",
    color: "#087b5b",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  statGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 12,
    margin: "14px 0",
  },
  statCard: {
    padding: 16,
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    background: "#fff",
  },
  statValue: { display: "block", marginBottom: 5, fontSize: 25 },
  statLabel: { color: "#63738a", fontSize: 13 },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 14,
  },
  card: {
    padding: 16,
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    background: "#fff",
  },
  cardTitle: { margin: "0 0 12px", color: "#172033", fontSize: 17 },
  step: {
    padding: "9px 0",
    borderBottom: "1px solid #edf1f6",
    color: "#54657c",
    fontSize: 13,
  },
  statusRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 0",
    borderBottom: "1px solid #edf1f6",
    color: "#54657c",
    fontSize: 13,
  },
  dot: { width: 7, height: 7, borderRadius: 999, background: "#0b9b6f" },
};
