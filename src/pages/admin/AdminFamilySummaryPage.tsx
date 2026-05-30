import type { CSSProperties } from "react";

export default function AdminFamilySummaryPage() {
  return (
    <section style={styles.card}>
      <div style={styles.eyebrow}>困难生业务 / 附属信息</div>
      <h1 style={styles.title}>家庭成员信息汇总</h1>
      <p style={styles.description}>汇总学院上载的学生家庭成员信息。这是独立的家庭成员表，一个家庭成员一行；一名学生可以对应多条记录，使用 student_id_card 指向学生身份证号。</p>
      <div style={styles.placeholder}>家庭成员信息汇总表区域已预留</div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  card: {
    background: "#fff",
    border: "1px solid #d8e3ee",
    borderRadius: 8,
    padding: 22,
    boxShadow: "0 8px 22px rgba(15, 35, 64, 0.06)",
  },
  eyebrow: {
    color: "#0077d4",
    fontSize: 13,
    fontWeight: 800,
  },
  title: {
    margin: "8px 0",
    color: "#101d34",
    fontSize: 24,
  },
  description: {
    color: "#5b6b80",
    lineHeight: 1.7,
    margin: "0 0 16px",
  },
  placeholder: {
    color: "#718096",
    border: "1px dashed #b9cada",
    borderRadius: 8,
    padding: 18,
    background: "#f8fbfe",
  },
};
