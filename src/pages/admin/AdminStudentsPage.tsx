import { useEffect, useMemo, useState, type CSSProperties } from "react";
import * as XLSX from "xlsx-js-style";
import { getMergeBatches } from "../../db/localMergeDb";
import type { CollegeProcessedBatch } from "../../types/merge";
import {
  ACADEMIC_YEAR_OPTIONS,
  getCurrentAcademicYear,
  isBatchInAcademicYear,
} from "../../utils/academicYear";
import { normalizeSubmissionCollegeName } from "../../utils/collegeDetector";

type MergedDifficultyRow = {
  collegeName: string;
  name: string;
  studentId: string;
  idCard: string;
  difficultyLevel: string;
  familyMembers: string[];
  relationStatus: string;
};

const columns = [
  "学院",
  "姓名",
  "学号",
  "身份证号",
  "困难等级",
  "家庭成员数量",
  "家庭成员1",
  "家庭成员2",
  "家庭成员3",
  "关联状态",
];

const getText = (row: Record<string, unknown>, aliases: string[]) => {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }

  const normalizedAliases = aliases.map((item) => item.replace(/\s|\*|（.*?）|\(.*?\)/g, ""));
  const matchedKey = Object.keys(row).find((key) => {
    const normalizedKey = key.replace(/\s|\*|（.*?）|\(.*?\)/g, "");
    return normalizedAliases.some((alias) => normalizedKey.includes(alias));
  });
  return matchedKey ? String(row[matchedKey] ?? "").trim() : "";
};

const normalizeIdCard = (value: string) => value.replace(/\s|-/g, "").toUpperCase();

const makeMergedRows = (batches: CollegeProcessedBatch[]): MergedDifficultyRow[] => {
  const studentRows = batches.filter((item) => item.dataType === "student");
  const familyRows = batches.filter((item) => item.dataType === "family");
  const familyByIdCard = new Map<string, string[]>();

  familyRows.forEach((batch) => {
    batch.rows.forEach((row) => {
      const idCard = normalizeIdCard(getText(row, ["student_id_card", "学生身份证号", "学生身份证件号", "身份证号"]));
      if (!idCard) return;
      const memberName = getText(row, ["member_name", "家庭成员姓名", "成员姓名", "姓名"]) || "未填写姓名";
      const relationship = getText(row, ["relationship", "与学生关系", "关系"]);
      const label = relationship ? `${memberName}（${relationship}）` : memberName;
      familyByIdCard.set(idCard, [...(familyByIdCard.get(idCard) || []), label]);
    });
  });

  return studentRows.flatMap((batch) =>
    batch.rows.map((row) => {
      const idCard = normalizeIdCard(getText(row, ["id_card", "身份证号", "身份证件号", "证件号", "学生身份证号"]));
      const familyMembers = idCard ? familyByIdCard.get(idCard) || [] : [];
      const expectedFamilyCount = Number(getText(row, ["family_count", "家庭成员数量", "家庭人口数", "家庭人口总数"]) || familyMembers.length);
      const relationStatus =
        !idCard ? "缺少身份证号，无法关联" :
        familyMembers.length === 0 ? "未匹配到家庭成员" :
        expectedFamilyCount && expectedFamilyCount !== familyMembers.length ? "家庭成员数量需复核" :
        "已关联";

      return {
        collegeName: normalizeSubmissionCollegeName(batch.collegeName),
        name: getText(row, ["name", "姓名", "学生姓名"]),
        studentId: getText(row, ["student_id", "学号", "学生学号", "学生编号"]),
        idCard,
        difficultyLevel: getText(row, ["difficulty_level", "困难等级", "困难认定等级", "特殊困难类型", "认定等级"]),
        familyMembers,
        relationStatus,
      };
    })
  );
};

