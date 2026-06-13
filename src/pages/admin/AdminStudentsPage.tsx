import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import * as XLSX from "xlsx-js-style";
import { getMergeBatches } from "../../db/localMergeDb";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import { readWorkbook } from "../../services/templateParser";
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

type CloudStudentRow = {
  id?: number | string;
  academic_year?: string | null;
  college_name?: string | null;
  student_id?: string | null;
  name?: string | null;
  id_card?: string | null;
  difficulty_level?: string | null;
  status?: string | null;
};

type HistoricalImportStats = {
  total: number;
  success: number;
  skipped: number;
  failed: number;
};

type HistoricalImportRow = {
  academic_year: string;
  college_name: string;
  student_id: string;
  name: string;
  id_card: string;
  difficulty_level: string;
  status: string;
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

const makeStudentKey = (row: Pick<HistoricalImportRow, "id_card" | "student_id">) =>
  normalizeIdCard(row.id_card) || row.student_id.trim();

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

const makeCloudMergedRows = (rows: CloudStudentRow[]): MergedDifficultyRow[] =>
  rows.map((row) => ({
    collegeName: normalizeSubmissionCollegeName(String(row.college_name || "")),
    name: String(row.name || ""),
    studentId: String(row.student_id || ""),
    idCard: normalizeIdCard(String(row.id_card || "")),
    difficultyLevel: String(row.difficulty_level || ""),
    familyMembers: [],
    relationStatus: row.status === "archived" ? "管理员归档" : "云端学生主信息",
  }));

const mergeDatabaseRows = (localRows: MergedDifficultyRow[], cloudRows: MergedDifficultyRow[]) => {
  const rows = [...localRows];
  const existingKeys = new Set(
    localRows.map((row) => normalizeIdCard(row.idCard) || row.studentId.trim()).filter(Boolean)
  );
  cloudRows.forEach((row) => {
    const key = normalizeIdCard(row.idCard) || row.studentId.trim();
    if (key && existingKeys.has(key)) return;
    if (key) existingKeys.add(key);
    rows.push(row);
  });
  return rows;
};

const normalizeHeader = (value: unknown) =>
  String(value ?? "")
    .replace(/\s|\*|（.*?）|\(.*?\)/g, "")
    .trim();

const findHistoricalHeaderIndex = (rows: unknown[][]) => {
  let bestIndex = -1;
  let bestScore = -1;
  rows.slice(0, 12).forEach((row, index) => {
    const headers = row.map(normalizeHeader);
    const score = [
      ["姓名", "学生姓名", "name"],
      ["学号", "学生学号", "student_id"],
      ["身份证号", "身份证件号", "id_card"],
      ["学院", "院系", "学部", "college_name"],
      ["困难等级", "困难档次", "困难认定等级", "difficulty_level"],
    ].reduce((sum, aliases) => (
      headers.some((header) => aliases.some((alias) => header.includes(normalizeHeader(alias)))) ? sum + 1 : sum
    ), 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestScore >= 2 ? bestIndex : -1;
};

const getRowValueByHeader = (row: unknown[], headers: string[], aliases: string[]) => {
  const normalizedAliases = aliases.map(normalizeHeader);
  const index = headers.findIndex((header) =>
    normalizedAliases.some((alias) => header.includes(alias) || alias.includes(header))
  );
  return index >= 0 ? String(row[index] ?? "").trim() : "";
};

const parseHistoricalRows = (rows: unknown[][], academicYear: string) => {
  const headerIndex = findHistoricalHeaderIndex(rows);
  if (headerIndex < 0) throw new Error("未识别到往年困难生数据库表头，请确认 Excel 包含姓名、学号、身份证号等字段");

  const headers = (rows[headerIndex] || []).map(normalizeHeader);
  const parsedRows: HistoricalImportRow[] = [];
  const failures: string[] = [];
  let total = 0;

  rows.slice(headerIndex + 1).forEach((row, index) => {
    if (row.every((cell) => !String(cell ?? "").trim())) return;
    total += 1;
    const excelRowNumber = headerIndex + index + 2;
    const item: HistoricalImportRow = {
      academic_year: academicYear,
      college_name: getRowValueByHeader(row, headers, ["college_name", "学院", "院系", "学部", "院系名称"]) || "未填学院",
      student_id: getRowValueByHeader(row, headers, ["student_id", "学号", "学生学号", "学生编号"]),
      name: getRowValueByHeader(row, headers, ["name", "姓名", "学生姓名"]),
      id_card: normalizeIdCard(getRowValueByHeader(row, headers, ["id_card", "身份证号", "身份证件号", "证件号", "学生身份证号"])),
      difficulty_level: getRowValueByHeader(row, headers, ["difficulty_level", "困难等级", "困难档次", "困难认定等级", "认定等级", "特殊困难类型"]),
      status: "archived",
    };

    if (!item.name) {
      failures.push(`第 ${excelRowNumber} 行失败：缺少姓名`);
      return;
    }
    if (!item.id_card && !item.student_id) {
      failures.push(`第 ${excelRowNumber} 行失败：身份证号和学号至少需要填写一个`);
      return;
    }
    parsedRows.push(item);
  });

  return { rows: parsedRows, failures, total, headerIndex };
};

export default function AdminStudentsPage() {
  const [batches, setBatches] = useState<CollegeProcessedBatch[]>([]);
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());
  const [historicalYear, setHistoricalYear] = useState(getCurrentAcademicYear());
  const [historicalFile, setHistoricalFile] = useState<File | null>(null);
  const [cloudStudents, setCloudStudents] = useState<CloudStudentRow[]>([]);
  const [importStats, setImportStats] = useState<HistoricalImportStats>({ total: 0, success: 0, skipped: 0, failed: 0 });
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getMergeBatches().then(setBatches);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase
      .from("students")
      .select("id,academic_year,college_name,student_id,name,id_card,difficulty_level,status")
      .eq("academic_year", academicYear)
      .then(({ data, error }) => {
        if (error) {
          console.error("Failed to load archived hardship students:", error);
          return;
        }
        setCloudStudents((data || []) as CloudStudentRow[]);
      });
  }, [academicYear]);

  const yearBatches = useMemo(
    () => batches.filter((item) => isBatchInAcademicYear(item, academicYear)),
    [academicYear, batches]
  );
  const mergedRows = useMemo(
    () => mergeDatabaseRows(makeMergedRows(yearBatches), makeCloudMergedRows(cloudStudents)),
    [yearBatches, cloudStudents]
  );
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

  const pushImportLog = (message: string) => {
    setImportLogs((current) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...current].slice(0, 80));
  };

  const importHistoricalData = async () => {
    if (!historicalFile) {
      alert("请先选择往年困难生数据库文件");
      return;
    }
    if (!isSupabaseConfigured) {
      pushImportLog("导入失败：请先配置 Supabase 环境变量");
      alert("请先配置 Supabase 环境变量");
      return;
    }

    setIsImporting(true);
    setImportStats({ total: 0, success: 0, skipped: 0, failed: 0 });
    try {
      const workbook = await readWorkbook(historicalFile);
      const sheetName = workbook.sheetNames.find((name) => (workbook.sheets[name] || []).length > 0) || workbook.sheetNames[0];
      if (!sheetName) throw new Error("Excel 中未找到可读取的工作表");

      const parsed = parseHistoricalRows(workbook.sheets[sheetName] || [], historicalYear);
      const seenKeys = new Set<string>();
      const dedupedRows: HistoricalImportRow[] = [];
      let skipped = 0;
      parsed.rows.forEach((row) => {
        const key = makeStudentKey(row);
        if (!key || seenKeys.has(key)) {
          skipped += 1;
          pushImportLog(`跳过重复：${row.name || "未命名"}（${key || "缺少识别号"}）`);
          return;
        }
        seenKeys.add(key);
        dedupedRows.push(row);
      });

      const { data: existingRows, error: fetchError } = await supabase
        .from("students")
        .select("id,student_id,id_card,academic_year")
        .eq("academic_year", historicalYear);
      if (fetchError) throw fetchError;

      const existingMap = new Map<string, CloudStudentRow>();
      ((existingRows || []) as CloudStudentRow[]).forEach((row) => {
        const key = normalizeIdCard(String(row.id_card || "")) || String(row.student_id || "").trim();
        if (key) existingMap.set(key, row);
      });

      let success = 0;
      let failed = parsed.failures.length;
      for (const row of dedupedRows) {
        const key = makeStudentKey(row);
        const existing = existingMap.get(key);
        if (existing?.id !== undefined) {
          const { error } = await supabase.from("students").update(row).eq("id", existing.id);
          if (error) {
            failed += 1;
            console.error("Historical student update failed:", error, row);
            pushImportLog(`更新失败：${row.name}，${error.message}`);
          } else {
            success += 1;
            pushImportLog(`已更新：${row.name}（${historicalYear}）`);
          }
        } else {
          const { error } = await supabase.from("students").insert(row);
          if (error) {
            failed += 1;
            console.error("Historical student insert failed:", error, row);
            pushImportLog(`导入失败：${row.name}，${error.message}`);
          } else {
            success += 1;
            pushImportLog(`已导入：${row.name}（${historicalYear}）`);
          }
        }
      }

      parsed.failures.forEach(pushImportLog);
      setImportStats({ total: parsed.total, success, skipped, failed });
      pushImportLog(`导入完成：工作表 ${sheetName}，表头第 ${parsed.headerIndex + 1} 行，成功 ${success} 条，跳过 ${skipped} 条，失败 ${failed} 条`);
      if (historicalYear === academicYear) {
        const { data } = await supabase
          .from("students")
          .select("id,academic_year,college_name,student_id,name,id_card,difficulty_level,status")
          .eq("academic_year", academicYear);
        setCloudStudents((data || []) as CloudStudentRow[]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "往年数据导入失败";
      console.error("Historical hardship import failed:", error);
      setImportStats((current) => ({ ...current, failed: current.failed + 1 }));
      pushImportLog(`导入失败：${message}`);
      alert(message);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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
            <h2 style={styles.subTitle}>上载往年数据</h2>
            <p style={styles.description}>管理员可直接归档往年困难生数据库 Excel，数据会按所选 academic_year 写入 students 表，不走学院端上载流程。</p>
          </div>
          <span style={styles.badge}>学校管理员归档</span>
        </div>
        <div style={styles.importGrid}>
          <label style={styles.yearSelectLabel}>
            当前选择学年
            <select style={styles.yearSelect} value={historicalYear} onChange={(event) => setHistoricalYear(event.target.value)}>
              {ACADEMIC_YEAR_OPTIONS.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </label>
          <div style={styles.filePicker}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: "none" }}
              onChange={(event) => setHistoricalFile(event.target.files?.[0] || null)}
            />
            <button style={styles.secondaryButton} onClick={() => fileInputRef.current?.click()}>选择往年困难生数据库文件</button>
            <span style={styles.fileName}>{historicalFile?.name || "未选择文件"}</span>
          </div>
          <button style={isImporting ? styles.disabledButton : styles.importButton} disabled={isImporting} onClick={importHistoricalData}>
            {isImporting ? "导入中..." : "开始导入"}
          </button>
        </div>
        <div style={styles.importStats}>
          <Stat label="总行数" value={importStats.total} />
          <Stat label="成功导入数" value={importStats.success} tone="#087b5b" />
          <Stat label="跳过重复数" value={importStats.skipped} tone="#a16207" />
          <Stat label="失败数" value={importStats.failed} tone="#c2414d" />
        </div>
        <div style={styles.importLogBox}>
          {importLogs.length === 0 ? (
            <div style={styles.importLogItem}>暂无导入日志</div>
          ) : (
            importLogs.map((log, index) => <div key={`${log}_${index}`} style={styles.importLogItem}>{log}</div>)
          )}
        </div>
      </section>

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
  secondaryButton: { border: "1px solid #cbd8e6", borderRadius: 6, padding: "10px 12px", background: "#fff", color: "#26364e", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" },
  importButton: { border: "none", borderRadius: 6, padding: "10px 14px", background: "#0b9b6f", color: "#fff", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" },
  disabledButton: { border: "none", borderRadius: 6, padding: "10px 14px", background: "#a6b4c5", color: "#fff", cursor: "not-allowed", fontWeight: 700, whiteSpace: "nowrap" },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 14 },
  stat: { background: "#fff", border: "1px solid #d7e1ed", borderRadius: 8, padding: 14 },
  statLabel: { color: "#63738a", marginBottom: 7, fontSize: 13 },
  statValue: { fontSize: 24 },
  card: { background: "#fff", border: "1px solid #d7e1ed", borderRadius: 8, padding: 16, marginBottom: 14 },
  sectionHead: { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", marginBottom: 12 },
  subTitle: { margin: 0, color: "#172033", fontSize: 17 },
  badge: { padding: "5px 8px", borderRadius: 999, background: "#e8f4ff", color: "#0077d4", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" },
  importGrid: { display: "grid", gridTemplateColumns: "minmax(150px, 180px) minmax(260px, 1fr) auto", gap: 10, alignItems: "end", marginTop: 12 },
  filePicker: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  fileName: { color: "#63738a", fontSize: 13 },
  importStats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginTop: 12 },
  importLogBox: { marginTop: 12, maxHeight: 180, overflowY: "auto", border: "1px solid #d7e1ed", borderRadius: 6, background: "#f8fbfe", padding: 10 },
  importLogItem: { color: "#52647b", fontSize: 13, lineHeight: 1.6, marginBottom: 6 },
  tableWrap: { overflow: "auto", border: "1px solid #d7e1ed", borderRadius: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { background: "#edf4fa", color: "#40526a", padding: 9, textAlign: "center", whiteSpace: "nowrap" },
  td: { borderTop: "1px solid #e3ebf3", padding: 9, color: "#52647b", textAlign: "center", whiteSpace: "nowrap" },
  empty: { borderTop: "1px solid #e3ebf3", padding: 18, color: "#8190a4", textAlign: "center" },
};
