import React, { useEffect, useRef, useState } from "react";
// 主页面组件：负责功能区切换、上传按钮、状态管理、结果预览和日志展示。

import { getMergeBatches, saveMergeBatch } from "./db/localMergeDb";
import {
  ACADEMIC_YEAR_OPTIONS,
  getBatchAcademicYear,
  getCurrentAcademicYear,
  withAcademicYear,
} from "./utils/academicYear";
import DatabasePage from "./pages/DatabasePage";
import MergePage from "./pages/MergePage";
import StudentProcessPage from "./pages/StudentProcessPage";
import FamilyProcessPage from "./pages/FamilyProcessPage";
import { exportFamilyExcel, processFamilyRows } from "./services/familyProcessor";
import { exportStudentExcel, processStudentRows } from "./services/studentProcessor";
import { syncCollegeStudentsToSupabase } from "./services/difficultyStudentService";

import {
  findHeaderRowIndex,
  parseFamilyTemplate,
  parseStudentTemplate,
  readWorkbook,
} from "./services/templateParser";
import { isSameSubmissionCollege, normalizeSubmissionCollegeName, resolveCollegeUpload } from "./utils/collegeDetector";
import type {
  DisqualifiedRow,
  ErrorReportItem,
  FamilyProcessingStats,
  FamilyReviewRow,
  HighlightInfo,
  LogItem,
  LogType,
  ProcessingStats,
  TemplateParseResult,
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
    const hardError =
      reasonText.includes("错误") ||
      reasonText.includes("不通过") ||
      actionText.includes("标红") ||
      actionText.includes("不通过");

    return {
      row: item.rowIndex,
      column: item.fieldName,
      field: item.fieldName,
      value: String(item.originalValue ?? ""),
      reason: reasonText || actionText || "数据异常",
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

const detectCollegeFromTableRows = (rows: unknown[][], fields: string[]) => {
  if (rows.length === 0 || fields.length === 0) return "";
  const headerIndex = findHeaderRowIndex(rows, fields);
  const headers = (rows[headerIndex] || []).map((item) => String(item ?? "").trim());
  const collegeIndex = headers.findIndex((header) => /学院|学部|院系|学院名称|院系名称|提交单位/.test(header));
  if (collegeIndex < 0) return "";

  const matched = rows
    .slice(headerIndex + 1)
    .map((row) => String(row[collegeIndex] ?? "").trim())
    .find(Boolean);

  return matched || "";
};

type StudentProcessRunInput = {
  parsed: TemplateParseResult;
  sourceRows: unknown[][];
  collegeName: string;
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
};

export default function App({ collegeMode = false, fixedProcessingPanel, onBackToDifficulty, onViewDifficultyStudents }: AppProps) {
  const dataRef = useRef<HTMLInputElement>(null);
  const familyDataRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const familyLogEndRef = useRef<HTMLDivElement>(null);

  const [templateWorkbook, setTemplateWorkbook] = useState<WorkbookData | null>(null);
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
  const [status, setStatus] = useState("等待上传 Excel");
  const [isProcessing, setIsProcessing] = useState(false);
  const [studentAutoProcessRequested, setStudentAutoProcessRequested] = useState(false);
  const [analysis, setAnalysis] = useState<Record<string, number>>({});
  const [aiReport, setAiReport] = useState("");
  const [activeModule, setActiveModule] = useState<"processing" | "database" | "merge">("processing");
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
    setTemplateWorkbook(parsed.workbookData);
    setTemplateOutputSheet(parsed.outputSheet);
    setTemplateDictSheet(parsed.dictSheet);
    setTemplateFirstRow(parsed.firstRow);
    setTemplateSecondRow(parsed.secondRow);
    setTemplateFields(parsed.fields);
    setDictionaryMap(parsed.dictionaries);
    setFieldDictMap(parsed.fieldToDict);
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

  const loadStudentDataFile = async (file: File) => {
    pushLog("info", `已选择文件：${file.name}`);
    const fileType = getExcelFileType(file);
    pushLog("info", `文件类型：${fileType || "未知"}`);

    if (!isExcelFile(file)) {
      pushLog("error", "文件类型不支持");
      throw new Error("文件类型不支持：仅支持 .xls / .xlsx");
    }

    pushLog("info", "开始读取 Excel");
    setStudentAutoProcessRequested(false);
    setProcessedData([]);
    setHighlightCellMap({});
    setDisqualifiedRows([]);
    setStudentErrorReports([]);
    setAnalysis({});
    setAiReport("");
    setStats(initialStats);
    setStatus("正在读取 Excel");
    resetStudentReviewState("重新处理数据后确认状态已重置");

    let workbookData: WorkbookData;
    try {
      workbookData = await readWorkbook(file);
    } catch (error) {
      console.error("Student Excel parse exception:", error);
      throw new Error(`Excel 解析异常：${getErrorMessage(error)}`, { cause: error });
    }

    if (workbookData.sheetNames.length === 0) {
      throw new Error("没有找到有效 Sheet");
    }

    pushLog("info", `当前 workbook sheets：${workbookData.sheetNames.join("、")}`);

    let parsed: TemplateParseResult;
    try {
      parsed = parseStudentTemplate(workbookData);
    } catch (error) {
      console.error("Student template parse failed:", error);
      throw new Error(getErrorMessage(error) || "未识别到表头", { cause: error });
    }

    if (!parsed.fields.some((field) => /姓名|身份证|困难|收入|陈述理由/.test(field))) {
      throw new Error(looksLikeFamilyFile(file.name, workbookData) ? "当前页面仅支持困难生本专科信息文件" : "没有找到表头");
    }

    applyStudentTemplate(parsed);

    const collegeDetection = resolveCollegeUpload(file.name);
    setStudentCollegeName(collegeDetection.collegeName);
    setStudentCollegeValidationError("");
    if (collegeDetection.error) pushLog("error", `学院识别失败，但继续按行校验：${collegeDetection.error} 学院不匹配的数据将在治理结果中进入不通过名单。`);
    else pushLog("success", `所属学部（院）已识别：${collegeDetection.collegeName}（来源：${collegeDetection.source === "account" ? "当前账号" : "文件名"}）`);

    const { sheetName, rowCount, rows } = getWorkbookReadSummary(workbookData, parsed.outputSheet);
    if (rowCount === 0) throw new Error("没有读取到数据行");
    const headerIndex = findHeaderRowIndex(rows, parsed.fields);
    const effectiveDataRowCount = getEffectiveDataRowCount(rows, headerIndex);
    if (effectiveDataRowCount === 0) throw new Error("未读取到有效学生数据，请检查 Sheet、表头行和数据行。");
    const tableCollege = detectCollegeFromTableRows(rows, parsed.fields);

    setSourceRows(rows);
    setStatus("正在治理数据");
    pushLog("success", `读取到 Sheet：${sheetName}`);
    pushLog("success", `使用 Sheet：${sheetName}`);
    pushLog("success", `表头行：第 ${headerIndex + 1} 行`);
    pushLog("success", `识别到字段：${formatRecognizedFields(parsed.fields)}`);
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
系统将自动执行既有治理规则。`
    );
    return {
      parsed,
      sourceRows: rows,
      collegeName: collegeDetection.collegeName,
    };
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
      setLogs([]);
      setIsProcessing(true);
      const loaded = await loadStudentDataFile(file);
      pushLog("info", "开始治理数据");
      await processData(loaded);
    } catch (error) {
      console.error("Student Excel load failed:", error);
      const message = getErrorMessage(error) || "本专科信息读取失败";
      setStatus("Excel 读取失败");
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

    const data = await res.json();

    return data.text || "";
  } catch (err) {
    console.error(err);
    return "AI分析失败，请检查DeepSeek接口是否可用。";
  }
};

  const processData = async (override?: StudentProcessRunInput) => {
    const activeTemplateFields = override?.parsed.fields || templateFields;
    const activeTemplateFirstRow = override?.parsed.firstRow || templateFirstRow;
    const activeDictionaryMap = override?.parsed.dictionaries || dictionaryMap;
    const activeFieldDictMap = override?.parsed.fieldToDict || fieldDictMap;
    const activeSourceRows = override?.sourceRows || sourceRows;
    const activeCollegeName = override?.collegeName || studentCollegeName;

    if (!override && isProcessing) {
      alert("治理任务执行中");
      return;
    }
    if (activeTemplateFields.length === 0) {
      alert("请先上传模板");
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

      const collegeFieldIndex = activeTemplateFields.findIndex((field) => /学院|学部|院系/.test(field));
      const collegeField = collegeFieldIndex >= 0 ? activeTemplateFields[collegeFieldIndex] : activeTemplateFields[1] || "学院/学部/院系";
      const currentCollege = normalizeSubmissionCollegeName(activeCollegeName);
      const nextHighlightCellMap = { ...result.highlightCellMap };
      const nextDisqualifiedRows = [...result.disqualifiedRows];
      const nextErrorReports = [...result.errorReports];
      const failedRowNumbers = new Set(nextDisqualifiedRows.map((row) => row.rowNumber));
      let collegeMismatchCount = 0;

      if (!currentCollege || currentCollege === "未知学院") {
        pushLog("error", "当前账号学院识别失败，系统已继续治理，所有数据需进入不通过名单核对。");
        result.processedData.forEach((row, index) => {
          collegeMismatchCount += 1;
          nextHighlightCellMap[`${index}_${collegeFieldIndex >= 0 ? collegeFieldIndex : 0}`] = {
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
      } else if (collegeField) {
        result.processedData.forEach((row, index) => {
          const rowCollege = String(row[collegeField] ?? "").trim();
          if (!rowCollege || isSameSubmissionCollege(rowCollege, currentCollege)) return;

          collegeMismatchCount += 1;
          nextHighlightCellMap[`${index}_${collegeFieldIndex >= 0 ? collegeFieldIndex : 1}`] = {
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

      const nextStats = {
        ...result.stats,
        errors: result.stats.errors + collegeMismatchCount,
        highlighted: Object.keys(nextHighlightCellMap).length,
        disqualified: nextDisqualifiedRows.length,
      };

      if (collegeMismatchCount > 0) {
        pushLog("error", `检测到 ${collegeMismatchCount} 行学院与当前账号不一致，已进入不通过名单。`);
      }

      setProcessedData(result.processedData);
      setHighlightCellMap(nextHighlightCellMap);
      setDisqualifiedRows(nextDisqualifiedRows);
      setAnalysis(result.analysis);
      setStudentErrorReports(nextErrorReports);
      setStats(nextStats);
      setStatus("治理完成");
      pushLog("success", `治理完成：通过 ${Math.max(nextStats.total - nextDisqualifiedRows.length, 0)} 条，不通过 ${nextDisqualifiedRows.length} 条，自动修复 ${nextStats.repaired} 项`);

      const aiText = await askDeepSeek(`
请分析以下困难生数据治理结果：

总人数：${nextStats.total}
自动修复：${nextStats.repaired}
异常人数：${nextStats.errors}
不通过人数：${nextStats.disqualified}

问题统计：
${JSON.stringify(result.analysis)}

请生成：
1. 问题汇总
2. 学院整改建议
3. 数据质量评分
`);
setAiReport(aiText);

      window.dispatchEvent(
        new CustomEvent("bos:college-upload-result", {
          detail: {
            errorCount: nextStats.disqualified,
            totalCount: nextStats.total,
            fixedCount: nextStats.repaired,
            validationErrors: [
              ...toCollegeValidationErrors(nextErrorReports),
              ...nextDisqualifiedRows.map((item) => ({
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
    if (!studentAutoProcessRequested) return;
    if (isProcessing || templateFields.length === 0 || sourceRows.length === 0) return;

    const timer = window.setTimeout(() => {
      setStudentAutoProcessRequested(false);
      void processData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [studentAutoProcessRequested, isProcessing, templateFields.length, sourceRows.length]);

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
        exportMode,
      });
      pushLog("success", `${exportMode === "passed" ? "通过名单" : "不通过名单"}导出成功，不通过人数：${result.failCount}`);
    } catch (error) {
      console.error(error);
      alert("导出失败，请检查模板是否存在。");
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
      if (!currentCollege || currentCollege === "未知学院") {
        pushFamilyLog("error", "当前账号学院识别失败，系统已继续治理，家庭成员数据需进入不通过名单核对。");
        const studentIdField =
          activeFamilyTemplateFields.find((field) => /学生.*身份证|身份证/.test(field)) || activeFamilyTemplateFields[2] || "学生身份证号";
        const memberNameField =
          activeFamilyTemplateFields.find((field) => /家庭成员.*姓名|成员姓名|姓名/.test(field)) || activeFamilyTemplateFields[3] || "家庭成员姓名";
        const relationField =
          activeFamilyTemplateFields.find((field) => /关系/.test(field)) || activeFamilyTemplateFields[5] || "与学生关系";
        const failedRowNumbers = new Set(nextFamilyReviewRows.map((row) => row.rowNumber));
        nextFamilyReviewRows = [...nextFamilyReviewRows];

        result.familyProcessedData.forEach((row, index) => {
          nextFamilyHighlightCellMap[`${index}_0`] = {
            color: "yellow",
            reason: "当前账号学院识别失败，无法确认该行是否属于本学院",
          };
          if (!failedRowNumbers.has(index + 1)) {
            failedRowNumbers.add(index + 1);
            nextFamilyReviewRows.push({
              rowNumber: index + 1,
              studentId: String(row[studentIdField] ?? ""),
              memberName: String(row[memberNameField] ?? ""),
              relation: String(row[relationField] ?? ""),
              reason: "当前账号学院识别失败，无法确认该行是否属于本学院",
            });
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

  const renderTable = (data: Record<string, unknown>[] | DisqualifiedRow[] | FamilyReviewRow[]) => {
    if (data.length === 0) return <div style={styles.empty}>暂无数据</div>;
    const columns = Object.keys(data[0]);

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
            {data.slice(0, 30).map((row, index) => (
              <tr key={index}>
                {columns.map((col) => (
                  <td key={col} style={styles.td}>{String((row as Record<string, unknown>)[col] ?? "")}</td>
                ))}
              </tr>
            ))}
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

      {activeModule === "merge" && <MergePage />}

      {activeModule === "processing" && (
        <div style={collegeMode ? { ...styles.processingWorkspace, ...styles.embeddedProcessingWorkspace } : styles.processingWorkspace}>
          {collegeMode && (
            <div style={styles.academicYearBar}>
              <div>
                <div style={styles.academicYearLabel}>当前学年：{academicYear}</div>
                <div style={styles.academicYearTip}>本次治理和上载数据将归档到所选学年，学校端按学年独立查看。</div>
              </div>
              <label style={styles.academicYearSelectLabel}>
                学年
                <select
                  style={styles.academicYearSelect}
                  value={academicYear}
                  onChange={(event) => setAcademicYear(event.target.value)}
                >
                  {ACADEMIC_YEAR_OPTIONS.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
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
              studentCollegeName={studentCollegeName}
              stats={stats}
              renderTable={renderTable}
              processedData={processedData}
              disqualifiedRows={disqualifiedRows}
              analysis={analysis}
              aiReport={aiReport}
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
    height: "100%",
    minHeight: 260,
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