export default function AdminStudentsPage() {
  const [batches, setBatches] = useState<CollegeProcessedBatch[]>([]);
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());

  useEffect(() => {
    getMergeBatches().then(setBatches);
  }, []);

  const yearBatches = useMemo(
    () => batches.filter((item) => isBatchInAcademicYear(item, academicYear)),
    [academicYear, batches]
  );
  const mergedRows = useMemo(() => makeMergedRows(yearBatches), [yearBatches]);
  const studentCount = yearBatches.filter((item) => item.dataType === "student").reduce((sum, item) => sum + item.rowCount, 0);
  const familyCount = yearBatches.filter((item) => item.dataType === "family").reduce((sum, item) => sum + item.rowCount, 0);
  const linkedCount = mergedRows.filter((item) => item.relationStatus === "已关联").length;
  const familyIssueCount = mergedRows.filter((item) => item.relationStatus !== "已关联").length;

  const exportCurrentYearDatabase = () => {
    if (mergedRows.length === 0) {
      alert("暂无当前学年困难生数据库可导出");
      return;
    }

    const exportRows = mergedRows.map((row) => ({
      学年: academicYear,
      学院: row.collegeName,
      姓名: row.name,
      学号: row.studentId,
      身份证号: row.idCard,
      困难等级: row.difficultyLevel,
      家庭成员数量: row.familyMembers.length,
      家庭成员1: row.familyMembers[0] || "",
      家庭成员2: row.familyMembers[1] || "",
      家庭成员3: row.familyMembers[2] || "",
      关联状态: row.relationStatus,
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet["!cols"] = Object.keys(exportRows[0]).map(() => ({ wch: 18 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `${academicYear}困难生数据库`);
    XLSX.writeFile(workbook, `${academicYear}困难生数据库.xlsx`);
  };

  return (
    <section>
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>困难生业务 / 系统自动关联</div>
          <h1 style={styles.title}>困难生数据库</h1>
          <p style={styles.description}>
            困难生数据库按学年归档，由系统自动合并本专科信息汇总和家庭成员信息汇总生成，学院不直接上传困难生数据库。
          </p>
        </div>
        <div style={styles.headerActions}>
          <label style={styles.yearSelectLabel}>
            学年
            <select style={styles.yearSelect} value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}>
              {ACADEMIC_YEAR_OPTIONS.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </label>
          <button style={styles.exportButton} onClick={exportCurrentYearDatabase}>导出当前学年困难生数据库</button>
        </div>
      </div>

      <div style={styles.stats}>
        <Stat label="当前学年合并学生总数" value={mergedRows.length} />
        <Stat label="当前学年本专科信息数" value={studentCount} />
        <Stat label="当前学年家庭成员信息数" value={familyCount} />
        <Stat label="当前学年身份证号关联成功数" value={linkedCount} />
        <Stat label="当前学年家庭成员匹配异常数" value={familyIssueCount} tone="#c2414d" />
      </div>

      <section style={styles.card}>
        <div style={styles.sectionHead}>
          <div>
            <h2 style={styles.subTitle}>当前学年困难生数据库明细表</h2>
            <p style={styles.description}>当前展示 {academicYear} 学年数据，切换学年后统计和明细会同步变化。</p>
          </div>
          <span style={styles.badge}>按 id_card = student_id_card 自动生成</span>
        </div>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead><tr>{columns.map((column) => <th key={column} style={styles.th}>{column}</th>)}</tr></thead>
            <tbody>
              {mergedRows.length === 0 ? (
                <tr><td style={styles.empty} colSpan={columns.length}>暂无当前学年已合并数据</td></tr>
              ) : (
                mergedRows.map((row) => (
                  <tr key={`${row.collegeName}_${row.idCard}_${row.studentId}`}>
                    <td style={styles.td}>{row.collegeName}</td>
                    <td style={styles.td}>{row.name || "-"}</td>
                    <td style={styles.td}>{row.studentId || "-"}</td>
                    <td style={styles.td}>{row.idCard || "-"}</td>
                    <td style={styles.td}>{row.difficultyLevel || "-"}</td>
                    <td style={styles.td}>{row.familyMembers.length}</td>
                    <td style={styles.td}>{row.familyMembers[0] || "-"}</td>
                    <td style={styles.td}>{row.familyMembers[1] || "-"}</td>
                    <td style={styles.td}>{row.familyMembers[2] || "-"}</td>
                    <td style={styles.td}>{row.relationStatus}</td>
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
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 14, padding: 18, border: "1px solid #d7e1ed", borderRadius: 8, background: "#fff", boxShadow: "0 4px 14px rgba(15,35,64,0.05)" },
  headerActions: { display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" },
  eyebrow: { color: "#0077d4", fontSize: 12, fontWeight: 800, marginBottom: 5 },
  title: { margin: 0, color: "#172033", fontSize: 24 },
  description: { color: "#63738a", fontSize: 13, lineHeight: 1.7, margin: "8px 0 0" },
  yearSelectLabel: { display: "grid", gap: 5, color: "#40526a", fontSize: 12, fontWeight: 700 },
  yearSelect: { minWidth: 132, border: "1px solid #cfdbe7", borderRadius: 6, padding: "9px 10px", color: "#15304f", background: "#fff", fontSize: 13 },
  exportButton: { border: "none", borderRadius: 6, padding: "10px 14px", background: "#0077d4", color: "#fff", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 14 },
  stat: { background: "#fff", border: "1px solid #d7e1ed", borderRadius: 8, padding: 14 },
  statLabel: { color: "#63738a", marginBottom: 7, fontSize: 13 },
  statValue: { fontSize: 24 },
  card: { background: "#fff", border: "1px solid #d7e1ed", borderRadius: 8, padding: 16, marginBottom: 14 },
  sectionHead: { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", marginBottom: 12 },
  subTitle: { margin: 0, color: "#172033", fontSize: 17 },
  badge: { padding: "5px 8px", borderRadius: 999, background: "#e8f4ff", color: "#0077d4", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" },
  tableWrap: { overflow: "auto", border: "1px solid #d7e1ed", borderRadius: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { background: "#edf4fa", color: "#40526a", padding: 9, textAlign: "center", whiteSpace: "nowrap" },
  td: { borderTop: "1px solid #e3ebf3", padding: 9, color: "#52647b", textAlign: "center", whiteSpace: "nowrap" },
  empty: { borderTop: "1px solid #e3ebf3", padding: 18, color: "#8190a4", textAlign: "center" },
};
