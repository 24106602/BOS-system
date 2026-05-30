import type { CSSProperties } from "react";
import DatabasePage from "../DatabasePage";

const reservedAreas = [
  ["本专科信息表", "学生主信息区域：后续展示学院、学号、姓名、身份证号、困难档次与审核状态。"],
  ["家庭成员信息表", "学生附属信息区域：后续按学生身份证号展示一名学生对应的多条家庭成员记录。"],
  ["合并后困难生总表", "学校端总表区域：后续展示本专科主信息与家庭成员信息合并结果。"],
  ["身份证号关联状态", "后续展示 matched、缺少家庭成员、家庭成员数量异常、特殊情况待确认等状态。"],
];

export default function AdminStudentsPage() {
  return (
    <section>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>学校困难生数据库</h1>
          <p style={styles.description}>困难生数据库属于学校管理员端。本专科信息作为主信息，家庭成员信息通过学生身份证号关联。</p>
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
  },
  title: {
    margin: 0,
    color: "#0f172a",
  },
  description: {
    color: "#475569",
    margin: "8px 0 0 0",
  },
  exportButton: {
    border: "none",
    borderRadius: 10,
    padding: "10px 14px",
    background: "#2563eb",
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
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    padding: 14,
  },
  cardTitle: {
    margin: "0 0 8px 0",
    color: "#0f172a",
    fontSize: 18,
  },
  cardText: {
    margin: 0,
    color: "#475569",
    lineHeight: 1.6,
  },
  databaseSection: {
    minHeight: 0,
  },
};
