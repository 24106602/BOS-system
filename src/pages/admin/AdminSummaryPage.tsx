import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getMergeBatches } from "../../db/localMergeDb";
import { exportMergedExcel } from "../../services/mergeService";
import type { CollegeProcessedBatch } from "../../types/merge";
import {
  ACADEMIC_YEAR_OPTIONS,
  getBatchAcademicYear,
  getCurrentAcademicYear,
  isBatchInAcademicYear,
} from "../../utils/academicYear";
import { collegeAccounts, isSameSubmissionCollege, normalizeSubmissionCollegeName, type CollegeAccount } from "../../utils/collegeDetector";
import PageHeader from "../../components/ui/PageHeader";
import StatCard from "../../components/ui/StatCard";
import Toolbar from "../../components/ui/Toolbar";

type CollegeSummary = {
  college: CollegeAccount;
  studentRows: number;
  familyRows: number;
  passedRows: number;
  failedRows: number;
  lastSubmittedAt: string;
};

const makeSummary = (college: CollegeAccount, batches: CollegeProcessedBatch[]): CollegeSummary => {
  const collegeBatches = batches.filter((item) => isSameSubmissionCollege(item.collegeName, college.college_name));
  const studentRows = collegeBatches
    .filter((item) => item.dataType === "student")
    .reduce((sum, item) => sum + item.rowCount, 0);
  const familyRows = collegeBatches
    .filter((item) => item.dataType === "family")
    .reduce((sum, item) => sum + item.rowCount, 0);

  return {
    college,
    studentRows,
    familyRows,
    passedRows: studentRows,
    failedRows: 0,
    lastSubmittedAt: collegeBatches.map((item) => item.createdAt).sort().at(-1) || "",
  };
};

