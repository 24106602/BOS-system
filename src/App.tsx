import React, { useEffect, useRef, useState } from "react";
// 主页面组件：负责功能区切换、上传按钮、状态管理、结果预览和日志展示。

import { getMergeBatches, saveMergeBatch } from "./db/localMergeDb";
import {
  getBatchAcademicYear,
  getCurrentAcademicYear,
  withAcademicYear,
} from "./utils/academicYear";
import DatabasePage from "./pages/DatabasePage";
import EnrolledStudentDatabasePage from "./pages/EnrolledStudentDatabasePage";
import MergePage from "./pages/MergePage";
import StudentProcessPage from "./pages/StudentProcessPage";
import FamilyProcessPage from "./pages/FamilyProcessPage";
import { exportFamilyExcel, processFamilyRows } from "./services/familyProcessor";
import { exportStudentExcel, processStudentRows } from "./services/studentProcessor";
import { syncCollegeStudentsToSupabase } from "./services/difficultyStudentService";
import { verifyEnrolledStudent, getEnrolledStudentCount } from "./db/localEnrolledStudentDb";

import {
  findHeaderRowIndex,
  parseFamilyTemplate,
  parseStudentTemplate,
  readWorkbook,
  validateDataAgainstTemplate,
  validateTemplateFile,
} from "./services/templateParser";
import {
  DIFFICULTY_STUDENT_TEMPLATE_FIELDS,
  DIFFICULTY_FAMILY_TEMPLATE_FIELDS,
  getDifficultyTemplateValue,
  getFamilyTemplateValue,
} from "./constants/difficultyStudentTemplate";
import { isSameSubmissionCollege, normalizeSubmissionCollegeName, resolveCollegeUpload } from "./utils/collegeDetector";
import type {
  DisqualifiedRow,
  DataTemplateValidationResult,
  ErrorReportItem,
  FamilyProcessingStats,
  FamilyReviewRow,
  HighlightInfo,
  LogItem,
  LogType,
  ProcessingStats,
  TemplateParseResult,
  TemplateValidationResult,
  WorkbookData,
} from "./services/types";

const initialStats: ProcessingStats = {
  total: 0,
  repaired: 0,
  errors: 0,
  missingFields: 0,
  removedFields: 0,
  highlighted: 0,
  disqualified: 0,
};

const initialFamilyStats: FamilyProcessingStats = {
  total: 0,
  repaired: 0,
  errors: 0,
  missingFields: 0,
  removedFields: 0,
  highlighted: 0,
  review: 0,
  databaseMiss: 0,
};

type CollegeValidationError = {
  row: number;
  column: string;
  field: string;
  value: string;
  reason: string;
  level: "error" | "warning";
};

const toCollegeValidationErrors = (items: ErrorReportItem[]): CollegeValidationError[] =>
  items
    .filter((item) => item.issueType !== "自动修复")
    .map((item) => {
    const reasonText = String(item.issueType || "");
    const actionText = String(item.action || "");
    const displayReason = ["人工核实", "标黄", "标红"].includes(reasonText)
      ? actionText || reasonText
      : reasonText || actionText;
    const hardError =
      reasonText.includes("错误") ||
      reasonText.includes("不通过") ||
      reasonText.includes("人工核实") ||
      actionText.includes("标红") ||
      actionText.includes("不通过");

    return {
      row: item.rowIndex,
      column: item.fieldName,
      field: item.fieldName,
      value: String(item.originalValue ?? ""),
      reason: displayReason || "数据异常",
      level: hardError ? "error" : "warning",
    };
    });

const isExcelFile = (file: File) => /\.(xlsx|xls)$/i.test(file.name);

const getWorkbookText = (workbookData: WorkbookData) =>
  workbookData.sheetNames
    .slice(0, 3)
    .flatMap((sheetName) => workbookData.sheets[sheetName] || [])
    .slice(0, 20)
    .flat()
    .map((item) => String(item ?? ""))
    .join(" ");

const looksLikeFamilyFile = (fileName: string, workbookData: WorkbookData) => {
  const text = `${fileName} ${getWorkbookText(workbookData)}`;
  return /家庭成员|成员信息|与学生关系|家庭成员姓名|工作或学习单位|健康状况|family/i.test(text);
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error || "未知错误");

const getWorkbookReadSummary = (workbookData: WorkbookData, sheetName: string) => {
  const rows = workbookData.sheets[sheetName] || [];
  return {
    sheetName,
    rowCount: rows.length,
    rows,
  };
};

const getExcelFileType = (file: File) => {
  const matched = file.name.match(/\.([^.]+)$/);
  return matched?.[1]?.toLowerCase() || "";
};

const rowHasVisibleValue = (row: unknown[]) =>
  row.some((cell) => String(cell ?? "").trim() !== "");

const getEffectiveDataRowCount = (rows: unknown[][], headerIndex: number) =>
  rows.slice(headerIndex + 1).filter(rowHasVisibleValue).length;

const formatRecognizedFields = (fields: string[]) => {
  const text = fields.filter(Boolean).slice(0, 12).join("、");
  return fields.length > 12 ? `${text} 等 ${fields.length} 个字段` : text || "未识别";
};

const normalizeCollegeHeader = (value: unknown) =>
  String(value ?? "")
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/（[^）]*）|\([^)]*\)/g, "")
    .replace(/[\s\u00a0\u200b-\u200d\u2060\ufeff\u3000]/g, "")
    .replace(/[*＊()（）:：]/g, "");

const isCollegeIdentityField = (field: unknown) => {
  const normalized = normalizeCollegeHeader(field);
  if (!normalized) return false;
  if (/推荐|认定|意见|结果|困难|档次|等级/.test(normalized)) return false;
  return /^(学院|学院名称|院系|院系名称|学部|学部名称|所属学院|所属院系|提交学院|提交单位)$/.test(normalized);
};

const detectCollegeFromTableRows = (rows: unknown[][], fields: string[]) => {
  if (rows.length === 0 || fields.length === 0) return "";
  const headerIndex = findHeaderRowIndex(rows, fields);
  const headers = (rows[headerIndex] || []).map((item) => String(item ?? "").trim());
  const collegeIndex = headers.findIndex(isCollegeIdentityField);
  if (collegeIndex < 0) return "";

  const matched = rows
    .slice(headerIndex + 1)
    .map((row) => String(row[collegeIndex] ?? "").trim())
    .find(Boolean);

  return matched || "";
};

type FamilyProcessRunInput = {
  parsed: TemplateParseResult;
  sourceRows: unknown[][];
  collegeName: string;
};

type AppProps = {
  collegeMode?: boolean;
  fixedProcessingPanel?: "student" | "family";
  onBackToDifficulty?: () => void;
  onViewDifficultyStudents?: () => void;
  layoutMarker?: string;
};

