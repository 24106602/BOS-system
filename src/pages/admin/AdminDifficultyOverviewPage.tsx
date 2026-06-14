import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getMergeBatches } from "../../db/localMergeDb";
import type { CollegeProcessedBatch } from "../../types/merge";
import { collegeAccounts, isSameSubmissionCollege } from "../../utils/collegeDetector";

type AdminDifficultyOverviewPageProps = {
  onNavigate?: (to: string) => void;
};

export default function AdminDifficultyOverviewPage({ onNavigate }: AdminDifficultyOverviewPageProps) {
  const [batches, setBatches] = useState<CollegeProcessedBatch[]>([]);

  useEffect(() => {
    getMergeBatches().then(setBatches);
  }, []);

  const studentRows = batches.filter((item) => item.dataType === "student");
  const familyRows = batches.filter((item) => item.dataType === "family");
  const studentTotal = studentRows.reduce((sum, item) => sum + item.rowCount, 0);
  const familyTotal = familyRows.reduce((sum, item) => sum + item.rowCount, 0);
  const submittedColleges = useMemo(
    () =>
      collegeAccounts.filter((college) =>
        batches.some((batch) => isSameSubmissionCollege(batch.collegeName, college.college_name))
      ),
    [batches]
  );
  const recentLogs = [...batches].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);

  const progressRows = collegeAccounts.map((college) => {
    const collegeBatches = batches.filter((batch) => isSameSubmissionCollege(batch.collegeName, college.college_name));
    const studentCount = collegeBatches.filter((item) => item.dataType === "student").reduce((sum, item) => sum + item.rowCount, 0);
    const familyCount = collegeBatches.filter((item) => item.dataType === "family").reduce((sum, item) => sum + item.rowCount, 0);
    return {
      collegeName: college.college_name,
      account: college.login_email,
      studentCount,
      familyCount,
      submitted: studentCount > 0 || familyCount > 0,
      lastAt: collegeBatches.map((item) => item.createdAt).sort().at(-1) || "",
    };
  });

  return (
    <section style={styles.page}>
      <div style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>困难生业务 / 业务总览</div>
          <h1 style={styles.title}>困难生业务工作区</h1>
          <p style={styles.description}>集中查看困难生本专科信息、家庭成员信息、学院上载进度和系统自动合并生成的困难生数据库。</p>
        </div>
        <span style={styles.enabledBadge}>已启用</span>
      </div>

      <div style={styles.stats}>
        <Stat label="全校困难生总人数" value={studentTotal} />
        <Stat label="已提交学院数" value={`${submittedColleges.length} / ${collegeAccounts.length}`} />
        <Stat label="本专科信息总数" value={studentTotal} />
        <Stat label="家庭成员信息总数" value={familyTotal} />
        <Stat label="身份证号关联成功数" value={0} />
        <Stat label="家庭成员匹配异常数" value={0} tone="#c2414d" />
      </div>

      <div style={styles.quickGrid}>
        <QuickCard title="全校数据汇总" text="查看学院提交状态、全校统计和最近上载日志。" onClick={() => onNavigate?.("/admin/summary")} />
        <QuickCard title="本专科信息汇总" text="查看学院上载的学生本人主信息。" onClick={() => onNavigate?.("/admin/student-summary")} />
        <QuickCard title="家庭成员信息汇总" text="查看学院上载的家庭成员信息。" onClick={() => onNavigate?.("/admin/family-summary")} />
        <QuickCard title="困难生数据库" text="按 id_card = student_id_card 自动关联生成最终总库。" onClick={() => onNavigate?.("/admin/students")} />
      </div>

      <div style={styles.twoColumn}>
        <section style={styles.card}>
          <h2 style={styles.subTitle}>12 个学院提交进度</h2>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>学院</th>
                  <th style={styles.th}>账号</th>
                  <th style={styles.th}>本专科</th>
                  <th style={styles.th}>家庭成员</th>
                  <th style={styles.th}>状态</th>
                </tr>
              </thead>
              <tbody>
                {progressRows.map((item) => (
                  <tr key={item.account}>
                    <td style={styles.nameCell}>{item.collegeName}</td>
                    <td style={styles.td}>{item.account}</td>
                    <td style={styles.td}>{item.studentCount}</td>
                    <td style={styles.td}>{item.familyCount}</td>
                    <td style={styles.td}>
                      <span style={item.submitted ? styles.submitted : styles.pending}>{item.submitted ? "已上载" : "待上载"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={styles.card}>
          <h2 style={styles.subTitle}>最近上载日志</h2>
          <div style={styles.logList}>
            {recentLogs.length === 0 ? (
              <div style={styles.empty}>暂无上载日志</div>
            ) : (
              recentLogs.map((item) => (
                <div key={item.id} style={styles.logItem}>
                  <strong>{item.collegeName}</strong>
                  <span>{item.dataType === "student" ? "本专科信息" : "家庭成员信息"} / {item.rowCount} 条</span>
                  <small>{new Date(item.createdAt).toLocaleString()}</small>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
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

function QuickCard({ title, text, onClick }: { title: string; text: string; onClick?: () => void }) {
  return (
    <button style={styles.quickCard} onClick={onClick}>
      <strong>{title}</strong>
      <span>{text}</span>
    </button>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { height: "calc(100vh - 104px)", minHeight: 650, display: "grid", gridTemplateRows: "auto auto auto minmax(0, 1fr)", gap: 12, overflow: "hidden" },
  hero: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: 16, border: "1px solid #d7e1ed", borderRadius: 8, background: "#fff", boxShadow: "0 4px 14px rgba(15,35,64,0.05)" },
  eyebrow: { color: "#0077d4", fontSize: 13, fontWeight: 800 },
  title: { margin: "5px 0 7px", color: "#172033", fontSize: 26 },
  description: { margin: 0, color: "#63738a", fontSize: 14, lineHeight: 1.7 },
  enabledBadge: { padding: "6px 10px", borderRadius: 999, background: "#e9f8f2", color: "#087b5b", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 10 },
  stat: { height: 76, boxSizing: "border-box", padding: 12, border: "1px solid #d7e1ed", borderRadius: 8, background: "#fff" },
  statLabel: { color: "#63738a", marginBottom: 7, fontSize: 13 },
  statValue: { fontSize: 24 },
  quickGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 },
  quickCard: { display: "grid", gap: 6, textAlign: "left", padding: 13, border: "1px solid #d7e1ed", borderRadius: 8, background: "#fff", color: "#172033", cursor: "pointer" },
  twoColumn: { minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(280px, 0.65fr)", gap: 12, overflow: "hidden" },
  card: { minHeight: 0, display: "flex", flexDirection: "column", padding: 14, border: "1px solid #d7e1ed", borderRadius: 8, background: "#fff", overflow: "hidden" },
  subTitle: { margin: "0 0 12px", color: "#172033", fontSize: 17 },
  tableWrap: { flex: 1, minHeight: 0, overflow: "auto", border: "1px solid #d7e1ed", borderRadius: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { position: "sticky", top: 0, zIndex: 1, background: "#edf4fa", color: "#40526a", padding: 9, textAlign: "center", whiteSpace: "nowrap" },
  td: { borderTop: "1px solid #e3ebf3", padding: 9, textAlign: "center", whiteSpace: "nowrap", color: "#52647b" },
  nameCell: { borderTop: "1px solid #e3ebf3", padding: 9, color: "#26364e", whiteSpace: "nowrap" },
  submitted: { display: "inline-flex", padding: "3px 7px", borderRadius: 999, background: "#e8f7f1", color: "#087b5b", fontWeight: 700, fontSize: 12 },
  pending: { display: "inline-flex", padding: "3px 7px", borderRadius: 999, background: "#f2f5f8", color: "#728197", fontWeight: 700, fontSize: 12 },
  logList: { flex: 1, minHeight: 0, overflow: "auto", paddingRight: 4 },
  logItem: { display: "grid", gap: 4, padding: "10px 0", borderBottom: "1px solid #edf1f6", color: "#52647b", fontSize: 13 },
  empty: { color: "#8190a4", padding: 12 },
};
