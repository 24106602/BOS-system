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
  const lastAt = myBatches.map((item) => item.createdAt).sort().at(-1) || "";
  const latestStudentAt = studentBatches.map((item) => item.createdAt).sort().at(-1) || "";
  const latestFamilyAt = familyBatches.map((item) => item.createdAt).sort().at(-1) || "";

  return (
    <section className="bos-table-page difficulty-workspace">
      <header className="bos-page-title-row">
        <div>
          <div className="bos-breadcrumb">困难生业务 / 学部（院）端业务首页</div>
          <h1>困难生业务</h1>
          <p>当前学部（院）提交与处理情况概览。业务首页只展示入口、状态和最近提交记录。</p>
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
        <span className="bos-status-badge">最近提交：{lastAt ? new Date(lastAt).toLocaleString() : "暂无"}</span>
      </div>

      <div className="bos-action-toolbar">
        <button className="is-primary" onClick={() => onNavigate?.("/college/difficulty/student")}>本专科信息处理</button>
        <button onClick={() => onNavigate?.("/college/difficulty/family")}>家庭成员信息处理</button>
        <button onClick={() => onNavigate?.("/college/difficulty/students")}>查看困难生明细</button>
        <button onClick={() => onNavigate?.("/college/records")}>查看提交记录</button>
      </div>

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
                <th style={styles.th}>不通过人数</th>
                <th style={styles.th}>提交状态</th>
                <th style={styles.th}>最近提交时间</th>
              </tr>
            </thead>
            <tbody>
              {myBatches.length === 0 ? (
                <tr>
                  <td style={styles.td} colSpan={6}>暂无提交记录</td>
                </tr>
              ) : (
                myBatches
                  .slice()
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .slice(0, 8)
                  .map((item) => (
                    <tr key={item.id}>
                      <td style={styles.td}>{item.dataType === "student" ? "本专科信息" : "家庭成员信息"}</td>
                      <td style={styles.td}>{item.collegeName}</td>
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
        </div>
        <div className="bos-table-card-foot">
          <span>数据来源：学院已上载批次</span>
          <span>共 {myBatches.length} 个批次</span>
        </div>
      </section>

      <div style={styles.hiddenMeta}>
        {latestStudentAt}
        {latestFamilyAt}
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { height: "100%", minHeight: 0, display: "grid", gridTemplateRows: "auto auto auto minmax(0, 1fr) auto", gap: 12, overflow: "auto", paddingRight: 4, boxSizing: "border-box" },
  hero: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: 16, border: "1px solid #d7e1ed", borderRadius: 8, background: "#fff", boxShadow: "0 4px 14px rgba(15,35,64,0.05)" },
  eyebrow: { color: "#0077d4", fontSize: 13, fontWeight: 800 },
  title: { margin: "5px 0 7px", color: "#172033", fontSize: 26 },
  description: { margin: 0, color: "#63738a", fontSize: 14, lineHeight: 1.7 },
  enabledBadge: { padding: "6px 10px", borderRadius: 999, background: "#e9f8f2", color: "#087b5b", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" },
  card: { padding: 14, border: "1px solid #d7e1ed", borderRadius: 8, background: "#fff", boxShadow: "0 4px 14px rgba(15,35,64,0.05)", minWidth: 0, minHeight: 0, overflow: "hidden" },
  overviewCard: { flexShrink: 0 },
  recordsCard: { display: "flex", flexDirection: "column" },
  subTitle: { margin: "0 0 12px", color: "#172033", fontSize: 18 },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 },
  stat: { padding: 13, border: "1px solid #d7e1ed", borderRadius: 8, background: "#f8fbfe" },
  statLabel: { color: "#63738a", marginBottom: 7, fontSize: 13 },
  statValue: { fontSize: 18 },
  hint: { marginTop: 10, padding: 9, borderRadius: 6, background: "#f3f9ff", color: "#0875bd", border: "1px solid #cce3f8", fontSize: 13 },
  tableWrap: { flex: 1, minHeight: 0, overflow: "auto", border: "1px solid #d7e1ed", borderRadius: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { position: "sticky", top: 0, zIndex: 1, border: "1px solid #d7e1ed", background: "#edf4fa", padding: 9, whiteSpace: "nowrap", textAlign: "center" },
  td: { border: "1px solid #cbd5e1", padding: 9, textAlign: "center", whiteSpace: "nowrap" },
  hiddenMeta: { display: "none" },
};
