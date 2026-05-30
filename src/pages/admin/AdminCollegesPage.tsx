import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getMergeBatches } from "../../db/localMergeDb";

const allColleges = [
  "外国语学院",
  "艺术与设计学院",
  "人文学院",
  "理学院",
  "经济与管理学院",
  "香料香精化妆品学部",
  "材料科学与工程学院",
  "化工与能源技术学部",
  "城市建设与生态技术学部",
  "智能技术学部",
];

export default function AdminCollegesPage() {
  const [submitted, setSubmitted] = useState<string[]>([]);

  useEffect(() => {
    getMergeBatches().then((rows) => {
      const names = Array.from(new Set(rows.map((item) => item.collegeName).filter(Boolean)));
      setSubmitted(names);
    });
  }, []);

  const stats = useMemo(() => {
    const total = allColleges.length;
    const done = submitted.length;
    const pending = Math.max(0, total - done);
    return {
      total,
      done,
      pending,
      abnormal: 0,
      passed: done,
    };
  }, [submitted]);

  return (
    <section style={styles.card}>
      <h1 style={styles.title}>学院提交情况</h1>
      <div style={styles.grid}>
        <Stat label="学院总数" value={stats.total} color="#0f172a" />
        <Stat label="已提交" value={stats.done} color="#16a34a" />
        <Stat label="未提交" value={stats.pending} color="#f97316" />
        <Stat label="有异常" value={stats.abnormal} color="#dc2626" />
        <Stat label="已通过" value={stats.passed} color="#2563eb" />
      </div>
    </section>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <div style={{ ...styles.statValue, color }}>{value}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  card: { background: "#fff", borderRadius: 16, padding: 20, border: "1px solid #cbd5e1" },
  title: { margin: "0 0 14px 0", color: "#0f172a" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 },
  stat: { border: "1px solid #cbd5e1", background: "#f8fafc", borderRadius: 12, padding: 14 },
  statLabel: { color: "#475569", marginBottom: 6 },
  statValue: { fontWeight: 800, fontSize: 26 },
};
