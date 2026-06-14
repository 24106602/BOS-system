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

export default function CollegeDifficultyStudentsPage({ profile }: CollegeDifficultyStudentsPageProps) {
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());
  const [keyword, setKeyword] = useState("");
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
    const text = keyword.trim();
    const normalizedId = normalizeIdCard(text);
    if (!text) return rows;

    return rows.filter((row) => {
      if (row.name.includes(text)) return true;
      if (row.student_id.includes(text)) return true;
      if (normalizeIdCard(row.id_card).includes(normalizedId)) return true;
      if (row.difficulty_level.includes(text)) return true;
      return false;
    });
  }, [keyword, rows]);

  return (
    <section style={styles.page}>
      <div style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>困难生业务 / 学院端困难生明细</div>
          <h1 style={styles.title}>困难生明细</h1>
          <p style={styles.description}>
            当前页面只展示本学院困难生数据，按学年归档查看。点击姓名可查看本次预留的详情信息。
          </p>
        </div>
        <span style={styles.badge}>当前学院：{collegeName || "学院账号"}</span>
      </div>

      <section style={styles.card}>
        <div style={styles.toolbar}>
          <label style={styles.fieldLabel}>
            学年
            <select style={styles.select} value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}>
              {ACADEMIC_YEAR_OPTIONS.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </label>
          <label style={styles.searchLabel}>
            搜索
            <input
              style={styles.input}
              value={keyword}
              placeholder="姓名 / 学号 / 身份证号 / 困难等级"
              onChange={(event) => setKeyword(event.target.value)}
            />
          </label>
          <button style={styles.secondaryButton} onClick={() => void loadRows()} disabled={isLoading}>
            {isLoading ? "刷新中" : "刷新"}
          </button>
        </div>
        <div style={styles.metaRow}>
          <span>当前学年：{academicYear}</span>
          <span>数据来源：{dataSource === "supabase" ? "Supabase students 表" : "本地上载记录"}</span>
          <span>显示 {filteredRows.length} / {rows.length} 条</span>
        </div>
        {loadMessage && <div style={dataSource === "supabase" ? styles.info : styles.warning}>{loadMessage}</div>}
      </section>

      <section style={styles.card}>
        <div style={styles.tableWrap}>
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
              {filteredRows.length === 0 ? (
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
      </section>

      {selectedRow && (
        <section style={styles.detailCard}>
          <div style={styles.detailHeader}>
            <h2 style={styles.subTitle}>明细详情预留</h2>
            <button style={styles.closeButton} onClick={() => setSelectedRow(null)}>关闭</button>
          </div>
          <div style={styles.detailGrid}>
            <Detail label="学年" value={selectedRow.academic_year} />
            <Detail label="学院" value={selectedRow.college_name} />
            <Detail label="姓名" value={selectedRow.name} />
            <Detail label="学号" value={selectedRow.student_id} />
            <Detail label="身份证号" value={selectedRow.id_card} />
            <Detail label="困难等级" value={selectedRow.difficulty_level} />
            <Detail label="状态" value={displayStatus(selectedRow.status)} />
          </div>
        </section>
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
  page: { display: "grid", gap: 14 },
  hero: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: 18, border: "1px solid #d7e1ed", borderRadius: 8, background: "#fff", boxShadow: "0 4px 14px rgba(15,35,64,0.05)" },
  eyebrow: { color: "#0077d4", fontSize: 13, fontWeight: 800 },
  title: { margin: "5px 0 7px", color: "#172033", fontSize: 25 },
  description: { margin: 0, color: "#63738a", fontSize: 13, lineHeight: 1.7 },
  badge: { padding: "6px 10px", borderRadius: 999, background: "#e9f8f2", color: "#087b5b", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" },
  card: { padding: 14, border: "1px solid #d7e1ed", borderRadius: 8, background: "#fff", boxShadow: "0 4px 14px rgba(15,35,64,0.05)", minWidth: 0 },
  toolbar: { display: "grid", gridTemplateColumns: "160px minmax(260px, 1fr) auto", gap: 10, alignItems: "end" },
  fieldLabel: { display: "grid", gap: 5, color: "#40526a", fontSize: 12, fontWeight: 800 },
  searchLabel: { display: "grid", gap: 5, color: "#40526a", fontSize: 12, fontWeight: 800 },
  select: { border: "1px solid #cfdbe7", borderRadius: 6, padding: "9px 10px", color: "#15304f", background: "#fff", fontSize: 13 },
  input: { border: "1px solid #cfdbe7", borderRadius: 6, padding: "9px 10px", color: "#15304f", background: "#fff", fontSize: 13 },
  secondaryButton: { border: "1px solid #cbd8e6", borderRadius: 6, padding: "10px 14px", background: "#fff", color: "#26364e", fontWeight: 800, cursor: "pointer" },
  metaRow: { display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, color: "#64748b", fontSize: 12 },
  info: { marginTop: 9, padding: 9, borderRadius: 6, background: "#f3f9ff", color: "#0875bd", border: "1px solid #cce3f8", fontSize: 12 },
  warning: { marginTop: 9, padding: 9, borderRadius: 6, background: "#fff8e6", color: "#9a6700", border: "1px solid #fde6a7", fontSize: 12 },
  tableWrap: { height: 460, overflow: "auto", border: "1px solid #d7e1ed", borderRadius: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { position: "sticky", top: 0, zIndex: 1, border: "1px solid #d7e1ed", background: "#edf4fa", padding: "9px 10px", whiteSpace: "nowrap", textAlign: "center" },
  td: { border: "1px solid #cbd5e1", padding: "8px 10px", textAlign: "center", whiteSpace: "nowrap" },
  nameCell: { border: "1px solid #cbd5e1", padding: "8px 10px", textAlign: "center", whiteSpace: "nowrap", fontWeight: 800 },
  empty: { padding: 18, color: "#8190a4", textAlign: "center" },
  linkButton: { border: "none", background: "transparent", color: "#0077d4", fontWeight: 800, cursor: "pointer" },
  smallButton: { border: "1px solid #bcd9f5", borderRadius: 6, padding: "6px 9px", background: "#f3f9ff", color: "#0879c5", fontWeight: 800, cursor: "pointer" },
  detailCard: { padding: 14, border: "1px solid #c7eedf", borderRadius: 8, background: "#f5fffa", boxShadow: "0 4px 14px rgba(15,35,64,0.05)" },
  detailHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 },
  subTitle: { margin: 0, color: "#172033", fontSize: 17 },
  closeButton: { border: "1px solid #cbd8e6", borderRadius: 6, padding: "7px 10px", background: "#fff", color: "#26364e", fontWeight: 800, cursor: "pointer" },
  detailGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 },
  detailItem: { display: "grid", gap: 4, padding: 10, borderRadius: 6, border: "1px solid #d7e1ed", background: "#fff", color: "#63738a", fontSize: 12 },
};
