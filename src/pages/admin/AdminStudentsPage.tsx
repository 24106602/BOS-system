import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import * as XLSX from "xlsx-js-style";
import { getMergeBatches } from "../../db/localMergeDb";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import { readWorkbook } from "../../services/templateParser";
import type { CollegeProcessedBatch } from "../../types/merge";
import {
  ACADEMIC_YEAR_OPTIONS,
  getBatchAcademicYear,
  getCurrentAcademicYear,
  isBatchInAcademicYear,
} from "../../utils/academicYear";
import { normalizeSubmissionCollegeName } from "../../utils/collegeDetector";
import {
  DIFFICULTY_STUDENT_TEMPLATE_FIELDS,
  getDifficultyTemplateValue,
  makeDifficultyRowKey,
  type DifficultyStudentTemplateField,
} from "../../constants/difficultyStudentTemplate";
import PageHeader from "../../components/ui/PageHeader";
import StatCard from "../../components/ui/StatCard";
import Toolbar from "../../components/ui/Toolbar";
import DifficultyOperationHistory from "../../components/DifficultyOperationHistory";
import { rejectStudentRecords } from "../../services/difficultyStudentService";
import {
  DifficultyStudentApiError,
  importHistoricalDifficultyStudent,
  listDisabledDifficultyStudents,
  reportDifficultyStudentBatch,
  restoreDifficultyStudent,
  transitionDifficultyStudent,
} from "../../services/difficultyStudentApi";
import {
  getDifficultyStudentStatusLabel,
  normalizeDifficultyStudentStatus,
  type DifficultyStudentStatus,
} from "../../constants/statusTransitions";
import {
  DIFFICULTY_STUDENT_ACTION_LABELS,
  getAvailableActions,
  getDifficultyStudentActionHint,
  type DifficultyStudentUiAction,
} from "../../utils/difficultyStudentActions";

type MergedDifficultyRow = {
  academicYear: string;
  collegeName: string;
  name: string;
  studentId: string;
  idCard: string;
  grade: string;
  gender: string;
  difficultyLevel: string;
  status: string;
  rawStatus?: string;
  rejectedReason?: string;
  resubmissionRemark?: string;
  cloudId?: number | string;
  rawData: Record<string, unknown>;
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
  rejected_reason?: string | null;
  resubmission_remark?: string | null;
  raw_data?: Record<string, unknown> | null;
  deleted_at?: string | null;
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
  status: DifficultyStudentStatus;
  raw_data: Record<string, unknown>;
};

type SearchFilters = {
  name: string;
  studentId: string;
  collegeName: string;
  idCard: string;
  grade: string;
  gender: string;
  difficultyLevel: string;
  status: string;
};

const getMergedRowKey = (row: MergedDifficultyRow) =>
  makeDifficultyRowKey(row.academicYear, row.collegeName, row.idCard, row.studentId, 0);

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

const displayStatus = (status: string) => getDifficultyStudentStatusLabel(status);

const getWorkflowStatus = (row: MergedDifficultyRow) => row.rawStatus || row.status;

const hasCloudRecordId = (
  row: MergedDifficultyRow
): row is MergedDifficultyRow & { cloudId: number | string } =>
  row.cloudId !== undefined && row.cloudId !== null && String(row.cloudId).trim() !== "";

const formatWorkflowError = (error: unknown) => {
  if (error instanceof DifficultyStudentApiError && error.failures.length > 0) {
    const failures = error.failures
      .map((item) => `${item.studentId}：${item.reasons.join("、")}`)
      .join("；");
    return `${error.message}（${failures}）`;
  }
  return error instanceof Error ? error.message : "状态操作失败";
};

const makeStudentKey = (row: Pick<HistoricalImportRow, "id_card" | "student_id">) =>
  normalizeIdCard(row.id_card) || row.student_id.trim();

const emptyFilters: SearchFilters = {
  name: "",
  studentId: "",
  collegeName: "",
  idCard: "",
  grade: "",
  gender: "",
  difficultyLevel: "",
  status: "",
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
        academicYear: getBatchAcademicYear(batch),
        collegeName: normalizeSubmissionCollegeName(batch.collegeName),
        name: getText(row, ["name", "姓名", "学生姓名"]),
        studentId: getText(row, ["student_id", "学号", "学生学号", "学生编号"]),
        idCard,
        grade: getText(row, ["grade", "年级", "所在年级"]),
        gender: getText(row, ["gender", "性别"]),
        difficultyLevel: getText(row, ["difficulty_level", "困难等级", "困难认定等级", "特殊困难类型", "认定等级"]),
        status: "已上载学校端",
        rawData: row,
        familyMembers,
        relationStatus,
      };
    })
  );
};

