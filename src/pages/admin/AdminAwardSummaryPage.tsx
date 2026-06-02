import { useMemo, useState, type CSSProperties } from "react";
import { exportAwardSummary, getAwardSubmissions } from "../../services/awardProcessor";
import { awardTypeLabels } from "../../services/awardConfig";
import type { AwardSubmission, AwardType } from "../../types/award";

type CollegeSummary = {
  collegeName: string;
  rowCount: number;
  lastSubmittedAt: string;
};

type AdminAwardSummaryPageProps = {
  awardType: AwardType;
};

export default function AdminAwardSummaryPage({ awardType }: AdminAwardSummaryPageProps) {
  const awardName = awardTypeLabels[awardType];
  const [submissions] = useState<AwardSubmission[]>(() => getAwardSubmissions(awardType));

  const collegeSummaries = useMemo(() => {
    const map = new Map<string, CollegeSummary>();
    submissions.forEach((submission) => {
      const current = map.get(submission.collegeName);
      map.set(submission.collegeName, {
        collegeName: submission.collegeName,
        rowCount: (current?.rowCount || 0) + submission.rowCount,
        lastSubmittedAt:
          !current || submission.createdAt > current.lastSubmittedAt
            ? submission.createdAt
            : current.lastSubmittedAt,
      });
    });
    return [...map.values()].sort((a, b) => b.rowCount - a.rowCount);
  }, [submissions]);

  const awardTypeCounts = useMemo(
    () =>
      submissions.reduce<Record<string, number>>((counts, submission) => {
        Object.entries(submission.awardTypeCounts).forEach(([type, count]) => {
          counts[type] = (counts[type] || 0) + count;
        });
        return counts;
      }, {}),
    [submissions]
  );

  const total = submissions.reduce((sum, submission) => sum + submission.rowCount, 0);

  const exportSummary = () => {
    try {
      exportAwardSummary(submissions, awardName);
    } catch (error) {
      alert(error instanceof Error ? error.message : `暂无${awardName}汇总数据`);
    }
  };

  return (
    <section style={styles.card}>
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>三奖业务 / 学校端自动汇总</div>
          <h1 style={styles.title}>{awardName}汇总</h1>
          <p style={styles.description}>学院端{awardName}数据全部通过并上载后，系统自动汇总到这里。目前使用独立 localStorage 数据池保存提交记录，后续可替换为 Supabase。</p>
        </div>
        <button style={styles.exportButton} onClick={exportSummary}>导出{awardName}汇总</button>
      </div>

      <div style={styles.stats}>
        <Stat label="全校总人数" value={total} />
        <Stat label="已提交学院数" value={collegeSummaries.length} />
        <Stat label="奖项类型数" value={Object.keys(awardTypeCounts).length} />
        <Stat label="提交批次数" value={submissions.length} />
      </div>

      <section style={styles.section}>
        <h2 style={styles.subTitle}>各学院提交人数</h2>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>学院名称</th>
                <th style={styles.th}>提交人数</th>
                <th style={styles.th}>最近上载时间</th>
                <th style={styles.th}>状态</th>
              </tr>
            </thead>
            <tbody>
              {collegeSummaries.length === 0 ? (
                <tr><td style={styles.empty} colSpan={4}>暂无学院上载{awardName}数据</td></tr>
              ) : (
                collegeSummaries.map((item) => (
                  <tr key={item.collegeName}>
                    <td style={styles.nameCell}>{item.collegeName}</td>
                    <td style={styles.td}>{item.rowCount}</td>
                    <td style={styles.td}>{new Date(item.lastSubmittedAt).toLocaleString()}</td>
                    <td style={styles.td}><span style={styles.submitted}>已上载</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.subTitle}>各奖项类型人数</h2>
        <div style={styles.typeGrid}>
          {Object.keys(awardTypeCounts).length === 0 ? (
            <div style={styles.empty}>暂无奖项类型统计</div>
          ) : (
            Object.entries(awardTypeCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => <Stat key={type} label={type} value={count} tone="#6757c8" />)
          )}
        </div>
      </section>
    </section>
  );
}

function Stat({ label, value, tone = "#0077d4" }: { label: string; value: number; tone?: string }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <strong style={{ ...styles.statValue, color: tone }}>{value}</strong>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  card: { background: "#fff", borderRadius: 8, padding: 20, border: "1px solid #d7e1ed", boxShadow: "0 4px 14px rgba(15,35,64,0.05)" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 16 },
  eyebrow: { color: "#0077d4", fontSize: 12, fontWeight: 800, marginBottom: 5 },
  title: { margin: 0, color: "#172033", fontSize: 24 },
  description: { color: "#63738a", fontSize: 13, lineHeight: 1.7, margin: "8px 0 0" },
  exportButton: { border: "none", borderRadius: 6, padding: "10px 14px", background: "#0077d4", color: "#fff", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 14 },
  stat: { background: "#f8fbfe", border: "1px solid #dbe5ef", borderRadius: 6, padding: 14 },
  statLabel: { color: "#63738a", marginBottom: 6, fontSize: 13 },
  statValue: { fontSize: 25 },
  section: { marginTop: 16, paddingTop: 14, borderTop: "1px solid #e3ebf3" },
  subTitle: { margin: "0 0 10px", color: "#172033", fontSize: 17 },
  tableWrap: { overflow: "auto", border: "1px solid #d7e1ed", borderRadius: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { borderBottom: "1px solid #d7e1ed", background: "#edf4fa", color: "#40526a", padding: 9, textAlign: "center", whiteSpace: "nowrap" },
  td: { borderTop: "1px solid #e3ebf3", padding: 9, textAlign: "center", whiteSpace: "nowrap", color: "#52647b" },
  nameCell: { borderTop: "1px solid #e3ebf3", padding: 9, color: "#26364e", whiteSpace: "nowrap" },
  submitted: { display: "inline-flex", padding: "3px 7px", borderRadius: 999, background: "#e8f7f1", color: "#087b5b", fontWeight: 700, fontSize: 12 },
  typeGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 },
  empty: { padding: 18, color: "#8190a4", textAlign: "center" },
};
