import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getMergeBatches } from "../../db/localMergeDb";
import type { CollegeProcessedBatch } from "../../types/merge";
import type { UserProfile } from "../../types/auth";
import { isSameSubmissionCollege } from "../../utils/collegeDetector";
import { ACADEMIC_YEAR_OPTIONS, getCurrentAcademicYear, isBatchInAcademicYear } from "../../utils/academicYear";

type CollegeDifficultyPageProps = {
  profile: UserProfile;
  onNavigate?: (to: string) => void;
};

export default function CollegeDifficultyPage({ profile, onNavigate }: CollegeDifficultyPageProps) {
  const [batches, setBatches] = useState<CollegeProcessedBatch[]>([]);
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());

  useEffect(() => {
    getMergeBatches().then(setBatches);
  }, []);

  const unitName = profile.college_name || profile.display_name || "当前学部（院）";
  const myBatches = useMemo(
    () =>
      batches.filter(
        (item) =>
          isSameSubmissionCollege(item.collegeName, unitName) &&
          isBatchInAcademicYear(item, academicYear)
      ),
    [academicYear, batches, unitName]
  );
  const studentBatches = myBatches.filter((item) => item.dataType === "student");
  const familyBatches = myBatches.filter((item) => item.dataType === "family");
  const studentCount = studentBatches.reduce((sum, item) => sum + item.rowCount, 0);
  const familyCount = familyBatches.reduce((sum, item) => sum + item.rowCount, 0);
  const studentDone = studentBatches.length > 0;
  const familyDone = familyBatches.length > 0;

  return (
    <section className="bos-table-page difficulty-workspace">
      <header className="bos-page-title-row">
        <div>
          <h1>困难生业务首页</h1>
          <p>请按以下步骤完成本学部（院）困难生数据治理与提交。</p>
        </div>
        <label className="bos-current-year">
          当前学年
          <select value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}>
            {ACADEMIC_YEAR_OPTIONS.map((year) => <option key={year}>{year}</option>)}
          </select>
        </label>
      </header>

      <div className="bos-status-row">
        <span className="bos-status-badge is-success">当前学院：{unitName}</span>
        <span className="bos-status-badge">学年：{academicYear}</span>
      </div>

      <div style={styles.stepsGrid}>
        <div style={styles.stepCard}>
          <div style={styles.stepHeader}>
            <span style={styles.stepNumber}>1</span>
            <h2 style={styles.stepTitle}>本专科信息处理</h2>
            {studentDone ? (
              <span style={styles.stepDone}>已完成</span>
            ) : (
              <span style={styles.stepPending}>待处理</span>
            )}
          </div>
          <p style={styles.stepDesc}>
            上传本学部（院）困难生的本专科学生信息，系统将自动校验数据并完成治理。
          </p>
          <div style={styles.stepMeta}>
            <span>已提交 {studentCount} 条</span>
          </div>
          <button
            style={styles.stepButton}
            onClick={() => onNavigate?.("/college/difficulty/student")}
          >
            {studentDone ? "查看 / 重新处理" : "进入处理"}
          </button>
        </div>

        <div style={styles.stepCard}>
          <div style={styles.stepHeader}>
            <span style={styles.stepNumber}>2</span>
            <h2 style={styles.stepTitle}>家庭成员信息处理</h2>
            {familyDone ? (
              <span style={styles.stepDone}>已完成</span>
            ) : (
              <span style={styles.stepPending}>待处理</span>
            )}
          </div>
          <p style={styles.stepDesc}>
            上传本学部（院）困难生的家庭成员信息，系统将自动校验数据并完成治理。
          </p>
          <div style={styles.stepMeta}>
            <span>已提交 {familyCount} 条</span>
          </div>
          <button
            style={styles.stepButton}
            onClick={() => onNavigate?.("/college/difficulty/family")}
          >
            {familyDone ? "查看 / 重新处理" : "进入处理"}
          </button>
        </div>
      </div>

      {myBatches.length > 0 && (
        <section className="bos-table-card">
          <div className="bos-table-card-head">
            <h2>最近提交记录</h2>
            <span>本专科 {studentCount} 条 · 家庭成员 {familyCount} 条</span>
          </div>
          <div className="bos-table-card-body">
            <div>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>数据类型</th>
                    <th style={styles.th}>提交单位</th>
                    <th style={styles.th}>通过人数</th>
                    <th style={styles.th}>提交状态</th>
                    <th style={styles.th}>提交时间</th>
                  </tr>
                </thead>
                <tbody>
                  {myBatches
                    .slice()
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .slice(0, 8)
                    .map((item) => (
                      <tr key={item.id}>
                        <td style={styles.td}>{item.dataType === "student" ? "本专科信息" : "家庭成员信息"}</td>
                        <td style={styles.td}>{item.collegeName}</td>
                        <td style={styles.td}>{item.rowCount}</td>
                        <td style={styles.td}>已上载</td>
                        <td style={styles.td}>{new Date(item.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  stepsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: 14,
    marginTop: 14,
  },
  stepCard: {
    padding: 18,
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    background: "#fff",
    boxShadow: "0 4px 14px rgba(15,35,64,0.05)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  stepHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  stepNumber: {
    width: 28,
    height: 28,
    display: "grid",
    placeItems: "center",
    borderRadius: "50%",
    background: "#0077d4",
    color: "#fff",
    fontWeight: 800,
    fontSize: 14,
    flexShrink: 0,
  },
  stepTitle: {
    margin: 0,
    fontSize: 18,
    color: "#172033",
    flex: 1,
  },
  stepDone: {
    padding: "3px 8px",
    borderRadius: 999,
    background: "#e9f8f2",
    color: "#087b5b",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  stepPending: {
    padding: "3px 8px",
    borderRadius: 999,
    background: "#fff4e6",
    color: "#cc7a00",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  stepDesc: {
    margin: 0,
    color: "#63738a",
    fontSize: 13,
    lineHeight: 1.7,
  },
  stepMeta: {
    color: "#8a97a8",
    fontSize: 12,
  },
  stepButton: {
    marginTop: "auto",
    width: "100%",
    border: "none",
    borderRadius: 6,
    padding: "10px 12px",
    background: "#0077d4",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 14,
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { position: "sticky", top: 0, zIndex: 1, border: "1px solid #d7e1ed", background: "#edf4fa", padding: 9, whiteSpace: "nowrap", textAlign: "center" },
  td: { border: "1px solid #cbd5e1", padding: 9, textAlign: "center", whiteSpace: "nowrap" },
};
