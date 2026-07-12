import { useEffect, useState, type CSSProperties } from "react";
import { getMergeBatches } from "../../db/localMergeDb";
import type { CollegeProcessedBatch } from "../../types/merge";

type AdminDifficultyPageProps = {
  onNavigate?: (to: string) => void;
};

export default function AdminDifficultyPage({ onNavigate }: AdminDifficultyPageProps) {
  const [batches, setBatches] = useState<CollegeProcessedBatch[]>([]);

  useEffect(() => {
    getMergeBatches().then(setBatches);
  }, []);

  const studentCount = batches.filter((b) => b.dataType === "student").reduce((sum, b) => sum + b.rowCount, 0);
  const familyCount = batches.filter((b) => b.dataType === "family").reduce((sum, b) => sum + b.rowCount, 0);
  const collegeCount = new Set(batches.map((b) => b.collegeName)).size;

  const navItems = [
    {
      icon: "本",
      title: "本专科信息管理",
      desc: "查看各学院上传的困难生本专科信息",
      count: studentCount,
      path: "/admin/difficulty/student",
      color: "#409eff",
    },
    {
      icon: "家",
      title: "家庭成员信息管理",
      desc: "查看各学院上传的家庭成员信息",
      count: familyCount,
      path: "/admin/difficulty/family",
      color: "#67c23a",
    },
    {
      icon: "库",
      title: "困难生数据库",
      desc: "合并后的困难生明细数据",
      count: studentCount,
      path: "/admin/difficulty/database",
      color: "#909399",
    },
    {
      icon: "手",
      title: "业务操作手册",
      desc: "困难生业务流程说明",
      count: 0,
      path: "/admin/difficulty/guide",
      color: "#e6a23c",
    },
  ];

  return (
    <section>
      <div style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>困难生业务</div>
          <h1 style={styles.title}>困难生数据治理</h1>
        </div>
        <div style={styles.heroBadge}>已启用</div>
      </div>

      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>已提交学院</span>
          <strong style={styles.statValue}>{collegeCount}</strong>
        </div>
        <div style={{ ...styles.statCard, borderLeftColor: "#409eff" }}>
          <span style={styles.statLabel}>本专科信息</span>
          <strong style={styles.statValue}>{studentCount}</strong>
        </div>
        <div style={{ ...styles.statCard, borderLeftColor: "#67c23a" }}>
          <span style={styles.statLabel}>家庭成员信息</span>
          <strong style={styles.statValue}>{familyCount}</strong>
        </div>
      </div>

      <div style={styles.cardGrid}>
        {navItems.map((item) => (
          <div
            key={item.path}
            style={styles.card}
            onClick={() => onNavigate?.(item.path)}
          >
            <div style={{ ...styles.cardIcon, background: item.color }}>{item.icon}</div>
            <div style={styles.cardContent}>
              <h3 style={styles.cardTitle}>{item.title}</h3>
              <p style={styles.cardDesc}>{item.desc}</p>
              {item.count > 0 && <span style={styles.cardCount}>{item.count} 条</span>}
            </div>
            <span style={styles.cardArrow}>→</span>
          </div>
        ))}
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
    marginBottom: 14,
  },
  eyebrow: { color: "#0077d4", fontSize: 13, fontWeight: 800 },
  title: { margin: "5px 0 0", color: "#172033", fontSize: 26 },
  heroBadge: {
    padding: "7px 10px",
    borderRadius: 999,
    background: "#e9f8f2",
    color: "#087b5b",
    fontSize: 12,
    fontWeight: 800,
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
    marginBottom: 14,
  },
  statCard: {
    padding: 16,
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    background: "#fff",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    borderLeftWidth: 4,
  },
  statLabel: { color: "#63738a", fontSize: 13 },
  statValue: { color: "#172033", fontSize: 24 },
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 12,
  },
  card: {
    display: "flex",
    gap: 12,
    padding: 16,
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    background: "#fff",
    cursor: "pointer",
    transition: "box-shadow 0.2s",
  },
  cardIcon: {
    width: 40,
    height: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    color: "#fff",
    fontWeight: 900,
    fontSize: 16,
    flexShrink: 0,
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    margin: "0 0 4px",
    color: "#172033",
    fontSize: 16,
    fontWeight: 600,
  },
  cardDesc: {
    margin: 0,
    color: "#63738a",
    fontSize: 13,
  },
  cardCount: {
    display: "inline-block",
    marginTop: 6,
    padding: "2px 8px",
    borderRadius: 3,
    background: "#f0f9eb",
    color: "#67c23a",
    fontSize: 11,
    fontWeight: 600,
  },
  cardArrow: {
    color: "#c0c4cc",
    fontSize: 20,
    flexShrink: 0,
  },
};
