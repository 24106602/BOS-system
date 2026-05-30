import type { CSSProperties } from "react";

export default function AdminFamilySummaryPage() {
  return (
    <section style={styles.card}>
      <h1 style={styles.title}>家庭成员信息汇总</h1>
      <p style={styles.description}>汇总学院上载的学生家庭成员信息。这是独立的家庭成员表，一个家庭成员一行；一名学生可以对应多条记录，使用 student_id_card 指向学生身份证号。</p>
      <div style={styles.placeholder}>家庭成员信息汇总表区域已预留</div>
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
