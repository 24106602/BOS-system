import { useMemo, useState, type CSSProperties } from "react";
import { getAwardSubmissions } from "../../../services/awardProcessor";
import { awardTypeLabels, awardTypes } from "../../../services/awardConfig";
import type { AwardSubmission, AwardType } from "../../../types/award";

type AwardOverview = {
  awardType: AwardType;
  submissions: AwardSubmission[];
  totalRows: number;
  passedRows: number;
  failedRows: number;
  collegeCount: number;
  lastSubmittedAt: string;
};

export default function AdminAwardsOverviewPage() {
  const [submissionsByType] = useState<Record<AwardType, AwardSubmission[]>>(() => ({
    national: getAwardSubmissions("national"),
    inspirational: getAwardSubmissions("inspirational"),
    shanghai: getAwardSubmissions("shanghai"),
  }));

  const rows = useMemo<AwardOverview[]>(
    () =>
      awardTypes.map((awardType) => {
        const submissions = submissionsByType[awardType];
        return {
          awardType,
          submissions,
          totalRows: submissions.reduce((sum, item) => sum + item.rowCount, 0),
          passedRows: submissions.reduce((sum, item) => sum + item.rowCount, 0),
          failedRows: 0,
          collegeCount: new Set(submissions.map((item) => item.collegeName)).size,
          lastSubmittedAt: submissions.map((item) => item.createdAt).sort().at(-1) || "",
        };
      }),
    [submissionsByType]
  );

  const totalRows = rows.reduce((sum, item) => sum + item.totalRows, 0);
  const totalBatches = rows.reduce((sum, item) => sum + item.submissions.length, 0);
  const submittedCollegeCount = new Set(
    rows.flatMap((item) => item.submissions.map((submission) => submission.collegeName))
  ).size;

  return (
    <section style={styles.card}>
      <div style={styles.eyebrow}>三奖业务 / 学校端自动汇总</div>
      <h1 style={styles.title}>三奖提交总览</h1>
      <p style={styles.description}>分别查看国家奖学金、国家励志奖学金和上海市奖学金的学院提交进度。三个奖项使用独立数据池，不会混合统计。</p>

      <div style={styles.stats}>
        <Stat label="三奖总人数" value={totalRows} />
        <Stat label="国家奖学金提交人数" value={rows.find((item) => item.awardType === "national")?.totalRows || 0} />
        <Stat label="国家励志奖学金提交人数" value={rows.find((item) => item.awardType === "inspirational")?.totalRows || 0} />
        <Stat label="上海市奖学金提交人数" value={rows.find((item) => item.awardType === "shanghai")?.totalRows || 0} />
        <Stat label="上海市奖学金通过人数" value={rows.find((item) => item.awardType === "shanghai")?.passedRows || 0} />
        <Stat label="上海市奖学金不通过人数" value={rows.find((item) => item.awardType === "shanghai")?.failedRows || 0} />
        <Stat label="已提交学院数" value={submittedCollegeCount} />
        <Stat label="提交批次数" value={totalBatches} />
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>奖项</th>
              <th style={styles.th}>提交人数</th>
              <th style={styles.th}>已提交学院数</th>
              <th style={styles.th}>通过人数</th>
              <th style={styles.th}>不通过人数</th>
              <th style={styles.th}>提交批次数</th>
              <th style={styles.th}>最近上载时间</th>
              <th style={styles.th}>状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.awardType}>
                <td style={styles.nameCell}>{awardTypeLabels[item.awardType]}</td>
                <td style={styles.td}>{item.totalRows}</td>
                <td style={styles.td}>{item.collegeCount}</td>
                <td style={styles.td}>{item.passedRows}</td>
                <td style={styles.td}>{item.failedRows}</td>
                <td style={styles.td}>{item.submissions.length}</td>
                <td style={styles.td}>{item.lastSubmittedAt ? new Date(item.lastSubmittedAt).toLocaleString() : "-"}</td>
                <td style={styles.td}><span style={item.totalRows > 0 ? styles.submitted : styles.pending}>{item.totalRows > 0 ? "已上载" : "待上载"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  card: { background: "#fff", borderRadius: 8, padding: 20, border: "1px solid #d7e1ed", boxShadow: "0 4px 14px rgba(15,35,64,0.05)" },
  eyebrow: { color: "#0077d4", fontSize: 12, fontWeight: 800, marginBottom: 5 },
  title: { margin: 0, color: "#172033", fontSize: 24 },
  description: { color: "#63738a", fontSize: 13, lineHeight: 1.7, margin: "8px 0 16px" },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 },
  stat: { background: "#f8fbfe", border: "1px solid #dbe5ef", borderRadius: 6, padding: 14 },
  statLabel: { color: "#63738a", marginBottom: 6, fontSize: 13 },
  statValue: { color: "#0077d4", fontSize: 25 },
  tableWrap: { overflow: "auto", border: "1px solid #d7e1ed", borderRadius: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { borderBottom: "1px solid #d7e1ed", background: "#edf4fa", color: "#40526a", padding: 9, textAlign: "center", whiteSpace: "nowrap" },
  td: { borderTop: "1px solid #e3ebf3", padding: 9, textAlign: "center", whiteSpace: "nowrap", color: "#52647b" },
  nameCell: { borderTop: "1px solid #e3ebf3", padding: 9, color: "#26364e", whiteSpace: "nowrap" },
  submitted: { display: "inline-flex", padding: "3px 7px", borderRadius: 999, background: "#e8f7f1", color: "#087b5b", fontWeight: 700, fontSize: 12 },
  pending: { display: "inline-flex", padding: "3px 7px", borderRadius: 999, background: "#f2f5f8", color: "#728197", fontWeight: 700, fontSize: 12 },
};
