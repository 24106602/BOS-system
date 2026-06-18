import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { UserProfile } from "../../types/auth";
import { ACADEMIC_YEAR_OPTIONS, getCurrentAcademicYear } from "../../utils/academicYear";
import { normalizeIdCard, fetchCollegeDifficultyStudents, type DifficultyStudentRow } from "../../services/difficultyStudentService";
import { normalizeSubmissionCollegeName } from "../../utils/collegeDetector";

type CollegeDifficultyStudentsPageProps = {
  profile: UserProfile;
};

const statusText: Record<string, string> = {
  college_submitted: "学院已提交",
  pending_review: "待学校确认",
  archived: "管理员归档",
  local_uploaded: "本地已上载",
};

const displayStatus = (status: string) => statusText[status] || status || "已上载学校端";

const normalizeRawKey = (value: string) =>
  value.replace(/\s|\*|（.*?）|\(.*?\)/g, "").toLowerCase();

const getRawDetail = (row: DifficultyStudentRow, aliases: string[]) => {
  const rawData = row.raw_data || {};
  for (const alias of aliases) {
    const value = rawData[alias];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }

  const normalizedAliases = aliases.map(normalizeRawKey);
  const matchedKey = Object.keys(rawData).find((key) => {
    const normalizedKey = normalizeRawKey(key);
    return normalizedAliases.some((alias) => normalizedKey.includes(alias) || alias.includes(normalizedKey));
  });
  return matchedKey ? String(rawData[matchedKey] ?? "").trim() : "";
};