export default function AdminSummaryPage() {
  const [batches, setBatches] = useState<CollegeProcessedBatch[]>([]);
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());

  useEffect(() => {
    getMergeBatches().then(setBatches);
  }, []);

  const yearBatches = useMemo(
    () => batches.filter((item) => isBatchInAcademicYear(item, academicYear)),
    [academicYear, batches]
  );
  const summaries = useMemo(
    () => collegeAccounts.map((college) => makeSummary(college, yearBatches)),
    [yearBatches]
  );
  const recentLogs = useMemo(
    () => [...yearBatches].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8),
    [yearBatches]
  );

  const totalStudents = yearBatches
    .filter((item) => item.dataType === "student")
    .reduce((sum, item) => sum + item.rowCount, 0);
  const submittedCount = summaries.filter((item) => item.studentRows > 0 || item.familyRows > 0).length;
  const passedCount = summaries.reduce((sum, item) => sum + item.passedRows, 0);
  const failedCount = summaries.reduce((sum, item) => sum + item.failedRows, 0);

  const exportSummary = () => {
    if (yearBatches.length === 0) {
      alert("暂无当前学年可导出的汇总数据");
      return;
    }
    exportMergedExcel(yearBatches);
  };

  return (
    <section className="bos-table-page difficulty-workspace">
      <PageHeader
        breadcrumb="困难生业务 / 学校端自动汇总"
        title="全校数据汇总"
        description="按学年查看各学院困难生数据提交、通过情况和最近上载记录。"
        actions={(
          <label className="bos-current-year">
            当前学年
            <select value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}>
              {ACADEMIC_YEAR_OPTIONS.map((year) => <option key={year}>{year}</option>)}
            </select>
          </label>
        )}
      />

      <div className="bos-stat-grid">
        <StatCard label="全校总人数" value={totalStudents} />
        <StatCard label="已提交学院" value={submittedCount} tone="green" />
        <StatCard label="未提交学院" value={collegeAccounts.length - submittedCount} tone="amber" />
        <StatCard label="通过人数" value={passedCount} tone="green" />
        <StatCard label="不通过人数" value={failedCount} tone="red" />
      </div>

      <Toolbar>
        <button className="is-primary" onClick={exportSummary}>导出当前学年汇总表</button>
      </Toolbar>

      <div className="difficulty-summary-split difficulty-summary-split--wide">
      <section className="bos-table-card">
        <div className="bos-table-card-head">
          <h2>当前学年各学院提交状态</h2>
          <span>{summaries.length} 个学院</span>
        </div>
        <div className="bos-table-card-body">
          <div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>学院名称</th>
                <th style={styles.th}>登录账号</th>
                <th style={styles.th}>是否提交</th>
                <th style={styles.th}>本专科信息人数</th>
                <th style={styles.th}>家庭成员信息人数</th>
                <th style={styles.th}>通过人数</th>
                <th style={styles.th}>不通过人数</th>
                <th style={styles.th}>最近上载时间</th>
                <th style={styles.th}>状态</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((item) => {
                const submitted = item.studentRows > 0 || item.familyRows > 0;
                return (
                  <tr key={item.college.college_code}>
                    <td style={styles.nameCell}>{item.college.college_name}</td>
                    <td style={styles.td}>{item.college.login_email}</td>
                    <td style={styles.td}>{submitted ? "是" : "否"}</td>
                    <td style={styles.td}>{item.studentRows}</td>
                    <td style={styles.td}>{item.familyRows}</td>
                    <td style={styles.td}>{item.passedRows}</td>
                    <td style={styles.td}>{item.failedRows}</td>
                    <td style={styles.td}>{item.lastSubmittedAt ? new Date(item.lastSubmittedAt).toLocaleString() : "-"}</td>
                    <td style={styles.td}>
                      <span style={submitted ? styles.submitted : styles.pending}>{submitted ? "已上载" : "待上载"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      <section className="bos-table-card">
        <div className="bos-table-card-head">
          <h2>当前学年最近上载日志</h2>
          <span>{recentLogs.length} 条</span>
        </div>
        <div className="bos-table-card-body">
          <div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>学院</th>
                <th style={styles.th}>学年</th>
                <th style={styles.th}>上载时间</th>
                <th style={styles.th}>上载类型</th>
                <th style={styles.th}>新增数量</th>
                <th style={styles.th}>更新数量</th>
                <th style={styles.th}>不通过数量</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.length === 0 ? (
                <tr><td style={styles.empty} colSpan={7}>暂无当前学年上载日志</td></tr>
              ) : (
                recentLogs.map((item) => (
                  <tr key={item.id}>
                    <td style={styles.nameCell}>{normalizeSubmissionCollegeName(item.collegeName)}</td>
                    <td style={styles.td}>{getBatchAcademicYear(item)}</td>
                    <td style={styles.td}>{new Date(item.createdAt).toLocaleString()}</td>
                    <td style={styles.td}>{item.dataType === "student" ? "本专科信息" : "家庭成员信息"}</td>
                    <td style={styles.td}>{item.rowCount}</td>
                    <td style={styles.td}>0</td>
                    <td style={styles.td}>0</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </section>
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  card: { height: "calc(100vh - 104px)", minHeight: 650, display: "grid", gridTemplateRows: "auto auto minmax(0, 1fr) minmax(0, 0.82fr)", gap: 12, overflow: "hidden", background: "#fff", borderRadius: 8, padding: 16, border: "1px solid #d7e1ed", boxShadow: "0 4px 14px rgba(15,35,64,0.05)" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 },
  headerActions: { display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" },
  eyebrow: { color: "#0077d4", fontSize: 12, fontWeight: 800, marginBottom: 5 },
  title: { margin: 0, color: "#172033", fontSize: 24 },
  description: { color: "#63738a", fontSize: 13, lineHeight: 1.7, margin: "8px 0 0" },
  yearSelectLabel: { display: "grid", gap: 5, color: "#40526a", fontSize: 12, fontWeight: 700 },
  yearSelect: { minWidth: 132, border: "1px solid #cfdbe7", borderRadius: 6, padding: "9px 10px", color: "#15304f", background: "#fff", fontSize: 13 },
  exportButton: { border: "none", borderRadius: 6, padding: "10px 14px", background: "#0077d4", color: "#fff", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 },
  stat: { height: 74, boxSizing: "border-box", background: "#f8fbfe", border: "1px solid #dbe5ef", borderRadius: 6, padding: 12 },
  statLabel: { color: "#63738a", marginBottom: 6, fontSize: 13 },
  statValue: { fontSize: 25 },
  section: { minHeight: 0, display: "flex", flexDirection: "column", paddingTop: 10, borderTop: "1px solid #e3ebf3", overflow: "hidden" },
  subTitle: { margin: "0 0 10px", color: "#172033", fontSize: 17 },
  tableWrap: { flex: 1, minHeight: 0, overflow: "auto", border: "1px solid #d7e1ed", borderRadius: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { position: "sticky", top: 0, zIndex: 1, borderBottom: "1px solid #ebeef5", background: "#f5f7fa", color: "#606266", padding: "11px 12px", textAlign: "center", whiteSpace: "nowrap", fontWeight: 600 },
  td: { borderTop: "1px solid #ebeef5", padding: "11px 12px", textAlign: "center", whiteSpace: "nowrap", color: "#606266" },
  nameCell: { borderTop: "1px solid #ebeef5", padding: "11px 12px", color: "#303133", whiteSpace: "nowrap" },
  submitted: { display: "inline-flex", padding: "4px 8px", borderRadius: 4, background: "#f0f9eb", color: "#67c23a", fontWeight: 500, fontSize: 11 },
  pending: { display: "inline-flex", padding: "4px 8px", borderRadius: 4, background: "#f4f4f5", color: "#909399", fontWeight: 500, fontSize: 11 },
  empty: { padding: 18, color: "#8190a4", textAlign: "center" },
};
