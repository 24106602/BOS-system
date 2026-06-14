import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
  grade: string;
  gender: string;
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
  grade?: string | null;
  gender?: string | null;
  difficulty_level?: string | null;
  status?: string | null;
  raw_data?: Record<string, unknown> | null;
};

type HistoricalImportStats = {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
};

type HistoricalImportRow = {
  academic_year: string;
  college_name: string;
  student_id: string;
  name: string;
  id_card: string;
  grade: string;
  gender: string;
  difficulty_level: string;
  status: string;
  raw_data: Record<string, unknown>;
};

type SearchFilters = {
  name: string;
  studentId: string;
  collegeName: string;
  idCard: string;
  grade: string;
  gender: string;
};

const columns = [
  "学院",
  "姓名",
  "学号",
  "身份证号",
  "年级",
  "性别",
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

const emptyFilters: SearchFilters = {
  name: "",
  studentId: "",
  collegeName: "",
  idCard: "",
  grade: "",
  gender: "",
};

const logSupabaseError = (title: string, error: unknown) => {
  const detail = error as { message?: string; details?: string; hint?: string; code?: string };
  console.error(title, {
    message: detail?.message,
    details: detail?.details,
    hint: detail?.hint,
    code: detail?.code,
    error,
  });
};

const formatSupabaseError = (error: unknown) => {
  const detail = error as { message?: string; details?: string; hint?: string; code?: string };
  return [
    detail?.message,
    detail?.details ? `details: ${detail.details}` : "",
    detail?.hint ? `hint: ${detail.hint}` : "",
    detail?.code ? `code: ${detail.code}` : "",
  ].filter(Boolean).join("；") || "未知 Supabase 错误";
};

const makeFullStudentPayload = (row: HistoricalImportRow) => ({
  academic_year: row.academic_year,
  college_name: row.college_name,
  student_id: row.student_id,
  name: row.name,
  id_card: row.id_card,
  grade: row.grade,
  gender: row.gender,
  difficulty_level: row.difficulty_level,
  status: row.status,
  raw_data: row.raw_data,
});

const makeCompatibleStudentPayload = (row: HistoricalImportRow) => ({
  academic_year: row.academic_year,
  college_name: row.college_name,
  student_id: row.student_id,
  name: row.name,
  id_card: row.id_card,
  difficulty_level: row.difficulty_level,
  status: row.status,
});

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
        grade: getText(row, ["grade", "年级", "所在年级"]),
        gender: getText(row, ["gender", "性别"]),
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
    grade: String(row.grade || ""),
    gender: String(row.gender || ""),
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

const isNoisyCell = (value: unknown) => {
  const text = String(value ?? "").trim().toUpperCase();
  return !text || text === "#N/A" || text === "N/A" || text === "NULL" || text === "UNDEFINED";
};

const hasHeaderAlias = (headers: string[], aliases: string[]) => {
  const normalizedAliases = aliases.map(normalizeHeader).filter(Boolean);
  return headers.some((header) =>
    header && normalizedAliases.some((alias) => header.includes(alias) || alias.includes(header))
  );
};

const findHistoricalHeaderIndex = (rows: unknown[][]) => {
  let bestIndex = -1;
  let bestScore = -1;
  rows.slice(0, 12).forEach((row, index) => {
    const headers = row.map(normalizeHeader);
    const score = [
      ["学年", "academic_year"],
      ["姓名", "学生姓名", "name"],
      ["学号", "学生学号", "student_id"],
      ["身份证号", "身份证件号", "id_card"],
      ["学院", "学院名称", "学部", "学部院", "院系", "college_name"],
      ["年级", "grade"],
      ["性别", "gender"],
      ["困难等级", "困难档次", "困难认定等级", "difficulty_level"],
    ].reduce((sum, aliases) => (
      headers.some((header) => aliases.some((alias) => header.includes(normalizeHeader(alias)))) ? sum + 1 : sum
    ), 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestScore >= 3 ? bestIndex : -1;
};

const scoreHistoricalSheet = (rows: unknown[][]) => {
  const headerIndex = findHistoricalHeaderIndex(rows);
  if (headerIndex < 0) return { headerIndex: -1, score: -1 };
  const headers = (rows[headerIndex] || []).map(normalizeHeader);
  const score = [
    ["学年", "academic_year"],
    ["学院", "学院名称", "学部", "学部院", "院系", "college_name"],
    ["姓名", "学生姓名", "name"],
    ["身份证号", "身份证", "身份证件号", "id_card"],
    ["学号", "学生学号", "student_id"],
    ["困难等级", "推荐档次", "院系推荐档次", "学校推荐档次", "认定等级", "difficulty_level"],
  ].reduce((sum, aliases) => hasHeaderAlias(headers, aliases) ? sum + 1 : sum, 0);
  return { headerIndex, score };
};

const pickHistoricalSheetName = (workbook: Awaited<ReturnType<typeof readWorkbook>>) => {
  const preferredName = workbook.sheetNames.find((name) => name.trim() === "困难生明细-管理（首页）");
  if (preferredName) return preferredName;

  let bestName = "";
  let bestScore = -1;
  workbook.sheetNames.forEach((name) => {
    const rows = workbook.sheets[name] || [];
    if (rows.length === 0) return;
    const { score } = scoreHistoricalSheet(rows);
    if (score > bestScore) {
      bestScore = score;
      bestName = name;
    }
  });
  return bestScore >= 4 ? bestName : "";
};

const getRowValueByHeader = (row: unknown[], headers: string[], aliases: string[]) => {
  const normalizedAliases = aliases.map(normalizeHeader);
  const index = headers.findIndex((header) =>
    header && normalizedAliases.some((alias) => header.includes(alias) || alias.includes(header))
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
    if (row.every(isNoisyCell)) return;
    const excelRowNumber = headerIndex + index + 2;
    const rawData = headers.reduce<Record<string, unknown>>((record, header, columnIndex) => {
      if (header) record[header] = row[columnIndex] ?? "";
      return record;
    }, {});
    const item: HistoricalImportRow = {
      academic_year: academicYear,
      college_name: getRowValueByHeader(row, headers, ["college_name", "学部（院）", "学部院", "学院", "学院名称", "院系", "学部", "院系名称"]) || "未填学院",
      student_id: getRowValueByHeader(row, headers, ["student_id", "学号", "学生学号", "学生编号"]),
      name: getRowValueByHeader(row, headers, ["name", "姓名", "学生姓名"]),
      id_card: normalizeIdCard(getRowValueByHeader(row, headers, ["id_card", "身份证", "身份证号", "身份证件号", "证件号", "学生身份证号"])),
      grade: getRowValueByHeader(row, headers, ["grade", "年级", "所在年级"]),
      gender: getRowValueByHeader(row, headers, ["gender", "性别"]),
      difficulty_level: getRowValueByHeader(row, headers, ["difficulty_level", "推荐档次", "院系推荐档次", "学校推荐档次", "困难等级", "困难档次", "困难认定等级", "认定等级", "特殊困难类型"]),
      status: getRowValueByHeader(row, headers, ["status", "状态", "审核状态"]) || "archived",
      raw_data: rawData,
    };

    const hasMeaningfulData = [
      item.college_name,
      item.student_id,
      item.name,
      item.id_card,
      item.difficulty_level,
    ].some((value) => !isNoisyCell(value));
    if (!hasMeaningfulData) return;

    total += 1;
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
  const [importStats, setImportStats] = useState<HistoricalImportStats>({ total: 0, inserted: 0, updated: 0, skipped: 0, failed: 0 });
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoadingDatabase, setIsLoadingDatabase] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [searchFilters, setSearchFilters] = useState<SearchFilters>(emptyFilters);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getMergeBatches().then(setBatches);
  }, []);

  const loadCloudStudents = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setCloudStudents([]);
      setLoadError("读取困难生数据库失败：请先配置 Supabase 环境变量。");
      return;
    }

    setIsLoadingDatabase(true);
    setLoadError("");
    const fullSelect = "id,academic_year,college_name,student_id,name,id_card,grade,gender,difficulty_level,status,raw_data";
    const { data, error } = await supabase
      .from("students")
      .select(fullSelect)
      .eq("academic_year", academicYear);

    if (!error) {
      setCloudStudents((data || []) as CloudStudentRow[]);
      setIsLoadingDatabase(false);
      return;
    }

    logSupabaseError("读取困难生数据库失败", error);
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("students")
      .select("id,academic_year,college_name,student_id,name,id_card,difficulty_level,status")
      .eq("academic_year", academicYear);

    if (fallbackError) {
      logSupabaseError("读取困难生数据库兼容字段失败", fallbackError);
      setCloudStudents([]);
      setLoadError(`读取困难生数据库失败：${formatSupabaseError(fallbackError)}`);
    } else {
      setCloudStudents((fallbackData || []) as CloudStudentRow[]);
      setLoadError(`读取困难生数据库部分字段失败：${formatSupabaseError(error)}。已用兼容字段显示数据，请检查 students 表是否包含 grade、gender、raw_data。`);
    }
    setIsLoadingDatabase(false);
  }, [academicYear]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCloudStudents();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCloudStudents]);

  const yearBatches = useMemo(
    () => batches.filter((item) => isBatchInAcademicYear(item, academicYear)),
    [academicYear, batches]
  );
  const mergedRows = useMemo(
    () => mergeDatabaseRows(makeMergedRows(yearBatches), makeCloudMergedRows(cloudStudents)),
    [yearBatches, cloudStudents]
  );
  const availableColleges = useMemo(
    () => Array.from(new Set(mergedRows.map((row) => row.collegeName).filter(Boolean))).sort(),
    [mergedRows]
  );
  const availableGrades = useMemo(
    () => Array.from(new Set(mergedRows.map((row) => row.grade).filter(Boolean))).sort(),
    [mergedRows]
  );
  const filteredRows = useMemo(() => {
    const name = searchFilters.name.trim();
    const studentId = searchFilters.studentId.trim();
    const collegeName = searchFilters.collegeName.trim();
    const idCard = normalizeIdCard(searchFilters.idCard.trim());
    const grade = searchFilters.grade.trim();
    const gender = searchFilters.gender.trim();

    return mergedRows.filter((row) => {
      if (name && !row.name.includes(name)) return false;
      if (studentId && !row.studentId.includes(studentId)) return false;
      if (collegeName && row.collegeName !== collegeName && !row.collegeName.includes(collegeName)) return false;
      if (idCard && !normalizeIdCard(row.idCard).includes(idCard)) return false;
      if (grade && row.grade !== grade && !row.grade.includes(grade)) return false;
      if (gender && row.gender !== gender) return false;
      return true;
    });
  }, [mergedRows, searchFilters]);
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
      年级: row.grade,
      性别: row.gender,
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

  const writeHistoricalStudent = async (row: HistoricalImportRow, existing?: CloudStudentRow) => {
    const fullPayload = makeFullStudentPayload(row);
    const compatiblePayload = makeCompatibleStudentPayload(row);
    const action = existing?.id !== undefined
      ? supabase.from("students").update(fullPayload).eq("id", existing.id)
      : supabase.from("students").insert(fullPayload);
    const { error } = await action;

    if (!error) return { ok: true, fallback: false };

    logSupabaseError(existing?.id !== undefined ? "Historical student update failed" : "Historical student insert failed", error);
    pushImportLog(`${existing?.id !== undefined ? "更新" : "新增"}兼容重试：${row.name || row.student_id || row.id_card}，${formatSupabaseError(error)}`);

    const fallbackAction = existing?.id !== undefined
      ? supabase.from("students").update(compatiblePayload).eq("id", existing.id)
      : supabase.from("students").insert(compatiblePayload);
    const { error: fallbackError } = await fallbackAction;

    if (!fallbackError) return { ok: true, fallback: true };

    logSupabaseError(existing?.id !== undefined ? "Historical student fallback update failed" : "Historical student fallback insert failed", fallbackError);
    return { ok: false, fallback: false, error: fallbackError };
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
    setImportStats({ total: 0, inserted: 0, updated: 0, skipped: 0, failed: 0 });
    try {
      const workbook = await readWorkbook(historicalFile);
      const sheetName = pickHistoricalSheetName(workbook);
      if (!sheetName) {
        throw new Error(`Excel 中未找到可读取的困难生历史总表。已读取 Sheet：${workbook.sheetNames.join("、") || "无"}`);
      }

      const parsed = parseHistoricalRows(workbook.sheets[sheetName] || [], historicalYear);
      const headers = ((workbook.sheets[sheetName] || [])[parsed.headerIndex] || [])
        .map(normalizeHeader)
        .filter(Boolean);
      pushImportLog(`读取文件：${historicalFile.name}`);
      pushImportLog(`读取到的 Sheet：${workbook.sheetNames.join("、")}`);
      pushImportLog(`实际使用 Sheet：${sheetName}；表头第 ${parsed.headerIndex + 1} 行；识别字段：${headers.join("、") || "无"}`);
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
      if (fetchError) {
        logSupabaseError("查询同学年已有困难生失败", fetchError);
        throw new Error(`查询同学年已有困难生失败：${formatSupabaseError(fetchError)}`);
      }

      const existingMap = new Map<string, CloudStudentRow>();
      ((existingRows || []) as CloudStudentRow[]).forEach((row) => {
        const key = normalizeIdCard(String(row.id_card || "")) || String(row.student_id || "").trim();
        if (key) existingMap.set(key, row);
      });

      let inserted = 0;
      let updated = 0;
      let failed = parsed.failures.length;
      for (const row of dedupedRows) {
        const key = makeStudentKey(row);
        const existing = existingMap.get(key);
        const result = await writeHistoricalStudent(row, existing);
        const label = row.name || row.student_id || row.id_card || "未命名";
        if (!result.ok) {
          failed += 1;
          pushImportLog(`${existing?.id !== undefined ? "更新" : "导入"}失败：${label}，${formatSupabaseError(result.error)}`);
        } else if (existing?.id !== undefined) {
          updated += 1;
          pushImportLog(`已更新：${label}（${historicalYear}）${result.fallback ? "，已用兼容字段写入" : ""}`);
        } else {
          inserted += 1;
          pushImportLog(`已新增：${label}（${historicalYear}）${result.fallback ? "，已用兼容字段写入" : ""}`);
        }
      }

      parsed.failures.forEach(pushImportLog);
      setImportStats({ total: parsed.total, inserted, updated, skipped, failed });
      pushImportLog(`导入完成：工作表 ${sheetName}，表头第 ${parsed.headerIndex + 1} 行，新增 ${inserted} 条，更新 ${updated} 条，跳过 ${skipped} 条，失败 ${failed} 条`);
      if (historicalYear === academicYear) {
        await loadCloudStudents();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "往年数据导入失败";
      logSupabaseError("Historical hardship import failed", error);
      setImportStats((current) => ({ ...current, failed: current.failed + 1 }));
      pushImportLog(`导入失败：${message}`);
      alert(message);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <section style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>困难生业务 / 系统自动关联</div>
          <h1 style={styles.title}>困难生数据库</h1>
          <p style={styles.description}>
            困难生数据库由系统按学年归档管理。管理员可导入往年困难生数据库，数据保存到后端信息库 Supabase，刷新页面后仍然保留。
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

      <section style={{ ...styles.card, ...styles.importCard }}>
        <div style={styles.sectionHead}>
          <div>
            <h2 style={styles.subTitle}>上载往年数据</h2>
            <p style={styles.description}>用于导入已有历史名单，例如 2024-2025 学年困难生名单。数据会按所选 academic_year 写入 students 表，不走学部（院）端上载流程。</p>
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
          <Stat label="成功新增" value={importStats.inserted} tone="#087b5b" />
          <Stat label="成功更新" value={importStats.updated} tone="#0077d4" />
          <Stat label="跳过重复数" value={importStats.skipped} tone="#a16207" />
          <Stat label="失败数" value={importStats.failed} tone="#c2414d" />
        </div>
        <div style={styles.yearHint}>当前归档学年：{historicalYear}</div>
        <div style={styles.importLogBox}>
          {importLogs.length === 0 ? (
            <div style={styles.importLogItem}>暂无导入日志</div>
          ) : (
            importLogs.map((log, index) => <div key={`${log}_${index}`} style={styles.importLogItem}>{log}</div>)
          )}
        </div>
      </section>

      <section style={{ ...styles.card, ...styles.detailCard }}>
        <div style={styles.sectionHead}>
          <div>
            <h2 style={styles.subTitle}>当前学年困难生数据库明细表</h2>
            <p style={styles.description}>
              可按姓名、学号、学部（院）、身份证号、年级、性别查找学生。当前显示 {filteredRows.length} 条 / 当前学年共 {mergedRows.length} 条。
            </p>
          </div>
          <span style={styles.badge}>按 id_card = student_id_card 自动生成</span>
        </div>
        {isLoadingDatabase && <div style={styles.infoMessage}>正在加载困难生数据库……</div>}
        {loadError && <div style={styles.errorMessage}>{loadError}</div>}
        <div style={styles.searchGrid}>
          <label style={styles.fieldLabel}>
            姓名
            <input
              style={styles.searchInput}
              value={searchFilters.name}
              onChange={(event) => setSearchFilters((current) => ({ ...current, name: event.target.value }))}
              placeholder="支持模糊查询"
            />
          </label>
          <label style={styles.fieldLabel}>
            学号
            <input
              style={styles.searchInput}
              value={searchFilters.studentId}
              onChange={(event) => setSearchFilters((current) => ({ ...current, studentId: event.target.value }))}
              placeholder="输入学号"
            />
          </label>
          <label style={styles.fieldLabel}>
            学部（院）
            <select
              style={styles.searchInput}
              value={searchFilters.collegeName}
              onChange={(event) => setSearchFilters((current) => ({ ...current, collegeName: event.target.value }))}
            >
              <option value="">全部</option>
              {availableColleges.map((college) => <option key={college} value={college}>{college}</option>)}
            </select>
          </label>
          <label style={styles.fieldLabel}>
            身份证号
            <input
              style={styles.searchInput}
              value={searchFilters.idCard}
              onChange={(event) => setSearchFilters((current) => ({ ...current, idCard: event.target.value }))}
              placeholder="输入身份证号"
            />
          </label>
          <label style={styles.fieldLabel}>
            年级
            <select
              style={styles.searchInput}
              value={searchFilters.grade}
              onChange={(event) => setSearchFilters((current) => ({ ...current, grade: event.target.value }))}
            >
              <option value="">全部</option>
              {availableGrades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
            </select>
          </label>
          <label style={styles.fieldLabel}>
            性别
            <select
              style={styles.searchInput}
              value={searchFilters.gender}
              onChange={(event) => setSearchFilters((current) => ({ ...current, gender: event.target.value }))}
            >
              <option value="">全部</option>
              <option value="男">男</option>
              <option value="女">女</option>
            </select>
          </label>
          <button style={styles.secondaryButton} onClick={() => setSearchFilters(emptyFilters)}>重置筛选</button>
        </div>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead><tr>{columns.map((column) => <th key={column} style={styles.th}>{column}</th>)}</tr></thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr><td style={styles.empty} colSpan={columns.length}>{mergedRows.length === 0 ? "暂无当前学年已合并数据" : "没有符合筛选条件的数据"}</td></tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={`${row.collegeName}_${row.idCard}_${row.studentId}`}>
                    <td style={styles.td}>{row.collegeName}</td>
                    <td style={styles.td}>{row.name || "-"}</td>
                    <td style={styles.td}>{row.studentId || "-"}</td>
                    <td style={styles.td}>{row.idCard || "-"}</td>
                    <td style={styles.td}>{row.grade || "-"}</td>
                    <td style={styles.td}>{row.gender || "-"}</td>
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
  page: { height: "calc(100vh - 104px)", minHeight: 720, display: "grid", gridTemplateRows: "auto auto minmax(190px, 0.7fr) minmax(0, 1.3fr)", gap: 10, overflow: "hidden" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, marginBottom: 10, padding: 14, border: "1px solid #d7e1ed", borderRadius: 8, background: "#fff", boxShadow: "0 4px 14px rgba(15,35,64,0.05)" },
  headerActions: { display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" },
  eyebrow: { color: "#0077d4", fontSize: 12, fontWeight: 800, marginBottom: 5 },
  title: { margin: 0, color: "#172033", fontSize: 22 },
  description: { color: "#63738a", fontSize: 12, lineHeight: 1.55, margin: "6px 0 0" },
  yearSelectLabel: { display: "grid", gap: 5, color: "#40526a", fontSize: 12, fontWeight: 700 },
  yearSelect: { minWidth: 132, border: "1px solid #cfdbe7", borderRadius: 6, padding: "8px 10px", color: "#15304f", background: "#fff", fontSize: 13 },
  exportButton: { border: "none", borderRadius: 6, padding: "9px 12px", background: "#0077d4", color: "#fff", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" },
  secondaryButton: { border: "1px solid #cbd8e6", borderRadius: 6, padding: "9px 11px", background: "#fff", color: "#26364e", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" },
  importButton: { border: "none", borderRadius: 6, padding: "9px 12px", background: "#0b9b6f", color: "#fff", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" },
  disabledButton: { border: "none", borderRadius: 6, padding: "9px 12px", background: "#a6b4c5", color: "#fff", cursor: "not-allowed", fontWeight: 700, whiteSpace: "nowrap" },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 8 },
  stat: { height: 64, boxSizing: "border-box", background: "#fff", border: "1px solid #d7e1ed", borderRadius: 8, padding: 10 },
  statLabel: { color: "#63738a", marginBottom: 5, fontSize: 12 },
  statValue: { fontSize: 20 },
  card: { minHeight: 0, background: "#fff", border: "1px solid #d7e1ed", borderRadius: 8, padding: 12, overflow: "hidden" },
  importCard: { display: "grid", gridTemplateRows: "auto auto auto auto minmax(0, 1fr)", gap: 6 },
  detailCard: { display: "flex", flexDirection: "column" },
  sectionHead: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 8 },
  subTitle: { margin: 0, color: "#172033", fontSize: 16 },
  badge: { padding: "5px 8px", borderRadius: 999, background: "#e8f4ff", color: "#0077d4", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" },
  importGrid: { display: "grid", gridTemplateColumns: "minmax(150px, 180px) minmax(260px, 1fr) auto", gap: 8, alignItems: "end", marginTop: 8 },
  filePicker: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  fileName: { color: "#63738a", fontSize: 13 },
  importStats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(105px, 1fr))", gap: 8 },
  yearHint: { color: "#40526a", fontSize: 12, fontWeight: 700 },
  importLogBox: { minHeight: 0, maxHeight: 220, overflowY: "auto", border: "1px solid #d7e1ed", borderRadius: 6, background: "#f8fbfe", padding: 8 },
  importLogItem: { color: "#52647b", fontSize: 12, lineHeight: 1.5, marginBottom: 5 },
  searchGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, alignItems: "end", marginBottom: 10 },
  fieldLabel: { display: "grid", gap: 4, color: "#40526a", fontSize: 12, fontWeight: 700 },
  searchInput: { border: "1px solid #cfdbe7", borderRadius: 6, padding: "8px 9px", color: "#15304f", background: "#fff", fontSize: 13, minWidth: 0 },
  infoMessage: { marginBottom: 8, border: "1px solid #c6e2ff", background: "#f1f8ff", color: "#075f9e", borderRadius: 6, padding: "8px 10px", fontSize: 12, fontWeight: 700 },
  errorMessage: { marginBottom: 8, border: "1px solid #f4c7c7", background: "#fff4f4", color: "#b4232d", borderRadius: 6, padding: "8px 10px", fontSize: 12, fontWeight: 700 },
  tableWrap: { flex: 1, minHeight: 0, overflow: "auto", border: "1px solid #d7e1ed", borderRadius: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { position: "sticky", top: 0, zIndex: 1, background: "#edf4fa", color: "#40526a", padding: "7px 8px", textAlign: "center", whiteSpace: "nowrap" },
  td: { borderTop: "1px solid #e3ebf3", padding: "7px 8px", color: "#52647b", textAlign: "center", whiteSpace: "nowrap" },
  empty: { borderTop: "1px solid #e3ebf3", padding: 16, color: "#8190a4", textAlign: "center" },
};
