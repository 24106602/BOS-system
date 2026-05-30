import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getMergeBatches } from "../../db/localMergeDb";
import { exportMergedExcel } from "../../services/mergeService";
import type { CollegeProcessedBatch } from "../../types/merge";

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

export default function AdminSummaryPage() {
  const [batches, setBatches] = useState<CollegeProcessedBatch[]>([]);

  useEffect(() => {
    getMergeBatches().then(setBatches);
  }, []);

  const studentBatches = useMemo(
    () => batches.filter((item) => item.dataType === "student"),
    [batches]
  );
  const submittedColleges = new Set(batches.map((item) => item.collegeName));
  const totalStudents = studentBatches.reduce((sum, item) => sum + item.rowCount, 0);
  const collegeRows = allColleges.map((collegeName) => {
    const rows = studentBatches
      .filter((item) => item.collegeName === collegeName)
      .reduce((sum, item) => sum + item.rowCount, 0);
    return { collegeName, rows };
  });
  const recentLogs = [...batches]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  const exportSummary = () => {
    if (batches.length === 0) {
      alert("暂无学院已通过数据可导出");
      return;
    }
    exportMergedExcel(batches);
  };

  return (
    <section style={styles.card}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>全校数据汇总</h1>
          <p style={styles.description}>全校数据汇总是从已上载并通过的数据中自动统计出来的汇总看板，不是原始数据库。这里展示学院上载情况、全校统计和最近上载日志。</p>
        </div>
        <button style={styles.exportButton} onClick={exportSummary}>导出全校汇总表</button>
      </div>

      <div style={styles.stats}>
        <Stat label="全校总人数" value={totalStudents} />
        <Stat label="已提交学院数" value={submittedColleges.size} />
        <Stat label="未提交学院数" value={Math.max(0, allColleges.length - submittedColleges.size)} />
      </div>

      <section style={styles.section}>
        <h2 style={styles.subTitle}>各学院汇总</h2>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>学院名称</th>
              <th style={styles.th}>提交人数</th>
              <th style={styles.th}>通过人数</th>
              <th style={styles.th}>不通过人数</th>
            </tr>
          </thead>
          <tbody>
            {collegeRows.map((item) => (
              <tr key={item.collegeName}>
                <td style={styles.td}>{item.collegeName}</td>
                <td style={styles.td}>{item.rows}</td>
                <td style={styles.td}>{item.rows}</td>
                <td style={styles.td}>0</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={styles.section}>
        <h2 style={styles.subTitle}>最近上载日志</h2>
        {recentLogs.length === 0 ? (
          <p style={styles.description}>暂无上载日志</p>
        ) : (
          recentLogs.map((item) => (
            <div key={item.id} style={styles.logItem}>
              {new Date(item.createdAt).toLocaleString()}：{item.collegeName} 上载 {item.dataType === "student" ? "本专科信息" : "家庭成员信息"} {item.rowCount} 条
            </div>
          ))
        )}
      </section>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <strong style={styles.statValue}>{value}</strong>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  card: {
    background: "#fff",
    borderRadius: 8,
    padding: 20,
    border: "1px solid #d7e1ed",
    boxShadow: "0 4px 14px rgba(15,35,64,0.05)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    marginBottom: 14,
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
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 12,
    marginBottom: 14,
  },
  stat: {
    background: "#f8fbfe",
    border: "1px solid #dbe5ef",
    borderRadius: 6,
    padding: 14,
  },
  statLabel: {
    color: "#63738a",
    marginBottom: 6,
  },
  statValue: {
    color: "#172033",
    fontSize: 24,
  },
  section: {
    marginTop: 14,
    paddingTop: 12,
    borderTop: "1px solid #e3ebf3",
  },
  subTitle: {
    margin: "0 0 10px 0",
    color: "#172033",
    fontSize: 18,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    border: "1px solid #cbd5e1",
    background: "#edf4fa",
    padding: 8,
    textAlign: "center",
  },
  td: {
    border: "1px solid #cbd5e1",
    padding: 8,
    textAlign: "center",
  },
  logItem: {
    color: "#54657c",
    borderBottom: "1px solid #edf1f6",
    padding: "8px 0",
  },
};
