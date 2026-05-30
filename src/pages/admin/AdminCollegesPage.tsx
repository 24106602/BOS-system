import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getMergeBatches } from "../../db/localMergeDb";
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

type CollegeSummary = {
  collegeName: string;
  studentRows: number;
  familyRows: number;
  passedRows: number;
  failedRows: number;
  lastSubmittedAt: string;
};

const makeSummary = (collegeName: string, batches: CollegeProcessedBatch[]): CollegeSummary => {
  const collegeBatches = batches.filter((item) => item.collegeName === collegeName);
  const studentRows = collegeBatches
    .filter((item) => item.dataType === "student")
    .reduce((sum, item) => sum + item.rowCount, 0);
  const familyRows = collegeBatches
    .filter((item) => item.dataType === "family")
    .reduce((sum, item) => sum + item.rowCount, 0);
  const latest = collegeBatches
    .map((item) => item.createdAt)
    .sort()
    .at(-1) || "";

  return {
    collegeName,
    studentRows,
    familyRows,
    passedRows: studentRows,
    failedRows: 0,
    lastSubmittedAt: latest,
  };
};

export default function AdminCollegesPage() {
  const [batches, setBatches] = useState<CollegeProcessedBatch[]>([]);

  useEffect(() => {
    getMergeBatches().then(setBatches);
  }, []);

  const summaries = useMemo(
    () => allColleges.map((collegeName) => makeSummary(collegeName, batches)),
    [batches]
  );

  return (
    <section style={styles.card}>
      <h1 style={styles.title}>学院提交情况</h1>
      <p style={styles.description}>学院治理通过后提交到学校端。当前页面汇总各学院提交批次，日志入口预留用于后续查看详细治理记录。</p>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>学院名称</th>
              <th style={styles.th}>是否已提交</th>
              <th style={styles.th}>本专科信息提交人数</th>
              <th style={styles.th}>家庭成员信息提交人数</th>
              <th style={styles.th}>通过人数</th>
              <th style={styles.th}>不通过人数</th>
              <th style={styles.th}>最后提交时间</th>
              <th style={styles.th}>提交状态</th>
              <th style={styles.th}>日志入口</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((item) => {
              const submitted = item.studentRows > 0 || item.familyRows > 0;
              return (
                <tr key={item.collegeName}>
                  <td style={styles.td}>{item.collegeName}</td>
                  <td style={styles.td}>{submitted ? "是" : "否"}</td>
                  <td style={styles.td}>{item.studentRows}</td>
                  <td style={styles.td}>{item.familyRows}</td>
                  <td style={styles.td}>{item.passedRows}</td>
                  <td style={styles.td}>{item.failedRows}</td>
                  <td style={styles.td}>{item.lastSubmittedAt ? new Date(item.lastSubmittedAt).toLocaleString() : "-"}</td>
                  <td style={styles.td}>{submitted ? "已提交" : "未提交"}</td>
                  <td style={styles.td}>
                    <button
                      style={styles.logButton}
                      onClick={() => alert(`${item.collegeName}：详细提交日志功能已预留`)}
                    >
                      查看日志
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  card: {
    background: "#fff",
    borderRadius: 16,
    padding: 20,
    border: "1px solid #cbd5e1",
  },
  title: {
    margin: "0 0 8px 0",
    color: "#0f172a",
  },
  description: {
    color: "#475569",
    margin: "0 0 14px 0",
  },
  tableWrap: {
    overflow: "auto",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    border: "1px solid #cbd5e1",
    background: "#e2e8f0",
    padding: 8,
    whiteSpace: "nowrap",
  },
  td: {
    border: "1px solid #cbd5e1",
    padding: 8,
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  logButton: {
    border: "none",
    borderRadius: 8,
    padding: "7px 10px",
    background: "#2563eb",
    color: "#fff",
    cursor: "pointer",
  },
};
