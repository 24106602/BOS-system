import type { CSSProperties } from "react";
import DatabasePage from "../DatabasePage";

const reservedAreas = [
  ["本专科信息汇总", "学院上载的学生本人困难生主信息。一名学生一行，使用 id_card 保存学生身份证号。"],
  ["家庭成员信息汇总", "学院上载的学生家庭成员信息。一个家庭成员一行，使用 student_id_card 指向学生身份证号。"],
  ["合并后困难生总表", "系统自动关联生成：通过 id_card = student_id_card 合并，最终一名学生一行，家庭成员展开为家庭成员1、家庭成员2、家庭成员3等字段。"],
  ["身份证号关联状态", "后续展示 matched、缺少家庭成员、家庭成员数量异常、特殊情况待确认等状态。"],
];

export default function AdminStudentsPage() {
  return (
    <section>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>学校困难生数据库</h1>
          <p style={styles.description}>困难生数据库属于学校管理员端，由系统自动将“本专科信息汇总”和“家庭成员信息汇总”按学生身份证号关联后生成。学院不直接上传困难生数据库。</p>
        </div>
        <button style={styles.exportButton} onClick={() => alert("导出困难生数据库功能已预留")}>
          导出困难生数据库
        </button>
      </div>

      <div style={styles.grid}>
        {reservedAreas.map(([title, description]) => (
          <section key={title} style={styles.card}>
            <h2 style={styles.cardTitle}>{title}</h2>
            <p style={styles.cardText}>{description}</p>
          </section>
        ))}
      </div>

      <section style={styles.databaseSection}>
        <DatabasePage />
      </section>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    marginBottom: 14,
    padding: 18,
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    background: "#fff",
    boxShadow: "0 4px 14px rgba(15,35,64,0.05)",
  },
  title: {
    margin: 0,
    color: "#172033",
    fontSize: 24,
  },
  description: {
    color: "#63738a",
    fontSize: 13,
    margin: "8px 0 0 0",
  },
  exportButton: {
    border: "none",
    borderRadius: 6,
    padding: "10px 14px",
    background: "#0077d4",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    marginBottom: 14,
  },
  card: {
    background: "#fff",
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    padding: 14,
  },
  cardTitle: {
    margin: "0 0 8px 0",
    color: "#172033",
    fontSize: 18,
  },
  cardText: {
    margin: 0,
    color: "#63738a",
    lineHeight: 1.6,
  },
  databaseSection: {
    minHeight: 0,
  },
};
