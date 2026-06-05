import { useEffect, useState, type CSSProperties } from "react";
import type { CollegeProcessedBatch } from "../../types/merge";
import { getMergeBatches } from "../../db/localMergeDb";
import { getCurrentCollegeAccount, isSameSubmissionCollege } from "../../utils/collegeDetector";

export default function CollegeRecordsPage() {
  const [rows, setRows] = useState<CollegeProcessedBatch[]>([]);

  useEffect(() => {
    const currentAccount = getCurrentCollegeAccount();
    getMergeBatches().then((batches) =>
      setRows(
        currentAccount
          ? batches.filter((batch) => isSameSubmissionCollege(batch.collegeName, currentAccount.college_name))
          : batches
      )
    );
  }, []);

  return (
    <section style={styles.card}>
      <h1 style={styles.title}>学院提交记录</h1>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>提交单位</th>
              <th style={styles.th}>数据类型</th>
              <th style={styles.th}>通过人数</th>
              <th style={styles.th}>不通过人数</th>
              <th style={styles.th}>提交状态</th>
              <th style={styles.th}>最近提交时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td style={styles.td} colSpan={6}>暂无记录</td>
              </tr>
            ) : (
              rows.map((item) => (
                <tr key={item.id}>
                  <td style={styles.td}>{item.collegeName}</td>
                  <td style={styles.td}>{item.dataType === "student" ? "本专科信息" : "家庭成员信息"}</td>
                  <td style={styles.td}>{item.rowCount}</td>
                  <td style={styles.td}>0</td>
                  <td style={styles.td}>已上载</td>
                  <td style={styles.td}>{new Date(item.createdAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  card: { background: "#fff", borderRadius: 8, padding: 18, border: "1px solid #d7e1ed", boxShadow: "0 4px 14px rgba(15,35,64,0.05)" },
  title: { margin: "0 0 12px 0", color: "#172033", fontSize: 22 },
  tableWrap: { overflow: "auto", border: "1px solid #d7e1ed", borderRadius: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { border: "1px solid #d7e1ed", background: "#edf4fa", padding: 8, whiteSpace: "nowrap" },
  td: { border: "1px solid #cbd5e1", padding: 8, textAlign: "center", whiteSpace: "nowrap" },
};
