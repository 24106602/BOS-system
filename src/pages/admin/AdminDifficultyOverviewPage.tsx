import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getMergeBatches } from "../../db/localMergeDb";
import type { CollegeProcessedBatch } from "../../types/merge";
import { ACADEMIC_YEAR_OPTIONS, getCurrentAcademicYear, isBatchInAcademicYear } from "../../utils/academicYear";
import { collegeAccounts, isSameSubmissionCollege } from "../../utils/collegeDetector";

type AdminDifficultyOverviewPageProps = {
  onNavigate?: (to: string) => void;
};

export default function AdminDifficultyOverviewPage({ onNavigate }: AdminDifficultyOverviewPageProps) {
  const [batches, setBatches] = useState<CollegeProcessedBatch[]>([]);
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());

  useEffect(() => {
    getMergeBatches().then(setBatches);
  }, []);

  const yearBatches = useMemo(
    () => batches.filter((item) => isBatchInAcademicYear(item, academicYear)),
    [academicYear, batches]
  );
  const studentRows = yearBatches.filter((item) => item.dataType === "student");
  const familyRows = yearBatches.filter((item) => item.dataType === "family");
  const studentTotal = studentRows.reduce((sum, item) => sum + item.rowCount, 0);
  const familyTotal = familyRows.reduce((sum, item) => sum + item.rowCount, 0);
  const submittedColleges = useMemo(
    () =>
      collegeAccounts.filter((college) =>
        yearBatches.some((batch) => isSameSubmissionCollege(batch.collegeName, college.college_name))
      ),
    [yearBatches]
  );
  const recentLogs = [...yearBatches].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);

  const progressRows = collegeAccounts.map((college) => {
    const collegeBatches = yearBatches.filter((batch) => isSameSubmissionCollege(batch.collegeName, college.college_name));
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
    <section className="bos-table-page difficulty-workspace">
      <header className="bos-page-title-row">
        <div>
          <div className="bos-breadcrumb">困难生业务 / 业务总览</div>
          <h1>困难生业务工作区</h1>
          <p>集中查看困难生本专科信息、家庭成员信息、学院上载进度和系统自动合并生成的困难生数据库。</p>
        </div>
        <label className="bos-current-year">
          当前学年
          <select value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}>
            {ACADEMIC_YEAR_OPTIONS.map((year) => <option key={year}>{year}</option>)}
          </select>
        </label>
      </header>

      <div className="difficulty-stat-grid">
        <Stat label="全校困难生总人数" value={studentTotal} />
        <Stat label="已提交学院数" value={`${submittedColleges.length} / ${collegeAccounts.length}`} />
        <Stat label="本专科信息总数" value={studentTotal} />
        <Stat label="家庭成员信息总数" value={familyTotal} />
        <Stat label="身份证号关联成功数" value={0} />
        <Stat label="家庭成员匹配异常数" value={0} tone="#c2414d" />
      </div>

      <div className="bos-action-toolbar">
        <button className="is-primary" onClick={() => onNavigate?.("/admin/summary")}>全校数据汇总</button>
        <button onClick={() => onNavigate?.("/admin/student-summary")}>本专科信息汇总</button>
        <button onClick={() => onNavigate?.("/admin/family-summary")}>家庭成员信息汇总</button>
        <button onClick={() => onNavigate?.("/admin/students")}>困难生数据库</button>
      </div>

      <div className="difficulty-summary-split">
        <section className="bos-table-card">
          <div className="bos-table-card-head">
            <h2>12 个学院提交进度</h2>
            <span>{academicYear}</span>
          </div>
          <div className="bos-table-card-body">
            <div>
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
          </div>
        </section>

        <section className="bos-table-card">
          <div className="bos-table-card-head">
            <h2>最近上载日志</h2>
            <span>最近 {recentLogs.length} 条</span>
          </div>
          <div className="bos-table-card-body">
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
          </div>
        </section>
      </div>
    </section>
  );
}

function Stat({ label, value, tone = "#0077d4" }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="difficulty-stat-card">
      <span>{label}</span>
      <strong style={{ color: tone }}>{value}</strong>
    </div>
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