export default function App({ collegeMode = false, fixedProcessingPanel, onBackToDifficulty, onViewDifficultyStudents, layoutMarker }: AppProps) {
  const templateRef = useRef<HTMLInputElement>(null);
  const dataRef = useRef<HTMLInputElement>(null);
  const familyDataRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const familyLogEndRef = useRef<HTMLDivElement>(null);

  const [templateWorkbook, setTemplateWorkbook] = useState<WorkbookData | null>(null);
  const [studentTemplateParseResult, setStudentTemplateParseResult] = useState<TemplateParseResult | null>(null);
  const [studentTemplateInfo, setStudentTemplateInfo] = useState<TemplateValidationResult | null>(null);
  const [studentDataTemplateCheck, setStudentDataTemplateCheck] = useState<DataTemplateValidationResult | null>(null);
  const [templateOutputSheet, setTemplateOutputSheet] = useState("");
  const [templateDictSheet, setTemplateDictSheet] = useState("");
  const [templateFirstRow, setTemplateFirstRow] = useState<unknown[]>([]);
  const [, setTemplateSecondRow] = useState<unknown[]>([]);
  const [templateFields, setTemplateFields] = useState<string[]>([]);
  const [dictionaryMap, setDictionaryMap] = useState<Record<string, string[]>>({});
  const [fieldDictMap, setFieldDictMap] = useState<Record<string, string>>({});
  const [sourceRows, setSourceRows] = useState<unknown[][]>([]);
  const [studentCollegeName, setStudentCollegeName] = useState("未知学院");
  const [studentCollegeValidationError, setStudentCollegeValidationError] = useState("");
  const [processedData, setProcessedData] = useState<Record<string, unknown>[]>([]);
  const [studentErrorReports, setStudentErrorReports] = useState<ErrorReportItem[]>([]);
  const [highlightCellMap, setHighlightCellMap] = useState<Record<string, HighlightInfo>>({});
  const [disqualifiedRows, setDisqualifiedRows] = useState<DisqualifiedRow[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [status, setStatus] = useState("请上传数据");
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysis, setAnalysis] = useState<Record<string, number>>({});
  const [aiReport, setAiReport] = useState("");
  const [activeModule, setActiveModule] = useState<"processing" | "database" | "merge" | "enrolled">("processing");
  const [activeProcessingPanel, setActiveProcessingPanel] = useState<"student" | "family">(fixedProcessingPanel || "student");
  const [stats, setStats] = useState<ProcessingStats>(initialStats);

  const [familyTemplateWorkbook, setFamilyTemplateWorkbook] = useState<WorkbookData | null>(null);
  const [familyTemplateOutputSheet, setFamilyTemplateOutputSheet] = useState("");
  const [familyTemplateDictSheet, setFamilyTemplateDictSheet] = useState("");
  const [familyTemplateFirstRow, setFamilyTemplateFirstRow] = useState<unknown[]>([]);
  const [, setFamilyTemplateSecondRow] = useState<unknown[]>([]);
  const [familyTemplateFields, setFamilyTemplateFields] = useState<string[]>([]);
  const [familyDictionaryMap, setFamilyDictionaryMap] = useState<Record<string, string[]>>({});
  const [familyFieldDictMap, setFamilyFieldDictMap] = useState<Record<string, string>>({});
  const [familySourceRows, setFamilySourceRows] = useState<unknown[][]>([]);
  const [familyCollegeName, setFamilyCollegeName] = useState("未知学院");
  const [familyCollegeValidationError, setFamilyCollegeValidationError] = useState("");
  const [familyProcessedData, setFamilyProcessedData] = useState<Record<string, unknown>[]>([]);
  const [familyHighlightCellMap, setFamilyHighlightCellMap] = useState<Record<string, HighlightInfo>>({});
  const [familyReviewRows, setFamilyReviewRows] = useState<FamilyReviewRow[]>([]);
  const [familyLogs, setFamilyLogs] = useState<LogItem[]>([]);
  const [familyStatus, setFamilyStatus] = useState("等待上传 Excel");
  const [isFamilyProcessing, setIsFamilyProcessing] = useState(false);
  const [familyAutoProcessRequested, setFamilyAutoProcessRequested] = useState(false);
  const [familyAnalysis, setFamilyAnalysis] = useState<Record<string, number>>({});
  const [familyStats, setFamilyStats] = useState<FamilyProcessingStats>(initialFamilyStats);
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());
  const [studentReviewConfirmed, setStudentReviewConfirmed] = useState(false);
  const [familyReviewConfirmed, setFamilyReviewConfirmed] = useState(false);
  const [studentUploadedToSchool, setStudentUploadedToSchool] = useState(false);
  const [familyUploadedToSchool, setFamilyUploadedToSchool] = useState(false);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    familyLogEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [familyLogs]);

  useEffect(() => {
    const onSwitchPanel = (event: Event) => {
      if (fixedProcessingPanel) return;
      const panel = (event as CustomEvent<"student" | "family">).detail;
      if (panel === "student" || panel === "family") setActiveProcessingPanel(panel);
    };

    window.addEventListener("bos:switch-processing-panel", onSwitchPanel);
    return () => window.removeEventListener("bos:switch-processing-panel", onSwitchPanel);
  }, [fixedProcessingPanel]);

  useEffect(() => {
    if (!fixedProcessingPanel) return;

    const timer = window.setTimeout(() => {
      setActiveProcessingPanel(fixedProcessingPanel);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fixedProcessingPanel]);


  const pushLog = (type: LogType, message: string) => {
    setLogs((prev) => [...prev, { type, message, time: new Date().toLocaleTimeString() }]);
  };

  const pushFamilyLog = (type: LogType, message: string) => {
    setFamilyLogs((prev) => [...prev, { type, message, time: new Date().toLocaleTimeString() }]);
  };

  const resetStudentReviewState = (message = "重新处理数据后确认状态已重置") => {
    if (studentReviewConfirmed || studentUploadedToSchool) pushLog("info", message);
    setStudentReviewConfirmed(false);
    setStudentUploadedToSchool(false);
  };

  const resetFamilyReviewState = (message = "重新处理数据后确认状态已重置") => {
    if (familyReviewConfirmed || familyUploadedToSchool) pushFamilyLog("info", message);
    setFamilyReviewConfirmed(false);
    setFamilyUploadedToSchool(false);
  };

  const hasBlockingStudentUpload = () =>
    stats.errors > 0 ||
    disqualifiedRows.length > 0 ||
    studentErrorReports.some(
      (item) =>
        String(item.issueType || "").includes("标红") ||
        String(item.issueType || "").includes("错误") ||
        String(item.action || "").includes("不通过")
    );

  const hasBlockingFamilyUpload = () =>
    familyStats.errors > 0 ||
    familyReviewRows.length > 0;

  const addStudentResultToMergePool = async () => {
    if (processedData.length === 0) {
      alert("没有可上载的本专科处理结果");
      return;
    }

    if (hasBlockingStudentUpload()) {
      const message = "存在不通过数据，禁止上载学校端。";
      pushLog("error", message);
      alert(message);
      return;
    }

    if (!studentReviewConfirmed) {
      const message = "请先完成学院确认审核后再上载学校端。";
      pushLog("error", message);
      alert(message);
      return;
    }

    const collegeName = studentCollegeName.trim() || "未知学院";
    const existingBatches = await getMergeBatches();
    const possibleDuplicate = existingBatches.some(
      (item) =>
        item.collegeName === collegeName &&
        getBatchAcademicYear(item) === academicYear &&
        item.dataType === "student" &&
        item.rowCount === processedData.length
    );

    if (
      possibleDuplicate &&
      !confirm("检测到该学部（院）本专科信息可能已上载，是否仍然继续上载？")
    ) {
      return;
    }

    pushLog("info", `本次数据归属学年：${academicYear}；防重范围为当前学部（院）+ 当前学年。`);
    await saveMergeBatch({
      id: `student_${academicYear}_${encodeURIComponent(collegeName)}`,
      academic_year: academicYear,
      collegeName,
      dataType: "student",
      rowCount: processedData.length,
      createdAt: new Date().toISOString(),
      rows: withAcademicYear(processedData, academicYear),
    });

    const cloudResult = await syncCollegeStudentsToSupabase(processedData, academicYear, collegeName);
    if (cloudResult.configured && cloudResult.failed === 0) pushLog("success", cloudResult.message);
    else if (cloudResult.configured) pushLog("error", cloudResult.message);
    else pushLog("info", cloudResult.message);

    pushLog("success", `${collegeName} ${academicYear} 本专科信息已上载到学校端，共 ${processedData.length} 条`);
    setStudentUploadedToSchool(true);
    setStatus("已上载学校端");
    alert("已上载到学校端");
  };

  const addFamilyResultToMergePool = async () => {
    if (familyProcessedData.length === 0) {
      alert("没有可上载的家庭成员处理结果");
      return;
    }

    if (hasBlockingFamilyUpload()) {
      const message = "存在不通过数据，禁止上载学校端。";
      pushFamilyLog("error", message);
      alert(message);
      return;
    }

    if (!familyReviewConfirmed) {
      const message = "请先完成学院确认审核后再上载学校端。";
      pushFamilyLog("error", message);
      alert(message);
      return;
    }

    const collegeName = familyCollegeName.trim() || "未知学院";
    const existingBatches = await getMergeBatches();
    const possibleDuplicate = existingBatches.some(
      (item) =>
        item.collegeName === collegeName &&
        getBatchAcademicYear(item) === academicYear &&
        item.dataType === "family" &&
        item.rowCount === familyProcessedData.length
    );

    if (
      possibleDuplicate &&
      !confirm("检测到该学部（院）家庭成员信息可能已上载，是否仍然继续上载？")
    ) {
      return;
    }

    pushFamilyLog("info", `本次数据归属学年：${academicYear}；防重范围为当前学部（院）+ 当前学年。`);
    await saveMergeBatch({
      id: `family_${academicYear}_${encodeURIComponent(collegeName)}`,
      academic_year: academicYear,
      collegeName,
      dataType: "family",
      rowCount: familyProcessedData.length,
      createdAt: new Date().toISOString(),
      rows: withAcademicYear(familyProcessedData, academicYear),
    });

    pushFamilyLog("success", `${collegeName} ${academicYear} 家庭成员信息已上载到学校端，共 ${familyProcessedData.length} 条`);
    setFamilyUploadedToSchool(true);
    setFamilyStatus("已上载学校端");
    alert("家庭成员信息已上载到学校端");
  };

  const confirmStudentCollegeReview = () => {
    if (processedData.length === 0) {
      alert("请先完成本专科信息处理");
      return;
    }
    if (hasBlockingStudentUpload()) {
      const message = "有不通过数据，无法确认审核";
      pushLog("error", message);
      alert(message);
      return;
    }
    if (!confirm("确认本学院困难生数据已核对无误？确认后可上载学校端。")) return;
    setStudentReviewConfirmed(true);
    setStudentUploadedToSchool(false);
    setStatus("学院已确认");
    pushLog("success", "学院确认审核完成");
  };

  const confirmFamilyCollegeReview = () => {
    if (familyProcessedData.length === 0) {
      alert("请先完成家庭成员信息处理");
      return;
    }
    if (hasBlockingFamilyUpload()) {
      const message = "有不通过数据，无法确认审核";
      pushFamilyLog("error", message);
      alert(message);
      return;
    }
    if (!confirm("确认本学院困难生数据已核对无误？确认后可上载学校端。")) return;
    setFamilyReviewConfirmed(true);
    setFamilyUploadedToSchool(false);
    setFamilyStatus("学院已确认");
    pushFamilyLog("success", "学院确认审核完成");
  };

  const applyStudentTemplate = (parsed: TemplateParseResult) => {
    setStudentTemplateParseResult(parsed);
    setTemplateWorkbook(parsed.workbookData);
    setTemplateOutputSheet(parsed.outputSheet);
    setTemplateDictSheet(parsed.dictSheet);
    setTemplateFirstRow(parsed.firstRow);
    setTemplateSecondRow(parsed.secondRow);
    setTemplateFields(parsed.fields);
    setDictionaryMap(parsed.dictionaries);
    setFieldDictMap(parsed.fieldToDict);
  };

  const clearStudentGovernanceResults = () => {
    setProcessedData([]);
    setHighlightCellMap({});
    setDisqualifiedRows([]);
    setStudentErrorReports([]);
    setAnalysis({});
    setAiReport("");
    setStats(initialStats);
  };

  const clearStudentTemplateState = () => {
    setStudentTemplateParseResult(null);
    setTemplateWorkbook(null);
    setTemplateOutputSheet("");
    setTemplateDictSheet("");
    setTemplateFirstRow([]);
    setTemplateSecondRow([]);
    setTemplateFields([]);
    setDictionaryMap({});
    setFieldDictMap({});
  };

  const applyFamilyTemplate = (parsed: TemplateParseResult) => {
    setFamilyTemplateWorkbook(parsed.workbookData);
    setFamilyTemplateOutputSheet(parsed.outputSheet);
    setFamilyTemplateDictSheet(parsed.dictSheet);
    setFamilyTemplateFirstRow(parsed.firstRow);
    setFamilyTemplateSecondRow(parsed.secondRow);
    setFamilyTemplateFields(parsed.fields);
    setFamilyDictionaryMap(parsed.dictionaries);
    setFamilyFieldDictMap(parsed.fieldToDict);
  };

  const loadStudentTemplateFile = async (file: File) => {
    pushLog("info", `已选择模板表：${file.name}`);
    const fileType = getExcelFileType(file);
    pushLog("info", `文件类型：${fileType || "未知"}`);

    if (!isExcelFile(file)) {
      pushLog("error", "文件类型不支持");
      throw new Error("文件类型不支持：仅支持 .xls / .xlsx");
    }

    clearStudentTemplateState();
    clearStudentGovernanceResults();
    setStudentTemplateInfo(null);
    setStudentDataTemplateCheck(null);
    setSourceRows([]);
    setStatus("正在识别模板表");
    resetStudentReviewState("重新上传模板后确认状态已重置");

    let workbookData: WorkbookData;
    try {
      workbookData = await readWorkbook(file);
    } catch (error) {
      console.error("Student template parse exception:", error);
      throw new Error(`模板表解析异常：${getErrorMessage(error)}`, { cause: error });
    }

    const validation = validateTemplateFile(workbookData);
    setStudentTemplateInfo(validation);
    if (!validation.ok) throw new Error(validation.errors.join("\n"));

    const parsed = parseStudentTemplate(workbookData);
    applyStudentTemplate(parsed);
    setStatus("模板表已识别，等待上传数据表");
    pushLog(
      "success",
      `模板表识别成功：Sheet ${validation.sheetName}，表头第 ${validation.headerRowIndex + 1} 行，匹配字段 ${validation.matchedFieldCount} 个，核心字段 ${validation.coreMatchedCount} 个。`
    );
    validation.warnings.forEach((warning) => pushLog("info", warning));
  };

  const uploadStudentTemplateFile = async (file: File) => {
    try {
      setLogs([]);
      setIsProcessing(true);
      await loadStudentTemplateFile(file);
    } catch (error) {
      console.error("Student template load failed:", error);
      const message = getErrorMessage(error) || "模板表识别失败";
      setStatus("模板表识别失败");
      pushLog("error", message);
      alert(message);
    } finally {
      setIsProcessing(false);
      if (templateRef.current) templateRef.current.value = "";
    }
  };

  const loadStudentDataFile = async (file: File) => {
    pushLog("info", `已选择数据表：${file.name}`);
    const fileType = getExcelFileType(file);
    pushLog("info", `文件类型：${fileType || "未知"}`);

    if (!isExcelFile(file)) {
      pushLog("error", "文件类型不支持");
      throw new Error("文件类型不支持：仅支持 .xls / .xlsx");
    }

    clearStudentTemplateState();
    clearStudentGovernanceResults();
    setStudentTemplateInfo(null);
    setStudentDataTemplateCheck(null);
    setSourceRows([]);
    setStatus("正在读取 Excel");
    resetStudentReviewState("重新上传数据后确认状态已重置");

    let workbookData: WorkbookData;
    try {
      workbookData = await readWorkbook(file);
    } catch (error) {
      console.error("Student data parse exception:", error);
      throw new Error(`数据表解析异常：${getErrorMessage(error)}`, { cause: error });
    }

    if (workbookData.sheetNames.length === 0) {
      throw new Error("没有找到有效 Sheet");
    }

    const validation = validateTemplateFile(workbookData);
    setStudentTemplateInfo(validation);
    if (!validation.ok) throw new Error(validation.errors.join("\n"));

    const parsed = parseStudentTemplate(workbookData);
    applyStudentTemplate(parsed);

    const dataCheck = validateDataAgainstTemplate(workbookData, validation);
    setStudentDataTemplateCheck(dataCheck);
    if (!dataCheck.ok) {
      const detail = [
        ...dataCheck.errors,
        `识别字段：${dataCheck.dataFieldCount} 个`,
        dataCheck.missingCoreFields.length > 0
          ? `缺失核心字段：${dataCheck.missingCoreFields.join("、")}`
          : "缺失核心字段：无",
        "建议检查表头是否正确。",
      ];
      throw new Error(detail.join("\n"));
    }

    const collegeDetection = resolveCollegeUpload(file.name);
    setStudentCollegeName(collegeDetection.collegeName);
    setStudentCollegeValidationError("");
    if (collegeDetection.error) pushLog("error", `学院识别失败，但继续按行校验：${collegeDetection.error} 学院不匹配的数据将在治理结果中进入不通过名单。`);
    else pushLog("success", `所属学部（院）已识别：${collegeDetection.collegeName}（来源：${collegeDetection.source === "account" ? "当前账号" : "文件名"}）`);

    const { sheetName, rowCount, rows } = getWorkbookReadSummary(workbookData, dataCheck.sheetName);
    if (rowCount === 0) throw new Error("没有读取到数据行");
    const headerIndex = dataCheck.headerRowIndex;
    const effectiveDataRowCount = getEffectiveDataRowCount(rows, headerIndex);
    if (effectiveDataRowCount === 0) throw new Error("未读取到有效学生数据，请检查 Sheet、表头行和数据行。");
    const tableCollege = detectCollegeFromTableRows(rows, parsed.fields);

    setSourceRows(rows);
    setStatus("正在治理数据");
    pushLog("success", `读取到 Sheet：${sheetName}`);
    pushLog("success", `使用 Sheet：${sheetName}`);
    pushLog("success", `表头行：第 ${headerIndex + 1} 行`);
    pushLog("success", `识别到字段：${formatRecognizedFields(dataCheck.dataFields.map((field) => field.rawHeader))}`);
    dataCheck.warnings.forEach((warning) => pushLog("info", warning));
    pushLog("success", `原始数据行数：${rowCount}`);
    pushLog("success", `有效学生数据行数：${effectiveDataRowCount}`);
    pushLog("info", `当前登录学院：${collegeDetection.collegeName || "未知学院"}`);
    pushLog("info", `文件/表格识别学院：${tableCollege || (collegeDetection.source === "file" ? collegeDetection.collegeName : "未识别")}`);

    pushLog(
      "success",
      `本专科信息 Excel 已读取：${file.name}
数据表：${sheetName}
原始行数：${rowCount}
有效学生数据行数：${effectiveDataRowCount}
系统将自动执行数据治理。`
    );

    await processData();
  };

  const uploadData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      pushLog("error", "文件未选择");
      input.value = "";
      return;
    }

    await uploadStudentDataFile(file);
    input.value = "";
    if (dataRef.current) dataRef.current.value = "";
  };

  const uploadStudentDataFile = async (file: File) => {
    try {
      setIsProcessing(true);
      await loadStudentDataFile(file);
    } catch (error) {
      console.error("Student Excel load failed:", error);
      const message = getErrorMessage(error) || "数据表处理失败";
      setStatus("数据表处理失败");
      pushLog("error", message);
      alert(message);
    } finally {
      setIsProcessing(false);
      if (dataRef.current) dataRef.current.value = "";
    }
  };

