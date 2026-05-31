import type { CSSProperties } from "react";
import DatabasePage from "../DatabasePage";

const columns = [
  "学院",
  "姓名",
  "学号",
  "身份证号",
  "困难等级",
  "家庭成员数量",
  "家庭成员1",
  "家庭成员2",
  "家庭成员3",
  "关联状态",
];

export default function AdminStudentsPage() {
  return (
    <section>
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>困难生业务 / 系统自动关联</div>
          <h1 style={styles.title}>困难生数据库</h1>
          <p style={styles.description}>困难生数据库不是学院直接上传的。系统自动将“本专科信息汇总”和“家庭成员信息汇总”通过学生身份证号关联后生成最终总库：id_card = student_id_card。</p>
        </div>
        <button style={styles.exportButton} onClick={() => alert("导出困难生数据库功能已预留")}>导出困难生数据库</button>
      </div>

      <div style={styles.stats}>
        <Stat label="合并学生总数" value={0} />
        <Stat label="身份证号关联成功数" value={0} />
        <Stat label="家庭成员匹配异常数" value={0} tone="#c2414d" />
        <Stat label="总库导出状态" value="可导出" tone="#087b5b" />
      </div>

      <section style={styles.card}>
        <div style={styles.sectionHead}>
          <div>
            <h2 style={styles.subTitle}>困难生数据库明细表</h2>
            <p style={styles.description}>最终总库按学生展示，每名学生一行；家庭成员按关联结果展开为家庭成员1、家庭成员2、家庭成员3等字段。</p>
          </div>
          <span style={styles.badge}>自动合并生成</span>
        </div>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead><tr>{columns.map((column) => <th key={column} style={styles.th}>{column}</th>)}</tr></thead>
            <tbody><tr><td style={styles.empty} colSpan={columns.length}>暂无已合并数据</td></tr></tbody>
          </table>
        </div>
      </section>

      <section style={styles.maintenance}>
        <h2 style={styles.subTitle}>管理员基础数据维护工具</h2>
        <p style={styles.description}>以下区域仅供学校管理员维护本地基础数据和检索，不是学院上载入口。</p>
        <DatabasePage />
      </section>
    </section>
  );
}

function Stat({ label, value, tone = "#0077d4" }: { label: string; value: number | string; tone?: string }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <strong style={{ ...styles.statValue, color: tone }}>{value}</strong>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 14, padding: 18, border: "1px solid #d7e1ed", borderRadius: 8, background: "#fff", boxShadow: "0 4px 14px rgba(15,35,64,0.05)" },
  eyebrow: { color: "#0077d4", fontSize: 12, fontWeight: 800, marginBottom: 5 },
  title: { margin: 0, color: "#172033", fontSize: 24 },
  description: { color: "#63738a", fontSize: 13, lineHeight: 1.7, margin: "8px 0 0" },
  exportButton: { border: "none", borderRadius: 6, padding: "10px 14px", background: "#0077d4", color: "#fff", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 14 },
  stat: { background: "#fff", border: "1px solid #d7e1ed", borderRadius: 8, padding: 14 },
  statLabel: { color: "#63738a", marginBottom: 7, fontSize: 13 },
  statValue: { fontSize: 24 },
  card: { background: "#fff", border: "1px solid #d7e1ed", borderRadius: 8, padding: 16, marginBottom: 14 },
  maintenance: { background: "#fff", border: "1px solid #d7e1ed", borderRadius: 8, padding: 16 },
  sectionHead: { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", marginBottom: 12 },
  subTitle: { margin: 0, color: "#172033", fontSize: 17 },
  badge: { padding: "5px 8px", borderRadius: 999, background: "#e8f4ff", color: "#0077d4", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" },
  tableWrap: { overflow: "auto", border: "1px solid #d7e1ed", borderRadius: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { background: "#edf4fa", color: "#40526a", padding: 9, textAlign: "center", whiteSpace: "nowrap" },
  empty: { borderTop: "1px solid #e3ebf3", padding: 18, color: "#8190a4", textAlign: "center" },
};