const makeCloudMergedRows = (rows: CloudStudentRow[]): MergedDifficultyRow[] =>
  rows.map((row) => ({
    academicYear: String(row.academic_year || ""),
    collegeName: normalizeSubmissionCollegeName(String(row.college_name || "")),
    name: String(row.name || ""),
    studentId: String(row.student_id || ""),
    idCard: normalizeIdCard(String(row.id_card || "")),
    grade: String(row.grade || ""),
    gender: String(row.gender || ""),
    difficultyLevel: String(row.difficulty_level || ""),
    status: displayStatus(String(row.status || "")),
    rawStatus: String(row.status || ""),
    rejectedReason: String(row.rejected_reason || ""),
    resubmissionRemark: String(row.resubmission_remark || ""),
    cloudId: row.id,
    rawData: row.raw_data || {},
    familyMembers: [],
    relationStatus: row.status === "archived" ? "管理员归档" : "云端学生主信息",
  }));

const mergeDatabaseRows = (localRows: MergedDifficultyRow[], cloudRows: MergedDifficultyRow[]) => {
  const cloudByKey = new Map(
    cloudRows
      .map((row) => [normalizeIdCard(row.idCard) || row.studentId.trim(), row] as const)
      .filter(([key]) => Boolean(key))
  );
  const rows = localRows.map((localRow) => {
    const key = normalizeIdCard(localRow.idCard) || localRow.studentId.trim();
    const cloudRow = key ? cloudByKey.get(key) : undefined;
    if (!cloudRow) return localRow;
    cloudByKey.delete(key);
    return {
      ...localRow,
      ...cloudRow,
      rawData: { ...localRow.rawData, ...cloudRow.rawData },
      familyMembers: localRow.familyMembers,
      relationStatus: localRow.relationStatus,
    };
  });
  return [...rows, ...cloudByKey.values()];
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
      college_name: getRowValueByHeader(row, headers, ["college_name", "学院", "学院名称", "院系", "学部", "院系名称"]) || "未填学院",
      student_id: getRowValueByHeader(row, headers, ["student_id", "学号", "学生学号", "学生编号"]),
      name: getRowValueByHeader(row, headers, ["name", "姓名", "学生姓名"]),
      id_card: normalizeIdCard(getRowValueByHeader(row, headers, ["id_card", "身份证", "身份证号", "身份证件号", "证件号", "学生身份证号"])),
      grade: getRowValueByHeader(row, headers, ["grade", "年级", "所在年级"]),
      gender: getRowValueByHeader(row, headers, ["gender", "性别"]),
      difficulty_level: getRowValueByHeader(row, headers, ["difficulty_level", "推荐档次", "院系推荐档次", "学校推荐档次", "困难等级", "困难档次", "困难认定等级", "认定等级", "特殊困难类型"]),
      status: normalizeDifficultyStudentStatus(
        getRowValueByHeader(row, headers, ["status", "状态", "审核状态"]) || "reported",
        "reported"
      ),
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
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedRow, setSelectedRow] = useState<MergedDifficultyRow | null>(null);
  const [detailTab, setDetailTab] = useState<"detail" | "history">("detail");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showDisabledModal, setShowDisabledModal] = useState(false);
  const [disabledStudents, setDisabledStudents] = useState<CloudStudentRow[]>([]);
  const [isLoadingDisabled, setIsLoadingDisabled] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [pendingRowKey, setPendingRowKey] = useState("");
  const [isBulkActionPending, setIsBulkActionPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getTemplateCell = (row: MergedDifficultyRow, field: DifficultyStudentTemplateField) => {
    if (field === "姓名(*)") return getDifficultyTemplateValue(row.rawData, field, row.name);
    if (field === "身份证号(*)") return getDifficultyTemplateValue(row.rawData, field, row.idCard);
    if (field === "特殊困难类型(*)" || field === "推荐档次(*)") {
      return getDifficultyTemplateValue(row.rawData, field, row.difficultyLevel);
    }
    return getDifficultyTemplateValue(row.rawData, field);
  };

  useEffect(() => {
    getMergeBatches().then(setBatches);
  }, []);

  const loadCloudStudents = useCallback(async () => {
    setSelectedKeys(new Set());
    if (!isSupabaseConfigured) {
      setCloudStudents([]);
      setLoadError("读取困难生数据库失败：请先配置 Supabase 环境变量。");
      return;
    }

    setIsLoadingDatabase(true);
    setLoadError("");
    const fullSelect = "id,academic_year,college_name,student_id,name,id_card,grade,gender,difficulty_level,status,rejected_reason,resubmission_remark,raw_data";
    const { data, error } = await supabase
      .from("students")
      .select(fullSelect)
      .eq("is_deleted", false)
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
      .eq("is_deleted", false)
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

  const loadDisabledStudents = useCallback(async () => {
    setIsLoadingDisabled(true);
    try {
      const result = await listDisabledDifficultyStudents(academicYear);
      setDisabledStudents(result.data as CloudStudentRow[]);
      setShowDisabledModal(true);
    } catch (error) {
      setActionMessage(formatWorkflowError(error));
    } finally {
      setIsLoadingDisabled(false);
    }
  }, [academicYear]);

  const handleRestoreDisabledStudent = async (student: CloudStudentRow) => {
    if (!student.id || !window.confirm(`确定恢复困难生“${student.name || student.student_id || student.id}”吗？`)) return;
    try {
      await restoreDifficultyStudent(student.id);
      await loadDisabledStudents();
      await loadCloudStudents();
      setActionMessage(`已恢复困难生“${student.name || student.student_id || student.id}”。`);
    } catch (error) {
      setActionMessage(formatWorkflowError(error));
    }
  };

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
    const difficultyLevel = searchFilters.difficultyLevel.trim();
    const status = searchFilters.status.trim();

    return mergedRows.filter((row) => {
      if (name && !row.name.includes(name)) return false;
      if (studentId && !row.studentId.includes(studentId)) return false;
      if (collegeName && row.collegeName !== collegeName && !row.collegeName.includes(collegeName)) return false;
      if (idCard && !normalizeIdCard(row.idCard).includes(idCard)) return false;
      if (grade && row.grade !== grade && !row.grade.includes(grade)) return false;
      if (gender && row.gender !== gender) return false;
      if (difficultyLevel && !row.difficultyLevel.includes(difficultyLevel)) return false;
      if (status && !row.status.includes(status) && !row.relationStatus.includes(status)) return false;
      return true;
    });
  }, [mergedRows, searchFilters]);
  const studentCount = yearBatches.filter((item) => item.dataType === "student").reduce((sum, item) => sum + item.rowCount, 0);
  const familyCount = yearBatches.filter((item) => item.dataType === "family").reduce((sum, item) => sum + item.rowCount, 0);
  const linkedCount = mergedRows.filter((item) => item.relationStatus === "已关联").length;
  const familyIssueCount = mergedRows.filter((item) => item.relationStatus !== "已关联").length;
  const allVisibleSelected =
    filteredRows.length > 0 && filteredRows.every((row) => selectedKeys.has(getMergedRowKey(row)));

  const toggleAllRows = () => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (allVisibleSelected) filteredRows.forEach((row) => next.delete(getMergedRowKey(row)));
      else filteredRows.forEach((row) => next.add(getMergedRowKey(row)));
      return next;
    });
  };

  const toggleRow = (row: MergedDifficultyRow) => {
    const key = getMergedRowKey(row);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectedRows = mergedRows.filter((row) => selectedKeys.has(getMergedRowKey(row)));
  const canPerformSelectedAction = (action: DifficultyStudentUiAction) =>
    selectedRows.length > 0 && selectedRows.every((row) =>
      hasCloudRecordId(row) && getAvailableActions(getWorkflowStatus(row), "school").includes(action)
    );

  const handleRecordAction = async (
    action: DifficultyStudentUiAction,
    row: MergedDifficultyRow
  ) => {
    if (action === "reject") {
      setSelectedKeys(new Set([getMergedRowKey(row)]));
      setSelectedRow(null);
      setShowRejectModal(true);
      return;
    }
    if (!hasCloudRecordId(row)) {
      setActionMessage("该记录尚未同步到 Supabase，无法执行学校端状态操作。");
      return;
    }
    if (action !== "start_review" && action !== "approve" && action !== "report") return;

    const key = getMergedRowKey(row);
    setPendingRowKey(key);
    setActionMessage("");
    try {
      if (action === "report") {
        await reportDifficultyStudentBatch([row.cloudId]);
      } else {
        await transitionDifficultyStudent(row.cloudId, action === "start_review" ? "submit" : "approve");
      }
      setSelectedRow(null);
      setActionMessage(`${row.name || "该学生"}${DIFFICULTY_STUDENT_ACTION_LABELS[action]}成功。`);
      await loadCloudStudents();
    } catch (error) {
      setActionMessage(formatWorkflowError(error));
    } finally {
      setPendingRowKey("");
    }
  };

  const handleSelectedAction = async (action: "start_review" | "approve" | "report") => {
    if (!canPerformSelectedAction(action)) return;
    const rowsToProcess = selectedRows.filter(hasCloudRecordId);
    setIsBulkActionPending(true);
    setActionMessage("");
    try {
      if (action === "report") {
        await reportDifficultyStudentBatch(rowsToProcess.map((row) => row.cloudId!));
      } else {
        for (const row of rowsToProcess) {
          await transitionDifficultyStudent(row.cloudId!, action === "start_review" ? "submit" : "approve");
        }
      }
      setActionMessage(`已完成 ${rowsToProcess.length} 条记录的“${DIFFICULTY_STUDENT_ACTION_LABELS[action]}”操作。`);
      setSelectedKeys(new Set());
      await loadCloudStudents();
    } catch (error) {
      setActionMessage(formatWorkflowError(error));
    } finally {
      setIsBulkActionPending(false);
    }
  };

  const renderRecordActions = (row: MergedDifficultyRow, location: "table" | "detail") => {
    const status = getWorkflowStatus(row);
    const actions = getAvailableActions(status, "school");
    const hint = getDifficultyStudentActionHint(status, "school");
    const isPending = pendingRowKey === getMergedRowKey(row);
    return (
      <div className={`difficulty-record-actions is-${location}`}>
        {actions.length > 0 && (
          <div className="difficulty-record-action-buttons">
            {actions.map((action) => (
              <button
                key={action}
                className={`difficulty-record-action is-${action}`}
                disabled={isPending || !hasCloudRecordId(row)}
                title={!hasCloudRecordId(row) ? "该记录尚未同步到 Supabase" : undefined}
                onClick={() => void handleRecordAction(action, row)}
              >
                {isPending ? "处理中..." : DIFFICULTY_STUDENT_ACTION_LABELS[action]}
              </button>
            ))}
          </div>
        )}
        <span className="difficulty-status-notice" data-tone={hint.tone}>{hint.text}</span>
        {!hasCloudRecordId(row) && actions.length > 0 && (
          <span className="difficulty-status-notice" data-tone="danger">未同步云端，暂不能执行状态操作。</span>
        )}
      </div>
    );
  };

  const handleReject = async () => {
    if (selectedKeys.size === 0) return;
    if (!canPerformSelectedAction("reject")) {
      setShowRejectModal(false);
      setActionMessage("只有“学校审核中”的云端记录可以执行审核退回。");
      return;
    }
    if (!rejectReason.trim()) {
      alert("请填写退回原因");
      return;
    }

    const rowsToReject = mergedRows.filter((row) => selectedKeys.has(getMergedRowKey(row)) && hasCloudRecordId(row));
    const ids = rowsToReject.map((row) => row.cloudId!);

    setIsBulkActionPending(true);
    const result = await rejectStudentRecords(ids, rejectReason);
    setIsBulkActionPending(false);
    if (!result.success) {
      setActionMessage(result.message);
      return;
    }
    setActionMessage(result.message);
    setShowRejectModal(false);
    setRejectReason("");
    setSelectedKeys(new Set());
    setSelectedRow(null);
    void loadCloudStudents();
  };

  const exportCurrentYearDatabase = () => {
    if (filteredRows.length === 0) {
      alert("暂无当前学年困难生数据库可导出");
      return;
    }

    const exportRows = filteredRows.map((row) => ({
      学年: row.academicYear || academicYear,
      学院: row.collegeName,
      状态: row.status,
      ...Object.fromEntries(
        DIFFICULTY_STUDENT_TEMPLATE_FIELDS.map((field) => [field, getTemplateCell(row, field)])
      ),
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
    try {
      await importHistoricalDifficultyStudent(row);
      return { ok: true, fallback: false };
    } catch (error) {
      logSupabaseError(existing?.id !== undefined ? "Historical student update failed" : "Historical student insert failed", error);
      return { ok: false, fallback: false, error };
    }
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
        .eq("is_deleted", false)
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
    <section className="bos-table-page difficulty-workspace">
      <div className="bos-layout-active">AI Studio Layout Active - Difficulty Database</div>

      <PageHeader
        breadcrumb="困难生业务 / 困难生数据库"
        title="困难生数据库"
        description="按学年汇总学院上载数据，并保留管理员往年 Excel 导入与 Supabase 持久化读写。"
        actions={(
          <label className="bos-current-year">
            当前学年
            <select value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}>
              {ACADEMIC_YEAR_OPTIONS.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
        )}
      />

      <div className="bos-stat-grid">
        <StatCard label="困难生总量" value={mergedRows.length} />
        <StatCard label="筛选结果" value={filteredRows.length} tone="green" />
        <StatCard label="提交学院" value={availableColleges.length} tone="purple" />
        <StatCard
          label="特殊困难"
          value={mergedRows.filter((row) => /特别|特殊|低保|孤儿|残疾|烈士/.test(row.difficultyLevel)).length}
          tone="amber"
        />
      </div>

      <section className="bos-filter-card">
        {isLoadingDatabase && <div style={styles.infoMessage}>正在加载困难生数据库……</div>}
        {loadError && <div style={styles.errorMessage}>{loadError}</div>}
        <div className="bos-filter-grid">
          <label className="bos-filter-field">学院/学部
            <select value={searchFilters.collegeName} onChange={(event) => setSearchFilters((current) => ({ ...current, collegeName: event.target.value }))}>
              <option value="">全部</option>
              {availableColleges.map((college) => <option key={college} value={college}>{college}</option>)}
            </select>
          </label>
          <label className="bos-filter-field">姓名<input value={searchFilters.name} onChange={(event) => setSearchFilters((current) => ({ ...current, name: event.target.value }))} /></label>
          <label className="bos-filter-field">学号<input value={searchFilters.studentId} onChange={(event) => setSearchFilters((current) => ({ ...current, studentId: event.target.value }))} /></label>
          <label className="bos-filter-field">身份证号<input value={searchFilters.idCard} onChange={(event) => setSearchFilters((current) => ({ ...current, idCard: event.target.value }))} /></label>
          <label className="bos-filter-field">困难等级<input value={searchFilters.difficultyLevel} onChange={(event) => setSearchFilters((current) => ({ ...current, difficultyLevel: event.target.value }))} /></label>
          <label className="bos-filter-field">状态<input value={searchFilters.status} onChange={(event) => setSearchFilters((current) => ({ ...current, status: event.target.value }))} /></label>
          <label className="bos-filter-field">年级
            <select value={searchFilters.grade} onChange={(event) => setSearchFilters((current) => ({ ...current, grade: event.target.value }))}>
              <option value="">全部</option>
              {availableGrades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
            </select>
          </label>
          <label className="bos-filter-field">性别
            <select value={searchFilters.gender} onChange={(event) => setSearchFilters((current) => ({ ...current, gender: event.target.value }))}>
              <option value="">全部</option>
              <option value="男">男</option>
              <option value="女">女</option>
            </select>
          </label>
          <button className="is-primary" onClick={() => void loadCloudStudents()} disabled={isLoadingDatabase}>{isLoadingDatabase ? "查询中..." : "查询"}</button>
          <button onClick={() => setSearchFilters(emptyFilters)}>重置</button>
        </div>
      </section>

      <Toolbar>
        <button className="is-primary" onClick={() => setShowImportModal(true)}>数据导入</button>
        <button onClick={() => void loadCloudStudents()} disabled={isLoadingDatabase}>{isLoadingDatabase ? "刷新中..." : "刷新"}</button>
        <button onClick={() => void loadDisabledStudents()} disabled={isLoadingDisabled}>
          {isLoadingDisabled ? "读取中..." : "查看已禁用记录"}
        </button>
        <button className="is-purple" onClick={exportCurrentYearDatabase}>导出当前名单</button>
        {canPerformSelectedAction("start_review") && (
          <button className="is-primary" disabled={isBulkActionPending} onClick={() => void handleSelectedAction("start_review")}>
            开始审核（{selectedRows.length}）
          </button>
        )}
        {canPerformSelectedAction("approve") && (
          <button className="is-success" disabled={isBulkActionPending} onClick={() => void handleSelectedAction("approve")}>
            审核通过（{selectedRows.length}）
          </button>
        )}
        {canPerformSelectedAction("reject") && (
          <button className="is-warning" disabled={isBulkActionPending} onClick={() => setShowRejectModal(true)}>
            审核退回（{selectedRows.length}）
          </button>
        )}
        {canPerformSelectedAction("report") && (
          <button className="is-success" disabled={isBulkActionPending} onClick={() => void handleSelectedAction("report")}>
            上报（{selectedRows.length}）
          </button>
        )}
        {selectedRows.length === 0 && <span className="difficulty-toolbar-hint">选择记录后显示当前状态可执行的学校端操作</span>}
        {selectedRows.length > 0
          && !canPerformSelectedAction("start_review")
          && !canPerformSelectedAction("approve")
          && !canPerformSelectedAction("reject")
          && !canPerformSelectedAction("report")
          && <span className="difficulty-toolbar-hint">所选记录状态不一致或当前状态不允许学校端操作</span>}
      </Toolbar>

      {actionMessage && <div className="difficulty-page-action-message">{actionMessage}</div>}

      <div className="bos-status-row">
        <span className="bos-status-badge">合并学生 {mergedRows.length}</span>
        <span className="bos-status-badge">本专科 {studentCount}</span>
        <span className="bos-status-badge">家庭成员 {familyCount}</span>
        <span className="bos-status-badge is-success">关联成功 {linkedCount}</span>
        <span className={`bos-status-badge${familyIssueCount ? " is-danger" : " is-success"}`}>匹配异常 {familyIssueCount}</span>
        <span className="bos-status-badge is-success">Supabase {isSupabaseConfigured ? "已配置" : "未配置"}</span>
      </div>

      <section className="bos-table-card">
        <div className="bos-table-card-head">
          <div>
            <h2>困难生申请档案数据库</h2>
            <span>严格按申请档案模板 40 列展示 · 横向滚动查看</span>
          </div>
          <span>显示 {filteredRows.length} / {mergedRows.length} 条</span>
        </div>
        <div className="bos-table-card-body">
          <div>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, ...styles.checkboxColumn }}>
                    <input
                      type="checkbox"
                      aria-label="选择当前全部数据"
                      checked={allVisibleSelected}
                      onChange={toggleAllRows}
                    />
                  </th>
                  {DIFFICULTY_STUDENT_TEMPLATE_FIELDS.map((field) => (
                    <th key={field} style={styles.th}>{field}</th>
                  ))}
                  <th style={styles.th}>状态</th>
                  <th style={styles.th}>退回原因</th>
                  <th style={styles.th}>学院修改说明</th>
                  <th style={styles.actionColumn}>操作与状态说明</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr><td style={styles.empty} colSpan={DIFFICULTY_STUDENT_TEMPLATE_FIELDS.length + 5}>{mergedRows.length === 0 ? "暂无当前学年已合并数据" : "没有符合筛选条件的数据"}</td></tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr
                      key={getMergedRowKey(row)}
                      className={selectedKeys.has(getMergedRowKey(row)) ? "difficulty-row-selected" : ""}
                    >
                      <td style={{ ...styles.td, ...styles.checkboxColumn }}>
                        <input
                          type="checkbox"
                          aria-label={`选择${row.name || "该学生"}`}
                          checked={selectedKeys.has(getMergedRowKey(row))}
                          onChange={() => toggleRow(row)}
                        />
                      </td>
                      {DIFFICULTY_STUDENT_TEMPLATE_FIELDS.map((field) => (
                        <td key={field} style={field === "姓名(*)" ? styles.nameCell : styles.td}>
                          {field === "姓名(*)" ? (
                            <button style={styles.linkButton} onClick={() => {
                              setSelectedRow(row);
                              setDetailTab("detail");
                            }}>
                              {getTemplateCell(row, field) || "查看详情"}
                            </button>
                          ) : (
                            getTemplateCell(row, field) || "-"
                          )}
                        </td>
                      ))}
                      <td style={styles.td}>{displayStatus(getWorkflowStatus(row))}</td>
                      <td style={styles.td}>{row.rejectedReason || "-"}</td>
                      <td style={styles.td}>{row.resubmissionRemark || "-"}</td>
                      <td style={styles.actionCell}>{renderRecordActions(row, "table")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="bos-table-card-foot">
          <span>第 1 页</span>
          <span>共 {filteredRows.length} 条 · Supabase 云端 {cloudStudents.length} 条</span>
        </div>
      </section>

      {showImportModal && (
        <Modal title="往年困难生数据导入" onClose={() => setShowImportModal(false)}>
          <div style={styles.sectionHead}>
            <div>
              <h2 style={styles.subTitle}>上传往年数据</h2>
              <p style={styles.description}>用于导入已有历史名单，例如 2024-2025 学年困难生名单。数据会按所选 academic_year 写入 students 表，不走学院端上载流程。</p>
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
          <div style={styles.modalFooter}>
            <button style={styles.secondaryButton} onClick={() => setShowImportModal(false)}>关闭</button>
            <button style={isImporting ? styles.disabledButton : styles.importButton} disabled={isImporting} onClick={importHistoricalData}>
              {isImporting ? "导入中..." : "开始导入"}
            </button>
          </div>
        </Modal>
      )}

      {showRejectModal && (
        <Modal title="退回选中记录" onClose={() => setShowRejectModal(false)}>
          <div style={styles.sectionHead}>
            <div>
              <h2 style={styles.subTitle}>填写退回原因</h2>
              <p style={styles.description}>请填写退回原因，学院端将看到此原因并可重新编辑后提交。</p>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={styles.yearSelectLabel}>
              退回原因 <span style={{ color: "#c2414d" }}>*</span>
              <textarea
                style={{ ...styles.yearSelect, height: 100, resize: "vertical" }}
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="请输入退回原因..."
              />
            </label>
          </div>
          <div style={styles.modalFooter}>
            <button style={styles.secondaryButton} onClick={() => setShowRejectModal(false)}>取消</button>
            <button style={isBulkActionPending ? styles.disabledButton : styles.importButton} disabled={isBulkActionPending} onClick={handleReject}>
              {isBulkActionPending ? "处理中..." : "确认退回"}
            </button>
          </div>
        </Modal>
      )}

      {selectedRow && (
        <Modal title={`${selectedRow.name || "困难生"}详情`} onClose={() => setSelectedRow(null)}>
          <div className="difficulty-detail-tabs" role="tablist" aria-label="困难生详情导航">
            <button
              className={detailTab === "detail" ? "is-active" : ""}
              onClick={() => setDetailTab("detail")}
            >
              学生详情
            </button>
            <button
              className={detailTab === "history" ? "is-active" : ""}
              onClick={() => setDetailTab("history")}
            >
              操作历史
            </button>
          </div>
          {detailTab === "detail" ? (
            <>
              <div style={styles.detailGrid}>
                <Detail label="当前状态" value={displayStatus(getWorkflowStatus(selectedRow))} />
                <Detail label="退回原因" value={selectedRow.rejectedReason || ""} />
                <Detail label="学院修改说明" value={selectedRow.resubmissionRemark || ""} />
                {DIFFICULTY_STUDENT_TEMPLATE_FIELDS.map((field) => (
                  <Detail key={field} label={field} value={getTemplateCell(selectedRow, field)} />
                ))}
              </div>
              <div className="difficulty-detail-actions">
                {renderRecordActions(selectedRow, "detail")}
              </div>
            </>
          ) : (
            <DifficultyOperationHistory
              key={String(selectedRow.cloudId || "")}
              recordId={selectedRow.cloudId}
            />
          )}
        </Modal>
      )}

      {showDisabledModal && (
        <Modal title={`${academicYear} 学年已禁用困难生记录`} onClose={() => setShowDisabledModal(false)}>
          <p style={styles.description}>仅学校管理员可见。恢复后记录将重新进入当前困难生数据库，原审核状态和操作历史保持不变。</p>
          <div className="difficulty-table-scroll">
            <table className="difficulty-wide-table">
              <thead><tr><th>姓名</th><th>学号</th><th>学院</th><th>原状态</th><th>禁用时间</th><th>操作</th></tr></thead>
              <tbody>
                {disabledStudents.length === 0 ? (
                  <tr><td colSpan={6} style={styles.empty}>当前学年没有已禁用困难生记录</td></tr>
                ) : disabledStudents.map((student) => (
                  <tr key={String(student.id)}>
                    <td>{student.name || "-"}</td>
                    <td>{student.student_id || "-"}</td>
                    <td>{student.college_name || "-"}</td>
                    <td>{displayStatus(String(student.status || "draft"))}</td>
                    <td>{student.deleted_at ? new Date(student.deleted_at).toLocaleString() : "-"}</td>
                    <td><button className="is-primary" onClick={() => void handleRestoreDisabledStudent(student)}>恢复</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
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

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="bos-modal-backdrop">
      <section className="bos-modal bos-modal--compact">
        <div className="bos-modal-header">
          <h2 style={styles.modalTitle}>{title}</h2>
          <button onClick={onClose}>关闭</button>
        </div>
        <div className="bos-modal-body">{children}</div>
      </section>
    </div>
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
  page: { height: "100%", minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) clamp(280px, 23vw, 340px)", gap: 10, overflow: "hidden" },
  mainColumn: { height: "100%", minWidth: 0, minHeight: 0, display: "grid", gridTemplateRows: "auto auto minmax(0, 1fr)", gap: 10, overflow: "hidden" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, padding: 12, border: "1px solid #d5dee9", borderRadius: 9, background: "#fff", boxShadow: "0 2px 10px rgba(15,35,64,0.05)" },
  headerActions: { display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" },
  eyebrow: { color: "#1e5aa8", fontSize: 11, fontWeight: 900, marginBottom: 4, letterSpacing: "0.04em" },
  title: { margin: 0, color: "#0f1f33", fontSize: 21 },
  description: { color: "#63738a", fontSize: 12, lineHeight: 1.55, margin: "6px 0 0" },
  yearSelectLabel: { display: "grid", gap: 5, color: "#40526a", fontSize: 12, fontWeight: 700 },
  yearSelect: { minWidth: 132, border: "1px solid #cfdbe7", borderRadius: 6, padding: "8px 10px", color: "#15304f", background: "#fff", fontSize: 13 },
  exportButton: { border: "none", borderRadius: 6, padding: "9px 12px", background: "#1e5aa8", color: "#fff", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" },
  secondaryButton: { border: "1px solid #cbd8e6", borderRadius: 6, padding: "9px 11px", background: "#fff", color: "#26364e", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" },
  importButton: { border: "none", borderRadius: 6, padding: "9px 12px", background: "#0b9b6f", color: "#fff", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" },
  disabledButton: { border: "none", borderRadius: 6, padding: "9px 12px", background: "#a6b4c5", color: "#fff", cursor: "not-allowed", fontWeight: 700, whiteSpace: "nowrap" },
  stats: { display: "grid", gridTemplateColumns: "repeat(5, minmax(115px, 1fr))", gap: 7 },
  stat: { height: 58, boxSizing: "border-box", background: "#fff", border: "1px solid #d7e1ed", borderLeft: "3px solid #1e5aa8", borderRadius: 7, padding: "8px 9px" },
  statLabel: { color: "#63738a", marginBottom: 3, fontSize: 10 },
  statValue: { fontSize: 18 },
  card: { minHeight: 0, background: "#fff", border: "1px solid #d5dee9", borderRadius: 9, padding: 12, overflow: "hidden", boxShadow: "0 2px 10px rgba(15,35,64,0.04)" },
  importCard: { display: "grid", gridTemplateRows: "auto auto auto auto minmax(0, 1fr)", gap: 6 },
  detailCard: { display: "flex", flexDirection: "column" },
  sectionHead: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 8 },
  subTitle: { margin: 0, color: "#172033", fontSize: 16 },
  sectionLabel: { margin: "2px 0 6px", color: "#334155", fontSize: 11, fontWeight: 900, letterSpacing: "0.05em" },
  badge: { padding: "5px 8px", borderRadius: 999, background: "#e8f4ff", color: "#0077d4", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" },
  importGrid: { display: "grid", gridTemplateColumns: "minmax(150px, 180px) minmax(260px, 1fr) auto", gap: 8, alignItems: "end", marginTop: 8 },
  filePicker: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  fileName: { color: "#63738a", fontSize: 13 },
  importStats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(105px, 1fr))", gap: 8 },
  yearHint: { color: "#40526a", fontSize: 12, fontWeight: 700 },
  importLogBox: { minHeight: 0, maxHeight: 220, overflowY: "auto", border: "1px solid #d7e1ed", borderRadius: 6, background: "#f8fbfe", padding: 8 },
  importLogItem: { color: "#52647b", fontSize: 12, lineHeight: 1.5, marginBottom: 5 },
  searchGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(120px, 1fr))", gap: 7, alignItems: "end", marginBottom: 8 },
  fieldLabel: { display: "grid", gap: 4, color: "#40526a", fontSize: 12, fontWeight: 700 },
  searchInput: { border: "1px solid #cfdbe7", borderRadius: 6, padding: "8px 9px", color: "#15304f", background: "#fff", fontSize: 13, minWidth: 0 },
  infoMessage: { marginBottom: 8, border: "1px solid #c6e2ff", background: "#f1f8ff", color: "#075f9e", borderRadius: 6, padding: "8px 10px", fontSize: 12, fontWeight: 700 },
  errorMessage: { marginBottom: 8, border: "1px solid #f4c7c7", background: "#fff4f4", color: "#b4232d", borderRadius: 6, padding: "8px 10px", fontSize: 12, fontWeight: 700 },
  tableWrap: { flex: 1, minHeight: 0, overflow: "auto", border: "1px solid #d7e1ed", borderRadius: 6 },
  table: { width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: 11 },
  th: { position: "sticky", top: 0, zIndex: 1, background: "#edf4fa", color: "#40526a", padding: "7px 8px", textAlign: "center", whiteSpace: "nowrap" },
  td: { borderTop: "1px solid #e3ebf3", padding: "7px 8px", color: "#52647b", textAlign: "center", whiteSpace: "nowrap" },
  nameCell: { borderTop: "1px solid #e3ebf3", padding: "7px 8px", textAlign: "center", whiteSpace: "nowrap" },
  actionColumn: { position: "sticky", top: 0, zIndex: 1, minWidth: 300, background: "#edf4fa", color: "#40526a", padding: "7px 8px", textAlign: "center", whiteSpace: "nowrap" },
  actionCell: { minWidth: 300, maxWidth: 360, borderTop: "1px solid #e3ebf3", padding: "7px 8px", color: "#52647b", textAlign: "left", whiteSpace: "normal" },
  linkButton: { border: "none", padding: 0, color: "#1e5aa8", background: "transparent", fontWeight: 800, textDecoration: "underline", cursor: "pointer" },
  checkboxColumn: { minWidth: 46, width: 46, position: "sticky", left: 0, zIndex: 4 },
  empty: { borderTop: "1px solid #e3ebf3", padding: 16, color: "#8190a4", textAlign: "center" },
  logPanel: { height: "100%", minHeight: 0, padding: 14, borderRadius: 9, background: "linear-gradient(180deg, #0b1c30 0%, #0a1426 100%)", border: "1px solid #1e3350", overflow: "hidden", display: "flex", flexDirection: "column", boxSizing: "border-box", boxShadow: "0 4px 18px rgba(8,20,40,0.16)" },
  logHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingBottom: 10, borderBottom: "1px solid rgba(148,163,184,0.2)" },
  logTitle: { color: "#e5efff", fontSize: 15, margin: 0 },
  liveBadge: { display: "inline-flex", alignItems: "center", gap: 5, color: "#9fdcc8", fontSize: 10, fontWeight: 800 },
  liveDot: { width: 7, height: 7, borderRadius: "50%", background: "#21d59c", boxShadow: "0 0 0 3px rgba(33,213,156,0.12)" },
  logBox: { flex: 1, minHeight: 0, overflowY: "auto", paddingTop: 10, color: "#dceafe", fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.55 },
  logItem: { paddingBottom: 8, marginBottom: 8, borderBottom: "1px solid rgba(148,163,184,0.1)", whiteSpace: "pre-wrap" },
  logMuted: { color: "#8fa3bf", paddingTop: 4 },
  modalBackdrop: { position: "fixed", inset: 0, zIndex: 9999, background: "rgba(11,28,48,0.58)", display: "grid", placeItems: "center", padding: 18, backdropFilter: "blur(2px)" },
  modal: { width: "min(900px, 94vw)", height: "78vh", minHeight: 430, background: "#fff", borderRadius: 10, border: "1px solid #cbd5e1", boxShadow: "0 28px 90px rgba(15,23,42,0.34)", display: "flex", flexDirection: "column", overflow: "hidden" },
  modalHeader: { flex: "0 0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: "1px solid #d7e1ed", background: "#f8fafc" },
  modalTitle: { margin: 0, color: "#172033", fontSize: 18 },
  modalBody: { flex: 1, minHeight: 0, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 },
  modalFooter: { position: "sticky", bottom: 0, zIndex: 2, flex: "0 0 auto", display: "flex", justifyContent: "flex-end", gap: 8, padding: "11px 0 0", borderTop: "1px solid #e2e8f0", background: "#fff" },
  closeButton: { border: "1px solid #cbd8e6", borderRadius: 6, padding: "7px 10px", background: "#fff", color: "#26364e", fontWeight: 800, cursor: "pointer" },
  detailGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 },
  detailItem: { display: "grid", gap: 5, padding: 10, border: "1px solid #d7e1ed", borderRadius: 7, background: "#f8fafc", color: "#63738a", fontSize: 12 },
};