export default function CollegeDifficultyStudentsPage({ profile }: CollegeDifficultyStudentsPageProps) {
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());
  const [nameKeyword, setNameKeyword] = useState("");
  const [studentIdKeyword, setStudentIdKeyword] = useState("");
  const [idCardKeyword, setIdCardKeyword] = useState("");
  const [difficultyKeyword, setDifficultyKeyword] = useState("");
  const [statusKeyword, setStatusKeyword] = useState("");
  const [rows, setRows] = useState<DifficultyStudentRow[]>([]);
  const [selectedRow, setSelectedRow] = useState<DifficultyStudentRow | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadMessage, setLoadMessage] = useState("");
  const [dataSource, setDataSource] = useState<"supabase" | "local">("supabase");

  const collegeName = normalizeSubmissionCollegeName(profile.college_name || profile.display_name || "");

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetchCollegeDifficultyStudents(academicYear, collegeName);
      setRows(result.rows);
      setDataSource(result.source);
      setLoadMessage(result.error || `已加载 ${result.rows.length} 条困难生明细`);
    } catch (error) {
      console.error(error);
      setRows([]);
      setLoadMessage(error instanceof Error ? error.message : "困难生明细读取失败");
    } finally {
      setIsLoading(false);
    }
  }, [academicYear, collegeName]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRows();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const name = nameKeyword.trim();
    const studentId = studentIdKeyword.trim();
    const idCard = normalizeIdCard(idCardKeyword.trim());
    const difficulty = difficultyKeyword.trim();
    const status = statusKeyword.trim();
    if (!name && !studentId && !idCard && !difficulty && !status) return rows;

    return rows.filter((row) => {
      if (name && !row.name.includes(name)) return false;
      if (studentId && !row.student_id.includes(studentId)) return false;
      if (idCard && !normalizeIdCard(row.id_card).includes(idCard)) return false;
      if (difficulty && !row.difficulty_level.includes(difficulty)) return false;
      if (status && !displayStatus(row.status).includes(status)) return false;
      return true;
    });
  }, [difficultyKeyword, idCardKeyword, nameKeyword, rows, statusKeyword, studentIdKeyword]);

  const resetFilters = () => {
    setNameKeyword("");
    setStudentIdKeyword("");
    setIdCardKeyword("");
    setDifficultyKeyword("");
    setStatusKeyword("");
  };

  return (
    <section className="bos-table-page">
      <header className="bos-page-title-row">
        <div>
          <div className="bos-breadcrumb">困难生业务 / 困难生明细 / Student Records</div>
          <h1>困难生明细</h1>
          <p>按学年查看本学院已经上载的困难生数据，点击姓名或操作按钮查看学生详情。</p>
        </div>
        <label className="bos-current-year">
          当前学年
          <select value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}>
            {ACADEMIC_YEAR_OPTIONS.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
      </header>

      <section className="bos-filter-card">
        <div className="bos-filter-grid">
          <label className="bos-filter-field">学院/学部<input value={collegeName || "学院账号"} readOnly /></label>
          <label className="bos-filter-field">姓名<input value={nameKeyword} onChange={(event) => setNameKeyword(event.target.value)} /></label>
          <label className="bos-filter-field">学号<input value={studentIdKeyword} onChange={(event) => setStudentIdKeyword(event.target.value)} /></label>
          <label className="bos-filter-field">身份证号<input value={idCardKeyword} onChange={(event) => setIdCardKeyword(event.target.value)} /></label>
          <label className="bos-filter-field">困难等级<input value={difficultyKeyword} onChange={(event) => setDifficultyKeyword(event.target.value)} /></label>
          <label className="bos-filter-field">状态<input value={statusKeyword} onChange={(event) => setStatusKeyword(event.target.value)} /></label>
          <button className="is-primary" onClick={() => void loadRows()} disabled={isLoading}>{isLoading ? "查询中..." : "查询"}</button>
          <button onClick={resetFilters}>重置</button>
        </div>
        {loadMessage && <div style={dataSource === "supabase" ? styles.info : styles.warning}>{loadMessage}</div>}
      </section>

      <div className="bos-action-toolbar">
        <button className="is-primary" onClick={() => void loadRows()} disabled={isLoading}>{isLoading ? "刷新中..." : "刷新数据"}</button>
      </div>

      <div className="bos-status-row">
        <span className="bos-status-badge">学年 {academicYear}</span>
        <span className="bos-status-badge">{collegeName || "学院账号"}</span>
        <span className="bos-status-badge is-success">数据源 {dataSource === "supabase" ? "Supabase" : "本地记录"}</span>
        <span className="bos-status-badge">总数 {rows.length}</span>
        <span className="bos-status-badge">筛选结果 {filteredRows.length}</span>
      </div>

      <section className="bos-table-card">
        <div className="bos-table-card-head">
          <div>
            <h2>学院困难生数据表</h2>
            <span>点击姓名或“查看详情”打开学生详情弹窗</span>
          </div>
          <span>显示 {filteredRows.length} / {rows.length} 条</span>
        </div>
        <div className="bos-table-card-body">
          <div>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>学年</th>
                  <th style={styles.th}>学院</th>
                  <th style={styles.th}>姓名</th>
                  <th style={styles.th}>学号</th>
                  <th style={styles.th}>身份证号</th>
                  <th style={styles.th}>困难等级</th>
                  <th style={styles.th}>状态</th>
                  <th style={styles.th}>操作</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td style={styles.empty} colSpan={8}>正在加载困难生明细...</td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td style={styles.empty} colSpan={8}>暂无当前学年困难生明细</td>
                  </tr>
                ) : (
                  filteredRows.map((row, index) => (
                    <tr key={`${row.academic_year}_${row.id_card || row.student_id}_${index}`}>
                      <td style={styles.td}>{row.academic_year}</td>
                      <td style={styles.td}>{row.college_name}</td>
                      <td style={styles.nameCell}>
                        <button style={styles.linkButton} onClick={() => setSelectedRow(row)}>
                          {row.name || "未填写姓名"}
                        </button>
                      </td>
                      <td style={styles.td}>{row.student_id}</td>
                      <td style={styles.td}>{row.id_card}</td>
                      <td style={styles.td}>{row.difficulty_level}</td>
                      <td style={styles.td}>{displayStatus(row.status)}</td>
                      <td style={styles.td}>
                        <button style={styles.smallButton} onClick={() => setSelectedRow(row)}>查看详情</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="bos-table-card-foot">
          <span>第 1 页</span>
          <span>共 {filteredRows.length} 条</span>
        </div>
      </section>

      {selectedRow && (
        <div className="bos-modal-backdrop">
          <section className="bos-modal bos-modal--compact">
            <div className="bos-modal-header">
              <h2 style={styles.subTitle}>困难生明细详情</h2>
              <button onClick={() => setSelectedRow(null)}>关闭</button>
            </div>
            <div className="bos-modal-body">
              <div style={styles.detailGrid}>
                <Detail label="学年" value={selectedRow.academic_year} />
                <Detail label="学院" value={selectedRow.college_name} />
                <Detail label="姓名" value={selectedRow.name} />
                <Detail label="学号" value={selectedRow.student_id} />
                <Detail label="身份证号" value={selectedRow.id_card} />
                <Detail label="年级" value={getRawDetail(selectedRow, ["grade", "年级", "所在年级"])} />
                <Detail label="性别" value={getRawDetail(selectedRow, ["gender", "性别"])} />
                <Detail label="困难等级" value={selectedRow.difficulty_level} />
                <Detail label="状态" value={displayStatus(selectedRow.status)} />
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.detailItem}>
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { height: "100%", minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) clamp(270px, 23vw, 330px)", gap: 10, overflow: "hidden", boxSizing: "border-box" },
  mainColumn: { height: "100%", minWidth: 0, minHeight: 0, display: "grid", gridTemplateRows: "auto auto auto minmax(0, 1fr)", gap: 10, overflow: "hidden" },
  hero: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: 12, border: "1px solid #d5dee9", borderRadius: 9, background: "#fff", boxShadow: "0 2px 10px rgba(15,35,64,0.05)" },
  eyebrow: { color: "#1e5aa8", fontSize: 11, fontWeight: 900, letterSpacing: "0.04em" },
  title: { margin: "4px 0 5px", color: "#0f1f33", fontSize: 21 },
  description: { margin: 0, color: "#63738a", fontSize: 12, lineHeight: 1.55 },
  badge: { padding: "5px 9px", borderRadius: 999, background: "#e9f8f2", color: "#087b5b", border: "1px solid #c7eedf", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" },
  card: { padding: 12, border: "1px solid #d5dee9", borderRadius: 9, background: "#fff", boxShadow: "0 2px 10px rgba(15,35,64,0.04)", minWidth: 0, minHeight: 0, overflow: "hidden" },
  sectionLabel: { marginBottom: 6, color: "#334155", fontSize: 11, fontWeight: 900, letterSpacing: "0.05em" },
  toolbar: { display: "grid", gridTemplateColumns: "125px repeat(4, minmax(105px, 1fr)) auto auto", gap: 7, alignItems: "end" },
  fieldLabel: { display: "grid", gap: 5, color: "#40526a", fontSize: 12, fontWeight: 800 },
  select: { border: "1px solid #cfdbe7", borderRadius: 6, padding: "7px 9px", color: "#15304f", background: "#fff", fontSize: 12 },
  input: { border: "1px solid #cfdbe7", borderRadius: 6, padding: "7px 9px", color: "#15304f", background: "#fff", fontSize: 12 },
  secondaryButton: { border: "1px solid #cbd8e6", borderRadius: 6, minHeight: 34, padding: "7px 11px", background: "#fff", color: "#26364e", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" },
  primaryButton: { border: "1px solid #1e5aa8", borderRadius: 6, minHeight: 34, padding: "7px 11px", background: "#1e5aa8", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" },
  metaRow: { display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8, color: "#64748b", fontSize: 12 },
  info: { marginTop: 7, padding: 8, borderRadius: 6, background: "#f3f9ff", color: "#0875bd", border: "1px solid #cce3f8", fontSize: 12 },
  warning: { marginTop: 7, padding: 8, borderRadius: 6, background: "#fff8e6", color: "#9a6700", border: "1px solid #fde6a7", fontSize: 12 },
  stats: { display: "grid", gridTemplateColumns: "repeat(4, minmax(110px, 1fr))", gap: 7 },
  metric: { minHeight: 56, display: "grid", alignContent: "center", gap: 3, padding: "7px 9px", borderRadius: 7, border: "1px solid #d7e1ed", borderLeft: "3px solid #1e5aa8", background: "#fff" },
  metricLabel: { color: "#718096", fontSize: 10 },
  metricValue: { lineHeight: 1.15 },
  tableCard: { display: "flex", flexDirection: "column" },
  tableHead: { flex: "0 0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 7 },
  tableHint: { margin: 0, color: "#8290a6", fontSize: 11 },
  resultBadge: { padding: "4px 8px", borderRadius: 999, background: "#eff4ff", color: "#1e5aa8", border: "1px solid #cbd9ee", fontSize: 10, fontWeight: 800 },
  tableWrap: { flex: 1, height: "100%", minHeight: 0, overflow: "auto", border: "1px solid #d7e1ed", borderRadius: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { position: "sticky", top: 0, zIndex: 1, border: "1px solid #d7e1ed", background: "#edf4fa", padding: "9px 10px", whiteSpace: "nowrap", textAlign: "center" },
  td: { border: "1px solid #cbd5e1", padding: "8px 10px", textAlign: "center", whiteSpace: "nowrap" },
  nameCell: { border: "1px solid #cbd5e1", padding: "8px 10px", textAlign: "center", whiteSpace: "nowrap", fontWeight: 800 },
  empty: { padding: 18, color: "#8190a4", textAlign: "center" },
  linkButton: { border: "none", background: "transparent", color: "#1e5aa8", fontWeight: 800, cursor: "pointer" },
  smallButton: { border: "1px solid #bcd9f5", borderRadius: 6, padding: "6px 9px", background: "#f3f9ff", color: "#0879c5", fontWeight: 800, cursor: "pointer" },
  logPanel: { height: "100%", minHeight: 0, padding: 14, borderRadius: 9, background: "linear-gradient(180deg, #0b1c30 0%, #0a1426 100%)", border: "1px solid #1e3350", overflow: "hidden", display: "flex", flexDirection: "column", boxSizing: "border-box", boxShadow: "0 4px 18px rgba(8,20,40,0.16)" },
  logHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingBottom: 10, borderBottom: "1px solid rgba(148,163,184,0.2)" },
  logTitle: { color: "#e5efff", fontSize: 15, margin: 0 },
  liveBadge: { display: "inline-flex", alignItems: "center", gap: 5, color: "#9fdcc8", fontSize: 10, fontWeight: 800 },
  liveDot: { width: 7, height: 7, borderRadius: "50%", background: "#21d59c", boxShadow: "0 0 0 3px rgba(33,213,156,0.12)" },
  logBox: { flex: 1, minHeight: 0, overflowY: "auto", paddingTop: 10, color: "#dceafe", fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.55 },
  logItem: { paddingBottom: 8, marginBottom: 8, borderBottom: "1px solid rgba(148,163,184,0.1)", whiteSpace: "pre-wrap" },
  modalBackdrop: { position: "fixed", inset: 0, zIndex: 9999, background: "rgba(11,28,48,0.58)", display: "grid", placeItems: "center", padding: 18, backdropFilter: "blur(2px)" },
  detailModal: { width: "min(760px, 92vw)", height: "min(620px, 78vh)", display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid #cbd5e1", borderRadius: 10, background: "#fff", boxShadow: "0 28px 90px rgba(15,23,42,0.34)" },
  detailHeader: { flex: "0 0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "13px 16px", borderBottom: "1px solid #d7e1ed", background: "#f8fafc" },
  detailBody: { flex: 1, minHeight: 0, overflow: "auto", padding: 16 },
  subTitle: { margin: 0, color: "#172033", fontSize: 17 },
  closeButton: { border: "1px solid #cbd8e6", borderRadius: 6, padding: "7px 10px", background: "#fff", color: "#26364e", fontWeight: 800, cursor: "pointer" },
  detailGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 },
  detailItem: { display: "grid", gap: 4, padding: 10, borderRadius: 6, border: "1px solid #d7e1ed", background: "#fff", color: "#63738a", fontSize: 12 },
};
