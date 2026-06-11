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
    <section style={styles.card}>
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>困难生业务 / 学校端自动汇总</div>
          <h1 style={styles.title}>全校数据汇总</h1>
          <p style={styles.description}>查看某一学年各学院困难生数据提交和汇总情况。不同学年的数据不会混在一起展示。</p>
        </div>
        <div style={styles.headerActions}>
          <label style={styles.yearSelectLabel}>
            当前学年
            <select style={styles.yearSelect} value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}>
              {ACADEMIC_YEAR_OPTIONS.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </label>
          <button style={styles.exportButton} onClick={exportSummary}>导出当前学年汇总表</button>
        </div>
      </div>

      <div style={styles.stats}>
        <Stat label="当前学年全校总人数" value={totalStudents} />
        <Stat label="当前学年已提交学院数" value={submittedCount} />
        <Stat label="当前学年未提交学院数" value={collegeAccounts.length - submittedCount} />
        <Stat label="当前学年通过人数" value={passedCount} />
        <Stat label="当前学年不通过人数" value={failedCount} tone="#c2414d" />
      </div>

      <section style={styles.section}>
        <h2 style={styles.subTitle}>当前学年各学院提交状态</h2>
        <div style={styles.tableWrap}>
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
      </section>

      <section style={styles.section}>
        <h2 style={styles.subTitle}>当前学年最近上载日志</h2>
        <div style={styles.tableWrap}>
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
  headerActions: { display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" },
  eyebrow: { color: "#0077d4", fontSize: 12, fontWeight: 800, marginBottom: 5 },
  title: { margin: 0, color: "#172033", fontSize: 24 },
  description: { color: "#63738a", fontSize: 13, lineHeight: 1.7, margin: "8px 0 0" },
  yearSelectLabel: { display: "grid", gap: 5, color: "#40526a", fontSize: 12, fontWeight: 700 },
  yearSelect: { minWidth: 132, border: "1px solid #cfdbe7", borderRadius: 6, padding: "9px 10px", color: "#15304f", background: "#fff", fontSize: 13 },
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
  pending: { display: "inline-flex", padding: "3px 7px", borderRadius: 999, background: "#f2f5f8", color: "#728197", fontWeight: 700, fontSize: 12 },
  empty: { padding: 18, color: "#8190a4", textAlign: "center" },
};
