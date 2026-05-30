import type { CSSProperties } from "react";

export default function AdminStudentSummaryPage() {
  return (
    <section style={styles.card}>
      <h1 style={styles.title}>本专科信息汇总</h1>
      <p style={styles.description}>汇总学院上载并通过治理的学生本人困难生主信息。这是独立的学生主信息表，一名学生一行，使用 id_card 保存学生身份证号。</p>
      <div style={styles.placeholder}>本专科信息汇总表区域已预留</div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  card: {
    background: "#fff",
    border: "1px solid #cbd5e1",
    borderRadius: 16,
    padding: 20,
  },
  title: {
    margin: "0 0 8px 0",
    color: "#0f172a",
  },
  description: {
    color: "#475569",
    lineHeight: 1.7,
    margin: "0 0 14px 0",
  },
  placeholder: {
    color: "#64748b",
    border: "1px dashed #94a3b8",
    borderRadius: 10,
    padding: 18,
  },
};