const askDeepSeek = async (prompt: string) => {
  try {
    const DEEPSEEK_API_URL =
      import.meta.env.VITE_DEEPSEEK_API_URL || "http://localhost:3001/api/deepseek";

    const res = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const detail = data?.detail || data?.error || res.statusText || "DeepSeek 接口返回错误";
      throw new Error(String(detail));
    }

    return typeof data.text === "string" ? data.text : "";
  } catch (err) {
    console.error("DeepSeek request failed:", err);
    throw err;
  }
};

  const processData = async () => {
    const activeTemplateFields = templateFields;
    const activeTemplateFirstRow = templateFirstRow;
    const activeDictionaryMap = dictionaryMap;
    const activeFieldDictMap = fieldDictMap;
    const activeSourceRows = sourceRows;
    const activeCollegeName = studentCollegeName;

    if (isProcessing) {
      alert("治理任务执行中");
      return;
    }
    if (!studentTemplateInfo?.ok || !studentTemplateParseResult) {
      alert("数据未正确解析，请重新上传");
      return;
    }
    if (!studentDataTemplateCheck?.ok) {
      alert("数据格式校验未通过，请检查表头是否正确。");
      return;
    }
    if (activeTemplateFields.length === 0) {
      alert("字段列表为空，请重新上传");
      return;
    }
    if (activeSourceRows.length === 0) {
      alert("请先上传待处理数据");
      return;
    }
    try {
      setIsProcessing(true);
      setStatus("正在治理数据");
      setProcessedData([]);
      setHighlightCellMap({});
      setDisqualifiedRows([]);
      setAnalysis({});
      setAiReport("");
      resetStudentReviewState("重新处理数据后确认状态已重置");

      const result = await processStudentRows({
        templateFields: activeTemplateFields,
        templateFirstRow: activeTemplateFirstRow,
        dictionaryMap: activeDictionaryMap,
        fieldDictMap: activeFieldDictMap,
        sourceRows: activeSourceRows,
        collegeName: activeCollegeName,
        onLog: (item) => pushLog(item.type, item.message),
        onProgress: (nextStats, nextStatus) => {
          setStats(nextStats);
          setStatus(nextStatus);
        },
      });

      const collegeFieldIndex = activeTemplateFields.findIndex(isCollegeIdentityField);
      const collegeField = collegeFieldIndex >= 0 ? activeTemplateFields[collegeFieldIndex] : "";
      const currentCollege = normalizeSubmissionCollegeName(activeCollegeName);
      const nextHighlightCellMap = { ...result.highlightCellMap };
      const nextDisqualifiedRows = [...result.disqualifiedRows];
      const nextErrorReports = [...result.errorReports];
      const failedRowNumbers = new Set(nextDisqualifiedRows.map((row) => row.rowNumber));
      let collegeMismatchCount = 0;

      if (collegeFieldIndex < 0) {
        pushLog("info", "未检测到学院/学部/院系归属字段，已跳过逐行学院归属校验。");
      } else if (!currentCollege || currentCollege === "未知学院") {
        pushLog("error", "当前账号学院识别失败，系统已继续治理，所有数据需进入不通过名单核对。");
        result.processedData.forEach((row, index) => {
          collegeMismatchCount += 1;
          nextHighlightCellMap[`${index}_${collegeFieldIndex}`] = {
            color: "yellow",
            reason: "当前账号学院识别失败，无法确认该行是否属于本学院",
          };
          nextErrorReports.push({
            rowIndex: index + 1,
            fieldName: collegeField,
            originalValue: String(row[collegeField] ?? ""),
            fixedValue: String(row[collegeField] ?? ""),
            issueType: "学院识别失败",
            action: "整行进入不通过名单",
          });
          if (!failedRowNumbers.has(index + 1)) {
            failedRowNumbers.add(index + 1);
            nextDisqualifiedRows.push({
              rowNumber: index + 1,
              name: String(row[activeTemplateFields[0]] ?? ""),
              idCard: String(row[activeTemplateFields[2]] ?? ""),
              income: String(row[activeTemplateFields[11]] ?? ""),
              reason: "当前账号学院识别失败，无法确认该行是否属于本学院",
            });
          }
        });
      } else {
        result.processedData.forEach((row, index) => {
          const rowCollege = String(row[collegeField] ?? "").trim();
          if (!rowCollege || isSameSubmissionCollege(rowCollege, currentCollege)) return;

          collegeMismatchCount += 1;
          nextHighlightCellMap[`${index}_${collegeFieldIndex}`] = {
            color: "yellow",
            reason: `当前登录学院为 ${currentCollege}，该行学院为 ${rowCollege}`,
          };
          nextErrorReports.push({
            rowIndex: index + 1,
            fieldName: collegeField,
            originalValue: rowCollege,
            fixedValue: rowCollege,
            issueType: "学院不匹配",
            action: "整行进入不通过名单",
          });
          if (!failedRowNumbers.has(index + 1)) {
            failedRowNumbers.add(index + 1);
            nextDisqualifiedRows.push({
              rowNumber: index + 1,
              name: String(row[activeTemplateFields[0]] ?? ""),
              idCard: String(row[activeTemplateFields[2]] ?? ""),
              income: String(row[activeTemplateFields[11]] ?? ""),
              reason: `当前登录学院为 ${currentCollege}，该行学院为 ${rowCollege}`,
            });
          }
        });
      }

      if (collegeMismatchCount > 0) {
        pushLog("error", `检测到 ${collegeMismatchCount} 行学院与当前账号不一致，已进入不通过名单。`);
      }

      let enrolledMismatchCount = 0;
      const idCardFieldIndex = activeTemplateFields.findIndex((field) => /身份证|身份证件|证件/.test(field));
      const nameFieldIndex = activeTemplateFields.findIndex((field) => /姓名/.test(field));
      const studentIdFieldIndex = activeTemplateFields.findIndex((field) => /学号|学籍号/.test(field));

      if (idCardFieldIndex >= 0 || studentIdFieldIndex >= 0) {
        if (getEnrolledStudentCount() > 0) {
          result.processedData.forEach((row, index) => {
            if (failedRowNumbers.has(index + 1)) return;
            const studentId = studentIdFieldIndex >= 0 ? String(row[activeTemplateFields[studentIdFieldIndex]] ?? "").trim() : "";
            const idCard = idCardFieldIndex >= 0 ? String(row[activeTemplateFields[idCardFieldIndex]] ?? "").trim() : "";
            const name = nameFieldIndex >= 0 ? String(row[activeTemplateFields[nameFieldIndex]] ?? "").trim() : "";
            const verification = verifyEnrolledStudent(studentId, idCard, name);
            if (!verification.verified) {
              enrolledMismatchCount += 1;
              const highlightCol = idCardFieldIndex >= 0 ? idCardFieldIndex : 0;
              nextHighlightCellMap[`${index}_${highlightCol}`] = {
                color: "red",
                reason: verification.reason || "未在在校生数据库中找到",
              };
              nextErrorReports.push({
                rowIndex: index + 1,
                fieldName: idCardFieldIndex >= 0 ? activeTemplateFields[idCardFieldIndex] : activeTemplateFields[0],
                originalValue: idCard || studentId || "",
                fixedValue: idCard || studentId || "",
                issueType: "在校生校验失败",
                action: verification.reason || "未在在校生数据库中找到",
              });
              if (!failedRowNumbers.has(index + 1)) {
                failedRowNumbers.add(index + 1);
                nextDisqualifiedRows.push({
                  rowNumber: index + 1,
                  name: nameFieldIndex >= 0 ? String(row[activeTemplateFields[nameFieldIndex]] ?? "") : "",
                  idCard: idCard,
                  income: "",
                  reason: verification.reason || "未在在校生数据库中找到，请核对学号或身份证号+姓名",
                });
              }
            }
          });
          pushLog("info", `在校生校验：通过 ${result.processedData.length - enrolledMismatchCount} 人，未通过 ${enrolledMismatchCount} 人`);
        } else {
          pushLog("warning", "在校生数据库未配置，已跳过在校生校验");
        }
      }

      const finalFailRows = nextDisqualifiedRows;
      const repairLogs = nextErrorReports.filter((item) => item.issueType === "自动修复");
      const unresolvedIssueMap = new Map<string, (typeof nextErrorReports)[number]>();
      nextErrorReports.forEach((item) => {
        if (item.issueType === "自动修复" || item.action === "该学生所在行存在问题，详见不通过名单") return;
        const key = `${item.rowIndex}|${item.fieldName}|${item.action}`;
        if (!unresolvedIssueMap.has(key)) unresolvedIssueMap.set(key, item);
      });
      const unresolvedIssues = Array.from(unresolvedIssueMap.values());
      const unresolvedAnalysis = unresolvedIssues.reduce<Record<string, number>>((summary, item) => {
        summary[item.fieldName] = (summary[item.fieldName] || 0) + 1;
        return summary;
      }, {});
      const repairFieldCounts = repairLogs.reduce<Record<string, number>>((summary, item) => {
        summary[item.fieldName] = (summary[item.fieldName] || 0) + 1;
        return summary;
      }, {});
      const repairCategoryCounts = {
        "推荐档次引号/别名修复": 0,
        "日期修复": 0,
        "特殊困难类型标准化": 0,
        "残疾类别编码修复": 0,
      };
      repairLogs.forEach((item) => {
        const canonicalKey = resolveDifficultyFieldBinding(item.fieldName)?.canonicalKey;
        if (
          ["finalRecommendLevel", "collegeRecommendLevel", "schoolRecommendLevel"].includes(
            canonicalKey || ""
          ) && String(item.originalValue ?? "").trim()
        ) {
          repairCategoryCounts["推荐档次引号/别名修复"] += 1;
        } else if (canonicalKey === "applicationDate" || canonicalKey === "recognitionDate") {
          repairCategoryCounts["日期修复"] += 1;
        } else if (canonicalKey === "specialDifficultyType") {
          repairCategoryCounts["特殊困难类型标准化"] += 1;
        } else if (canonicalKey === "disabilityCategory") {
          repairCategoryCounts["残疾类别编码修复"] += 1;
        }
      });
      const repairCategorySummary = Object.entries(repairCategoryCounts)
        .map(([label, count]) => `${label}：${count}条`)
        .join("\n");
      const repairSummary = {
        count: repairLogs.length,
        fields: repairFieldCounts,
        categories: repairCategoryCounts,
        examples: repairLogs.slice(0, 12),
      };
      const nextStats = {
        ...result.stats,
        errors: unresolvedIssues.length,
        highlighted: Object.keys(nextHighlightCellMap).length,
        disqualified: finalFailRows.length,
      };

      setProcessedData(result.processedData);
      setHighlightCellMap(nextHighlightCellMap);
      setDisqualifiedRows(finalFailRows);
      setAnalysis(unresolvedAnalysis);
      setStudentErrorReports(nextErrorReports);
      setStats(nextStats);
      setStatus("治理完成");
      pushLog("success", `治理完成：通过 ${Math.max(nextStats.total - finalFailRows.length, 0)} 条，不通过 ${finalFailRows.length} 条，自动修复 ${nextStats.repaired} 项`);

      if (unresolvedIssues.length === 0) {
        setAiReport(`本次数据无人工处理问题，可导出通过名单并上载到学校端。

系统已自动完成格式治理，不影响上载。

自动修复数量：${repairSummary.count}
自动修复字段：${Object.keys(repairSummary.fields).join("、") || "无"}

自动修复摘要：
${repairCategorySummary}`);
      } else {
        try {
          const aiText = await askDeepSeek(`
请基于系统最终未通过问题生成困难生数据治理分析报告。只能分析“最终未通过问题”和“不通过名单摘要”，不要把自动修复日志当成未通过问题。

总数据行数：${nextStats.total}
最终未通过问题数量：${unresolvedIssues.length}
不通过人数：${finalFailRows.length}
缺失字段数量：${nextStats.missingFields}
删除模板外字段数量：${result.removedHeaders.length}

系统已自动修复摘要（只用于说明已完成的治理，不得视为未通过问题）：
${JSON.stringify(repairSummary, null, 2)}

硬性约束：
1. 困难等级只依据用户填写的推荐档次、院系推荐档次、学校推荐档次、院系认定结果或学校认定结果，不得根据家庭情况反推。
2. 如果推荐档次为 C.家庭经济特别困难 且特殊困难类型为无/空，这是系统明确发现的人工问题。
3. 如果推荐档次为 A.家庭经济一般困难 且特殊困难类型为无，不是问题。
4. 不得编造“该学生应该是特别困难/一般困难”的结论。
5. 不得根据收入、欠债、申请理由、院系意见、学校意见、突发事件、自然灾害、单亲、大病、残疾、父母劳动能力等内容重新判定困难等级。
6. 不得输出不存在的学院归属错误；只有最终未通过问题中明确出现学院识别失败或学院不匹配时，才能提学院归属问题。
7. 自动修复记录不能计入未通过问题，不能据此得出“全部未通过”或“数据质量为0分”等结论。
8. 不得把家庭地址写成邮政编码错误，也不得把邮政编码写成手机号码错误；字段名称必须以最终未通过问题为准。
9. 不得根据原始 Excel 自行推断、补充或编造系统未发现的新错误。
10. 不能根据字段名猜测其它字段错误；籍贯不得解释为身份证号或学号问题。
11. 情况类文本字段不得解释为金额、是/否、邮编、手机号或身份证错误。
12. 自动补齐推荐档次、空状态补“否”和其它自动规范化只能出现在已修复摘要中，不得写成未通过问题。
13. 如果最终未通过问题中没有某字段，不得在报告中声称该字段有问题。
14. 高频错误字段只能来自最终未通过问题的 fieldName，不得从修复摘要提取。

最终未通过问题：
${JSON.stringify(unresolvedIssues.slice(0, 80), null, 2)}

不通过名单摘要：
${JSON.stringify(finalFailRows.slice(0, 20), null, 2)}

请输出：
1. 本次数据主要问题
2. 高频错误字段
3. 学院整改建议
4. 数据质量评分
`);

          setAiReport(aiText || "DeepSeek 未返回分析内容，请检查接口。");
        } catch (error) {
          console.error("DeepSeek 智能分析失败:", error);
          pushLog("error", "DeepSeek 智能分析失败，请检查 Worker 地址或环境变量");
          setAiReport("DeepSeek 智能分析失败，请检查 Worker 地址或环境变量。");
        }
      }

      window.dispatchEvent(
        new CustomEvent("bos:college-upload-result", {
          detail: {
            errorCount: finalFailRows.length,
            totalCount: nextStats.total,
            fixedCount: nextStats.repaired,
            validationErrors: [
              ...toCollegeValidationErrors(unresolvedIssues),
              ...finalFailRows.map((item) => ({
                row: item.rowNumber,
                column: "整行",
                field: "不通过原因",
                value: item.name,
                reason: item.reason,
                level: "error" as const,
              })),
            ],
          },
        })
      );

      alert(`
困难生数据处理完成

输出数据行数：${result.stats.total}
自动修复：${result.stats.repaired}
异常问题：${nextStats.errors}
标记单元格：${nextStats.highlighted}
不通过人数：${nextStats.disqualified}
`);
    } catch (error) {
      console.error("Student processing failed:", error);
      const message = `困难生数据处理失败：${getErrorMessage(error)}`;
      pushLog("error", `processor 执行失败：${getErrorMessage(error)}`);
      pushLog("error", message);
      alert(message);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    const win = window as typeof window & {
      __bosHasBlockingErrors?: () => boolean;
      __bosSyncToSchool?: () => Promise<void>;
    };

    win.__bosHasBlockingErrors =
      activeProcessingPanel === "student" ? hasBlockingStudentUpload : hasBlockingFamilyUpload;
    win.__bosSyncToSchool = async () => {
      const hasBlockingErrors =
        activeProcessingPanel === "student" ? hasBlockingStudentUpload() : hasBlockingFamilyUpload();
      if (hasBlockingErrors) {
        const message = "上载失败，当前数据仍存在不通过项，请查看“不通过预览”";
        if (activeProcessingPanel === "student") {
          pushLog("error", message);
          setStatus(message);
        } else {
          pushFamilyLog("error", message);
          setFamilyStatus(message);
        }
        throw new Error(message);
      }
      if (activeProcessingPanel === "student") await addStudentResultToMergePool();
      else await addFamilyResultToMergePool();
    };

    return () => {
      delete win.__bosHasBlockingErrors;
      delete win.__bosSyncToSchool;
    };
  }, [
    activeProcessingPanel,
    stats.errors,
    disqualifiedRows,
    studentErrorReports,
    processedData,
    studentCollegeName,
    studentCollegeValidationError,
    familyStats.errors,
    familyReviewRows,
    familyProcessedData,
    familyCollegeName,
    familyCollegeValidationError,
    studentReviewConfirmed,
    familyReviewConfirmed,
  ]);

  const exportStudentList = (exportMode: "passed" | "failed") => {
    if (processedData.length === 0) {
      alert("没有可导出数据");
      return;
    }
    if (!templateWorkbook) {
      alert("模板不存在，无法按模板导出");
      return;
    }

    try {
      const result = exportStudentExcel({
        processedData,
        templateWorkbook,
        templateOutputSheet,
        templateDictSheet,
        templateFields,
        templateFirstRow,
        highlightCellMap,
        disqualifiedRows,
        collegeName: studentCollegeName,
        exportMode,
      });
      pushLog("success", `${exportMode === "passed" ? "通过名单" : "不通过名单"}导出成功，不通过人数：${result.failCount}`);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "导出失败，请检查模板是否存在。";
      pushLog("error", message);
      alert(message);
    }
  };

  const exportExcel = () => exportStudentList("passed");

  const exportStudentErrorReport = () => {
    if (disqualifiedRows.length === 0) {
      alert("暂无不通过名单");
      return;
    }
    exportStudentList("failed");
  };

  const loadFamilyDataFile = async (file: File) => {
    pushFamilyLog("info", `已选择文件：${file.name}`);
    const fileType = getExcelFileType(file);
    pushFamilyLog("info", `文件类型：${fileType || "未知"}`);

    if (!isExcelFile(file)) {
      pushFamilyLog("error", "文件类型不支持");
      throw new Error("文件类型不支持：仅支持 .xls / .xlsx");
    }

    pushFamilyLog("info", "开始读取 Excel");
    setFamilyAutoProcessRequested(false);
    setFamilyProcessedData([]);
    setFamilyHighlightCellMap({});
    setFamilyReviewRows([]);
    setFamilyAnalysis({});
    setFamilyStats(initialFamilyStats);
    setFamilyStatus("正在读取 Excel");
    resetFamilyReviewState("重新处理数据后确认状态已重置");

    let workbookData: WorkbookData;
    try {
      workbookData = await readWorkbook(file);
    } catch (error) {
      console.error("Family Excel parse exception:", error);
      throw new Error(`Excel 解析异常：${getErrorMessage(error)}`, { cause: error });
    }

    if (workbookData.sheetNames.length === 0) {
      throw new Error("没有找到有效 Sheet");
    }

    pushFamilyLog("info", `当前 workbook sheets：${workbookData.sheetNames.join("、")}`);

    let parsed: TemplateParseResult;
    try {
      parsed = parseFamilyTemplate(workbookData);
    } catch (error) {
      console.error("Family template parse failed:", error);
      throw new Error(getErrorMessage(error) || "未识别到表头", { cause: error });
    }

    if (!parsed.fields.some((field) => /家庭成员|学生身份证|关系|健康|职业|年收入/.test(field))) {
      throw new Error(looksLikeFamilyFile(file.name, workbookData) ? "没有找到表头" : "当前页面仅支持困难生家庭成员信息文件");
    }

    applyFamilyTemplate(parsed);

    const collegeDetection = resolveCollegeUpload(file.name);
    setFamilyCollegeName(collegeDetection.collegeName);
    setFamilyCollegeValidationError("");
    if (collegeDetection.error) pushFamilyLog("error", `学院识别失败，但继续按行校验：${collegeDetection.error} 后续按当前账号范围提交。`);
    else pushFamilyLog("success", `所属学部（院）已识别：${collegeDetection.collegeName}（来源：${collegeDetection.source === "account" ? "当前账号" : "文件名"}）`);

    const { sheetName, rowCount, rows } = getWorkbookReadSummary(workbookData, parsed.outputSheet);
    if (rowCount === 0) throw new Error("没有读取到数据行");
    const headerIndex = findHeaderRowIndex(rows, parsed.fields);
    const effectiveDataRowCount = getEffectiveDataRowCount(rows, headerIndex);
    if (effectiveDataRowCount === 0) throw new Error("未读取到有效学生数据，请检查 Sheet、表头行和数据行。");
    const tableCollege = detectCollegeFromTableRows(rows, parsed.fields);

    setFamilySourceRows(rows);
    setFamilyStatus("正在治理数据");
    pushFamilyLog("success", `读取到 Sheet：${sheetName}`);
    pushFamilyLog("success", `使用 Sheet：${sheetName}`);
    pushFamilyLog("success", `表头行：第 ${headerIndex + 1} 行`);
    pushFamilyLog("success", `识别到字段：${formatRecognizedFields(parsed.fields)}`);
    pushFamilyLog("success", `原始数据行数：${rowCount}`);
    pushFamilyLog("success", `有效学生数据行数：${effectiveDataRowCount}`);
    pushFamilyLog("info", `当前登录学院：${collegeDetection.collegeName || "未知学院"}`);
    pushFamilyLog("info", `文件/表格识别学院：${tableCollege || (collegeDetection.source === "file" ? collegeDetection.collegeName : "未识别")}`);

    pushFamilyLog(
      "success",
      `家庭成员信息 Excel 已读取：${file.name}
数据表：${sheetName}
原始行数：${rowCount}
有效学生数据行数：${effectiveDataRowCount}
系统将自动执行既有治理规则。`
    );
    return {
      parsed,
      sourceRows: rows,
      collegeName: collegeDetection.collegeName,
    };
  };

  const uploadFamilyData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      pushFamilyLog("error", "文件未选择");
      input.value = "";
      return;
    }

    await uploadFamilyDataFile(file);
    input.value = "";
    if (familyDataRef.current) familyDataRef.current.value = "";
  };

  const uploadFamilyDataFile = async (file: File) => {
    try {
      setFamilyLogs([]);
      setIsFamilyProcessing(true);
      const loaded = await loadFamilyDataFile(file);
      pushFamilyLog("info", "开始治理数据");
      await processFamilyData(loaded);
    } catch (error) {
      console.error("Family Excel load failed:", error);
      const message = getErrorMessage(error) || "家庭成员信息读取失败";
      setFamilyStatus("Excel 读取失败");
      pushFamilyLog("error", message);
      alert(message);
    } finally {
      setIsFamilyProcessing(false);
      if (familyDataRef.current) familyDataRef.current.value = "";
    }
  };

  const processFamilyData = async (override?: FamilyProcessRunInput) => {
    const activeFamilyTemplateFields = override?.parsed.fields || familyTemplateFields;
    const activeFamilyTemplateFirstRow = override?.parsed.firstRow || familyTemplateFirstRow;
    const activeFamilyDictionaryMap = override?.parsed.dictionaries || familyDictionaryMap;
    const activeFamilyFieldDictMap = override?.parsed.fieldToDict || familyFieldDictMap;
    const activeFamilySourceRows = override?.sourceRows || familySourceRows;
    const activeCollegeName = override?.collegeName || familyCollegeName;

    if (!override && isFamilyProcessing) {
      alert("家庭成员治理任务执行中");
      return;
    }
    if (activeFamilyTemplateFields.length === 0) {
      alert("请先上传家庭成员模板");
      return;
    }
    if (activeFamilySourceRows.length === 0) {
      alert("请先上传家庭成员数据");
      return;
    }
    try {
      setIsFamilyProcessing(true);
      setFamilyStatus("正在治理数据");
      setFamilyProcessedData([]);
      setFamilyHighlightCellMap({});
      setFamilyReviewRows([]);
      setFamilyAnalysis({});
      resetFamilyReviewState("重新处理数据后确认状态已重置");

      const result = await processFamilyRows({
        familyTemplateFields: activeFamilyTemplateFields,
        familyTemplateFirstRow: activeFamilyTemplateFirstRow,
        familyDictionaryMap: activeFamilyDictionaryMap,
        familyFieldDictMap: activeFamilyFieldDictMap,
        familySourceRows: activeFamilySourceRows,
        onLog: (item) => pushFamilyLog(item.type, item.message),
        onProgress: (nextStats, nextStatus) => {
          setFamilyStats(nextStats);
          setFamilyStatus(nextStatus);
        },
      });

      const currentCollege = normalizeSubmissionCollegeName(activeCollegeName);
      let nextFamilyReviewRows = result.familyReviewRows;
      const nextFamilyHighlightCellMap = { ...result.familyHighlightCellMap };

      const studentIdField =
        activeFamilyTemplateFields.find((field) => /学生.*身份证|身份证/.test(field)) || activeFamilyTemplateFields[2] || "学生身份证号";
      const memberNameField =
        activeFamilyTemplateFields.find((field) => /家庭成员.*姓名|成员姓名|姓名/.test(field)) || activeFamilyTemplateFields[3] || "家庭成员姓名";
      const relationField =
        activeFamilyTemplateFields.find((field) => /关系/.test(field)) || activeFamilyTemplateFields[5] || "与学生关系";

      const studentIdCards = new Set(processedData.map((row) => String(row["身份证号"] || row["学生身份证号"] || row["证件号码"] || "")));
      if (studentIdCards.size === 0) {
        pushFamilyLog("warning", "本专科信息中没有找到学生身份证号数据，请先导入本专科信息。");
      }

      const failedRowNumbers = new Set(nextFamilyReviewRows.map((row) => row.rowNumber));
      nextFamilyReviewRows = [...nextFamilyReviewRows];

      result.familyProcessedData.forEach((row, index) => {
        const studentIdCard = String(row[studentIdField] ?? "").trim();

        if (!studentIdCards.has(studentIdCard)) {
          nextFamilyHighlightCellMap[`${index}_0`] = {
            color: "red",
            reason: "学生身份证号在本专科信息中不存在",
          };
          if (!failedRowNumbers.has(index + 1)) {
            failedRowNumbers.add(index + 1);
            nextFamilyReviewRows.push({
              rowNumber: index + 1,
              studentId: studentIdCard,
              memberName: String(row[memberNameField] ?? ""),
              relation: String(row[relationField] ?? ""),
              reason: "学生身份证号在本专科信息中不存在，请先导入本专科信息",
            });
          }
        }
      });

      if (!currentCollege || currentCollege === "未知学院") {
        pushFamilyLog("error", "当前账号学院识别失败，系统已继续治理，家庭成员数据需进入不通过名单核对。");
        result.familyProcessedData.forEach((row, index) => {
          const studentIdCard = String(row[studentIdField] ?? "").trim();
          if (studentIdCards.has(studentIdCard)) {
            nextFamilyHighlightCellMap[`${index}_0`] = {
              color: "yellow",
              reason: "当前账号学院识别失败，无法确认该行是否属于本学院",
            };
            if (!failedRowNumbers.has(index + 1)) {
              failedRowNumbers.add(index + 1);
              nextFamilyReviewRows.push({
                rowNumber: index + 1,
                studentId: studentIdCard,
                memberName: String(row[memberNameField] ?? ""),
                relation: String(row[relationField] ?? ""),
                reason: "当前账号学院识别失败，无法确认该行是否属于本学院",
              });
            }
          }
        });
      }

      const nextFamilyStats = {
        ...result.familyStats,
        errors: result.familyStats.errors + Math.max(nextFamilyReviewRows.length - result.familyReviewRows.length, 0),
        highlighted: Object.keys(nextFamilyHighlightCellMap).length,
        review: nextFamilyReviewRows.length,
      };

      setFamilyProcessedData(result.familyProcessedData);
      setFamilyHighlightCellMap(nextFamilyHighlightCellMap);
      setFamilyReviewRows(nextFamilyReviewRows);
      setFamilyAnalysis(result.familyAnalysis);
      setFamilyStats(nextFamilyStats);
      setFamilyStatus("家庭成员治理完成");
      pushFamilyLog("success", `治理完成：通过 ${Math.max(nextFamilyStats.total - nextFamilyReviewRows.length, 0)} 条，不通过 ${nextFamilyReviewRows.length} 条，自动修复 ${nextFamilyStats.repaired} 项`);

      window.dispatchEvent(
        new CustomEvent("bos:college-upload-result", {
          detail: {
            errorCount: nextFamilyStats.review,
            totalCount: nextFamilyStats.total,
            fixedCount: nextFamilyStats.repaired,
            validationErrors: nextFamilyReviewRows.map((item) => ({
              row: item.rowNumber,
              column: "家庭成员信息",
              field: "家庭成员信息",
              value: item.studentId,
              reason: item.reason,
              level: "error",
            })),
          },
        })
      );

      alert(`
家庭成员信息处理完成

输出数据行数：${result.familyStats.total}
自动修复：${nextFamilyStats.repaired}
异常问题：${nextFamilyStats.errors}
标记单元格：${nextFamilyStats.highlighted}
待复核行数：${nextFamilyStats.review}
数据库未命中：${nextFamilyStats.databaseMiss}
`);
    } catch (error) {
      console.error("Family processing failed:", error);
      const message = `家庭成员信息处理失败：${getErrorMessage(error)}`;
      pushFamilyLog("error", `processor 执行失败：${getErrorMessage(error)}`);
      pushFamilyLog("error", message);
      alert(message);
    } finally {
      setIsFamilyProcessing(false);
    }
  };

  useEffect(() => {
    if (!familyAutoProcessRequested) return;
    if (isFamilyProcessing || familyTemplateFields.length === 0 || familySourceRows.length === 0) return;

    const timer = window.setTimeout(() => {
      setFamilyAutoProcessRequested(false);
      void processFamilyData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [familyAutoProcessRequested, isFamilyProcessing, familyTemplateFields.length, familySourceRows.length]);

  const exportFamilyList = (exportMode: "passed" | "failed") => {
    if (familyProcessedData.length === 0) {
      alert("没有可导出的家庭成员处理结果");
      return;
    }
    if (!familyTemplateWorkbook) {
      alert("家庭成员模板不存在，无法按模板导出");
      return;
    }

    try {
      const result = exportFamilyExcel({
        familyProcessedData,
        familyTemplateWorkbook,
        familyTemplateOutputSheet,
        familyTemplateDictSheet,
        familyTemplateFields,
        familyTemplateFirstRow,
        familyHighlightCellMap,
        familyReviewRows,
        familyCollegeName,
        exportMode,
      });
      pushFamilyLog("success", `${exportMode === "passed" ? "通过名单" : "不通过名单"}导出成功，不通过行数：${result.reviewCount}`);
    } catch (error) {
      console.error(error);
      alert("家庭成员结果导出失败，请检查模板是否存在。");
    }
  };

  const exportFamilyResult = () => exportFamilyList("passed");
  const exportFamilyErrorReport = () => {
    if (familyReviewRows.length === 0) {
      alert("暂无家庭成员不通过名单");
      return;
    }
    exportFamilyList("failed");
  };

  const renderTable = (
    data: Record<string, unknown>[] | DisqualifiedRow[] | FamilyReviewRow[],
    dataType: "student" | "family" = "student",
    academicYearValue?: string,
    collegeNameValue?: string
  ) => {
    const templateFields = dataType === "student" ? DIFFICULTY_STUDENT_TEMPLATE_FIELDS : DIFFICULTY_FAMILY_TEMPLATE_FIELDS;
    const extraColumns = ["学年", "学院"];
    const columns = [...extraColumns, ...templateFields];

    return (
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col} style={styles.th}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={styles.empty}>暂无数据</td>
              </tr>
            ) : (
              data.slice(0, 30).map((row, index) => {
                const rowData = row as Record<string, unknown>;
                return (
                  <tr key={index}>
                    <td style={styles.td}>{rowData["学年"] || rowData["academic_year"] || academicYearValue || academicYear || "-"}</td>
                    <td style={styles.td}>{rowData["学院"] || rowData["college_name"] || rowData["_college"] || collegeNameValue || "-"}</td>
                    {templateFields.map((field) => {
                      const value = dataType === "student"
                        ? getDifficultyTemplateValue(rowData, field)
                        : getFamilyTemplateValue(rowData, field);
                      return <td key={field} style={styles.td}>{value || "-"}</td>;
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={collegeMode ? { ...styles.page, ...styles.embeddedPage } : styles.page}>
      <div style={collegeMode ? { ...styles.moduleBar, ...styles.embeddedModuleBar } : styles.moduleBar}>
        <div style={styles.moduleTitle}>数据治理系统</div>

        <button
          onClick={() => setActiveModule("processing")}
          style={activeModule === "processing" ? styles.activeModule : styles.inactiveModule}
        >
          困难生数据处理
        </button>

        {!collegeMode && (
          <>
            <button
              onClick={() => setActiveModule("database")}
              style={activeModule === "database" ? styles.activeModule : styles.inactiveModule}
            >
              困难生数据库
            </button>

            <button
              onClick={() => setActiveModule("enrolled")}
              style={activeModule === "enrolled" ? styles.activeModule : styles.inactiveModule}
            >
              在校生数据库
            </button>

            <button
              onClick={() => setActiveModule("merge")}
              style={activeModule === "merge" ? styles.activeModule : styles.inactiveModule}
            >
              全校数据汇总
            </button>

            <button style={styles.disabledModule}>后续功能板块预留</button>
          </>
        )}
      </div>

      {activeModule === "database" && <DatabasePage />}

      {activeModule === "enrolled" && <EnrolledStudentDatabasePage />}

      {activeModule === "merge" && <MergePage />}

      {activeModule === "processing" && (
        <div className={collegeMode ? "bos-processing-frame" : undefined} style={collegeMode ? undefined : styles.processingWorkspace}>
          {!fixedProcessingPanel && (
            <div style={styles.subModuleBar}>
              <button
                onClick={() => setActiveProcessingPanel("student")}
                style={activeProcessingPanel === "student" ? styles.activeSubModule : styles.inactiveSubModule}
              >
                本专科困难生信息处理
              </button>
              <button
                onClick={() => setActiveProcessingPanel("family")}
                style={activeProcessingPanel === "family" ? styles.activeSubModule : styles.inactiveSubModule}
              >
                家庭成员信息处理
              </button>
            </div>
          )}

          {activeProcessingPanel === "student" ? (
            <StudentProcessPage
              dataRef={dataRef}
              uploadData={uploadData}
              uploadDataFile={uploadStudentDataFile}
              startProcessing={processData}
              templateInfo={studentTemplateInfo}
              dataTemplateCheck={studentDataTemplateCheck}
              isProcessing={isProcessing}
              exportExcel={exportExcel}
              exportStudentErrorReport={exportStudentErrorReport}
              addStudentResultToMergePool={addStudentResultToMergePool}
              confirmCollegeReview={confirmStudentCollegeReview}
              reviewConfirmed={studentReviewConfirmed}
              uploadedToSchool={studentUploadedToSchool}
              onViewDifficultyStudents={onViewDifficultyStudents}
              hideSubmitAction={false}
              status={status}
              academicYear={academicYear}
              onAcademicYearChange={setAcademicYear}
              studentCollegeName={studentCollegeName}
              stats={stats}
              renderTable={renderTable}
              processedData={processedData}
              disqualifiedRows={disqualifiedRows}
              logs={logs}
              logEndRef={logEndRef}
              onBackToDifficulty={onBackToDifficulty}
            />
          ) : (
            <FamilyProcessPage
              familyDataRef={familyDataRef}
              uploadFamilyData={uploadFamilyData}
              uploadFamilyDataFile={uploadFamilyDataFile}
              isFamilyProcessing={isFamilyProcessing}
              exportFamilyResult={exportFamilyResult}
              exportFamilyErrorReport={exportFamilyErrorReport}
              addFamilyResultToMergePool={addFamilyResultToMergePool}
              confirmCollegeReview={confirmFamilyCollegeReview}
              reviewConfirmed={familyReviewConfirmed}
              uploadedToSchool={familyUploadedToSchool}
              onViewDifficultyStudents={onViewDifficultyStudents}
              hideSubmitAction={false}
              familyStatus={familyStatus}
              academicYear={academicYear}
              onAcademicYearChange={setAcademicYear}
              familyCollegeName={familyCollegeName}
              familyStats={familyStats}
              renderTable={renderTable}
              familyProcessedData={familyProcessedData}
              familyReviewRows={familyReviewRows}
              familyAnalysis={familyAnalysis}
              familyLogs={familyLogs}
              familyLogEndRef={familyLogEndRef}
              onBackToDifficulty={onBackToDifficulty}
            />
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    height: "100vh",
    background: "#eef3f8",
    padding: 0,
    boxSizing: "border-box",
    overflow: "hidden",
    fontFamily: "Microsoft YaHei, Segoe UI, Arial, sans-serif",
  },
  embeddedPage: {
    height: "100%",
    minHeight: 0,
    background: "transparent",
    overflow: "hidden",
  },
  embeddedModuleBar: {
    display: "none",
  },
  moduleBar: {
    minHeight: 58,
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    padding: "0 16px",
    background: "#ffffff",
    borderBottom: "1px solid #d7e1ed",
    position: "sticky",
    top: 0,
    zIndex: 20,
  },
  moduleTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: "#172033",
    marginRight: 8,
  },
  activeModule: {
    background: "#0077d4",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "9px 13px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  inactiveModule: {
    background: "#ffffff",
    color: "#44536a",
    border: "1px solid #d7e1ed",
    borderRadius: 6,
    padding: "9px 13px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  disabledModule: {
    background: "#eef3f8",
    color: "#64748b",
    border: "none",
    borderRadius: 6,
    padding: "9px 13px",
    fontSize: 13,
    cursor: "not-allowed",
  },
  processingWorkspace: {
    height: "calc(100% - 70px)",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    padding: "0 0 4px",
    overflow: "hidden",
  },
  embeddedProcessingWorkspace: {
    height: "100%",
    padding: 0,
    overflow: "hidden",
  },
  academicYearBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    marginBottom: 10,
    padding: "12px 14px",
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    background: "#fff",
    boxShadow: "0 4px 14px rgba(15,35,64,0.05)",
    flexShrink: 0,
  },
  academicYearLabel: {
    color: "#172033",
    fontSize: 15,
    fontWeight: 800,
  },
  academicYearTip: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 12,
  },
  academicYearSelectLabel: {
    display: "grid",
    gap: 5,
    color: "#40526a",
    fontSize: 12,
    fontWeight: 700,
  },
  academicYearSelect: {
    minWidth: 132,
    border: "1px solid #cfdbe7",
    borderRadius: 6,
    padding: "8px 10px",
    color: "#15304f",
    background: "#fff",
    fontSize: 13,
  },
  subModuleBar: {
    display: "flex",
    gap: 6,
    marginBottom: 10,
    flexWrap: "wrap",
    flexShrink: 0,
  },
  activeSubModule: {
    background: "#0077d4",
    color: "#ffffff",
    border: "none",
    borderRadius: 6,
    padding: "9px 12px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  inactiveSubModule: {
    background: "#ffffff",
    color: "#334155",
    border: "1px solid #d7e1ed",
    borderRadius: 6,
    padding: "9px 12px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 34%)",
    gap: 12,
    minHeight: 0,
    flex: 1,
  },
  familyLayout: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 34%)",
    gap: 12,
    minHeight: 0,
    flex: 1,
  },
  databaseLayout: {
    height: "calc(100% - 70px)",
    overflowY: "auto",
  },
  databasePanel: {
    background: "#ffffff",
    borderRadius: 8,
    padding: 18,
    maxWidth: 1180,
    margin: "0 auto",
    border: "1px solid #d7e1ed",
    boxShadow: "0 4px 14px rgba(15,35,64,0.05)",
  },
  leftPanel: {
    background: "#ffffff",
    borderRadius: 8,
    padding: 18,
    overflowY: "auto",
    border: "1px solid #d7e1ed",
    boxShadow: "0 4px 14px rgba(15,35,64,0.05)",
  },
  rightPanel: {
    background: "#0b1428",
    borderRadius: 8,
    padding: 16,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  familyMainPanel: {
    background: "#ffffff",
    borderRadius: 8,
    padding: 18,
    overflowY: "auto",
    border: "1px solid #d7e1ed",
    boxShadow: "0 4px 14px rgba(15,35,64,0.05)",
  },
  familySidePanel: {
    background: "#0b1428",
    borderRadius: 8,
    padding: 16,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  windowHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    margin: 0,
    color: "#172033",
  },
  windowBadge: {
    background: "#e8f4ff",
    color: "#0077d4",
    borderRadius: 999,
    padding: "6px 9px",
    fontSize: 12,
    fontWeight: 700,
  },
  buttonGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 8,
    marginBottom: 12,
  },
  blueButton: button("#0077d4"),
  greenButton: button("#0b9b6f"),
  orangeButton: button("#d78a14"),
  purpleButton: button("#6757c8"),
  mergeButton: button("#006fc3"),
  status: {
    background: "#f3f9ff",
    color: "#0875bd",
    border: "1px solid #cce3f8",
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    fontSize: 13,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))",
    gap: 8,
    marginBottom: 14,
  },
  statCard: {
    background: "#f8fbfe",
    borderRadius: 6,
    padding: 12,
    textAlign: "center",
    border: "1px solid #dbe5ef",
  },
  section: {
    background: "#f8fbfe",
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
    border: "1px solid #dbe5ef",
  },
  empty: {
    color: "#64748b",
    padding: 12,
  },
  tableWrap: {
    flex: 1,
    minHeight: 0,
    height: "auto",
    overflow: "auto",
    border: "1px solid #d7e1ed",
    borderRadius: 6,
    background: "#fff",
  },
  table: {
    borderCollapse: "collapse",
    minWidth: "100%",
    fontSize: 13,
  },
  th: {
    border: "1px solid #cbd5e1",
    padding: "8px 10px",
    background: "#edf4fa",
    textAlign: "center",
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    zIndex: 1,
  },
  td: {
    border: "1px solid #cbd5e1",
    padding: "8px 10px",
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  problemItem: {
    background: "#fff1f2",
    color: "#b42336",
    padding: 10,
    borderRadius: 6,
    marginBottom: 8,
  },
  logTitle: {
    color: "#e5efff",
    fontSize: 18,
    margin: "0 0 12px 0",
  },
  logBox: {
    maxHeight: 320,
    overflowY: "auto",
    fontFamily: "Consolas, monospace",
    fontSize: 13,
    lineHeight: 1.6,
  },
  logItem: {
    whiteSpace: "pre-line",
    marginBottom: 10,
  },
};

function button(background: string): React.CSSProperties {
  return {
    background,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  };
}
