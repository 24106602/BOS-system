import React, { useEffect, useRef, useState } from "react";
// 主页面组件：负责功能区切换、上传按钮、状态管理、结果预览和日志展示。

import { getMergeBatches, saveMergeBatch } from "./db/localMergeDb";
import DatabasePage from "./pages/DatabasePage";
import MergePage from "./pages/MergePage";
import StudentProcessPage from "./pages/StudentProcessPage";
import FamilyProcessPage from "./pages/FamilyProcessPage";
import { exportFamilyExcel, processFamilyRows } from "./services/familyProcessor";
import { exportStudentExcel, processStudentRows } from "./services/studentProcessor";

import {
  parseFamilyTemplate,
  parseStudentTemplate,
  readWorkbook,
} from "./services/templateParser";
import { resolveCollegeUpload } from "./utils/collegeDetector";
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

const looksLikeStudentFile = (fileName: string, workbookData: WorkbookData) => {
  const text = `${fileName} ${getWorkbookText(workbookData)}`;
  return /本专科|困难生信息|特殊困难类型|家庭年均收入|陈述理由|收入来源|身份证号/i.test(text);
};

type AppProps = {
  collegeMode?: boolean;
  fixedProcessingPanel?: "student" | "family";
  onBackToDifficulty?: () => void;
};

export default function App({ collegeMode = false, fixedProcessingPanel, onBackToDifficulty }: AppProps) {
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
  const [status, setStatus] = useState("等待任务");
  const [isProcessing, setIsProcessing] = useState(false);
  const [studentAutoProcessRequested, setStudentAutoProcessRequested] = useState(false);
  const [analysis, setAnalysis] = useState<Record<string, number>>({});
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
  const [familyStatus, setFamilyStatus] = useState("等待任务");
  const [isFamilyProcessing, setIsFamilyProcessing] = useState(false);
  const [familyAutoProcessRequested, setFamilyAutoProcessRequested] = useState(false);
  const [familyAnalysis, setFamilyAnalysis] = useState<Record<string, number>>({});
  const [familyStats, setFamilyStats] = useState<FamilyProcessingStats>(initialFamilyStats);

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

  const hasBlockingStudentUpload = () =>
    Boolean(studentCollegeValidationError) ||
    stats.errors > 0 ||
    disqualifiedRows.length > 0 ||
    studentErrorReports.some(
      (item) =>
        String(item.issueType || "").includes("标红") ||
        String(item.issueType || "").includes("错误") ||
        String(item.action || "").includes("不通过")
    );

  const hasBlockingFamilyUpload = () =>
    Boolean(familyCollegeValidationError) ||
    familyStats.errors > 0 ||
    familyReviewRows.length > 0;

  const addStudentResultToMergePool = async () => {
    if (processedData.length === 0) {
      alert("没有可上载的本专科处理结果");
      return;
    }

    if (hasBlockingStudentUpload()) {
      const message = "上传失败，当前数据仍存在不通过项，请查看“不通过预览”";
      pushLog("error", message);
      alert(message);
      return;
    }

    const collegeName = studentCollegeName.trim() || "未知学院";
    const existingBatches = await getMergeBatches();
    const possibleDuplicate = existingBatches.some(
      (item) =>
        item.collegeName === collegeName &&
        item.dataType === "student" &&
        item.rowCount === processedData.length
    );

    if (
      possibleDuplicate &&
      !confirm("检测到该学部（院）本专科信息可能已上载，是否仍然继续上载？")
    ) {
      return;
    }

    await saveMergeBatch({
      id: crypto.randomUUID(),
      collegeName,
      dataType: "student",
      rowCount: processedData.length,
      createdAt: new Date().toISOString(),
      rows: processedData,
    });

    pushLog("success", `${collegeName} 本专科信息已上载到学校端，共 ${processedData.length} 条`);
    alert("已上载到学校端");
  };

  const addFamilyResultToMergePool = async () => {
    if (familyProcessedData.length === 0) {
      alert("没有可上载的家庭成员处理结果");
      return;
    }

    if (hasBlockingFamilyUpload()) {
      const message = "上载失败，当前家庭成员数据仍存在不通过项，请查看“不通过预览”";
      pushFamilyLog("error", message);
      alert(message);
      return;
    }

    const collegeName = familyCollegeName.trim() || "未知学院";
    const existingBatches = await getMergeBatches();
    const possibleDuplicate = existingBatches.some(
      (item) =>
        item.collegeName === collegeName &&
        item.dataType === "family" &&
        item.rowCount === familyProcessedData.length
    );

    if (
      possibleDuplicate &&
      !confirm("检测到该学部（院）家庭成员信息可能已上载，是否仍然继续上载？")
    ) {
      return;
    }

    await saveMergeBatch({
      id: crypto.randomUUID(),
      collegeName,
      dataType: "family",
      rowCount: familyProcessedData.length,
      createdAt: new Date().toISOString(),
      rows: familyProcessedData,
    });

    pushFamilyLog("success", `${collegeName} 家庭成员信息已上载到学校端，共 ${familyProcessedData.length} 条`);
    alert("家庭成员信息已上载到学校端");
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
    if (!isExcelFile(file)) {
      throw new Error("当前页面仅支持困难生本专科信息 Excel 文件");
    }

    setStudentAutoProcessRequested(false);
    setIsProcessing(true);
    setProcessedData([]);
    setHighlightCellMap({});
    setDisqualifiedRows([]);
    setStudentErrorReports([]);
    setAnalysis({});
    setStats(initialStats);
    setStatus("正在读取本专科信息 Excel...");

    const workbookData = await readWorkbook(file);
    if (looksLikeFamilyFile(file.name, workbookData)) {
      throw new Error("当前页面仅支持困难生本专科信息文件");
    }
    if (!looksLikeStudentFile(file.name, workbookData)) {
      throw new Error("当前页面仅支持困难生本专科信息文件");
    }

    const parsed = parseStudentTemplate(workbookData);
    if (!parsed.fields.some((field) => /姓名|身份证|困难|收入|陈述理由/.test(field))) {
      throw new Error("当前页面仅支持困难生本专科信息文件");
    }

    applyStudentTemplate(parsed);

    const collegeDetection = resolveCollegeUpload(file.name);
    setStudentCollegeName(collegeDetection.collegeName);
    setStudentCollegeValidationError(collegeDetection.error);
    if (collegeDetection.error) pushLog("error", collegeDetection.error);
    else pushLog("success", `所属学部（院）已识别：${collegeDetection.collegeName}（来源：${collegeDetection.source === "account" ? "当前账号" : "文件名"}）`);

    const firstSheet = workbookData.sheetNames[0];
    const rows = workbookData.sheets[firstSheet] || [];
    setSourceRows(rows);
    setStatus("已读取 Excel，正在自动治理...");

    pushLog(
      "success",
      `本专科信息 Excel 已读取：${file.name}
数据表：${firstSheet}
原始行数：${rows.length}
系统将自动执行既有治理规则。`
    );
    setStudentAutoProcessRequested(true);
  };

  const uploadData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    await uploadStudentDataFile(file);
    input.value = "";
    if (dataRef.current) dataRef.current.value = "";
  };

  const uploadStudentDataFile = async (file: File) => {
    try {
      await loadStudentDataFile(file);
    } catch (error) {
      console.error("Student Excel load failed:", error);
      const message = error instanceof Error ? error.message : "本专科信息读取失败";
      setStatus("Excel 读取失败");
      pushLog("error", message);
      alert(message);
    } finally {
      setIsProcessing(false);
      if (dataRef.current) dataRef.current.value = "";
    }
  };

  const processData = async () => {
    if (isProcessing) {
      alert("治理任务执行中");
      return;
    }
    if (templateFields.length === 0) {
      alert("请先上传模板");
      return;
    }
    if (sourceRows.length === 0) {
      alert("请先上传待处理数据");
      return;
    }
    if (studentCollegeValidationError) {
      pushLog("error", studentCollegeValidationError);
      alert(studentCollegeValidationError);
      return;
    }

    try {
      setIsProcessing(true);
      setProcessedData([]);
      setHighlightCellMap({});
      setDisqualifiedRows([]);
      setAnalysis({});

      const result = await processStudentRows({
        templateFields,
        templateFirstRow,
        dictionaryMap,
        fieldDictMap,
        sourceRows,
        collegeName: studentCollegeName,
        onLog: (item) => pushLog(item.type, item.message),
        onProgress: (nextStats, nextStatus) => {
          setStats(nextStats);
          setStatus(nextStatus);
        },
      });

      setProcessedData(result.processedData);
      setHighlightCellMap(result.highlightCellMap);
      setDisqualifiedRows(result.disqualifiedRows);
      setAnalysis(result.analysis);
      setStudentErrorReports(result.errorReports);
      setStats(result.stats);
      setStatus("治理完成");

      window.dispatchEvent(
        new CustomEvent("bos:college-upload-result", {
          detail: {
            errorCount: result.stats.disqualified,
            totalCount: result.stats.total,
            fixedCount: result.stats.repaired,
            validationErrors: [
              ...toCollegeValidationErrors(result.errorReports),
              ...result.disqualifiedRows.map((item) => ({
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
异常问题：${result.stats.errors}
标记单元格：${result.stats.highlighted}
不通过人数：${result.stats.disqualified}
`);
    } catch (error) {
      console.error(error);
      pushLog("error", "困难生数据处理失败");
      alert("困难生数据处理失败，请检查模板和数据格式。");
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
    if (!isExcelFile(file)) {
      throw new Error("当前页面仅支持困难生家庭成员信息 Excel 文件");
    }

    setFamilyAutoProcessRequested(false);
    setIsFamilyProcessing(true);
    setFamilyProcessedData([]);
    setFamilyHighlightCellMap({});
    setFamilyReviewRows([]);
    setFamilyAnalysis({});
    setFamilyStats(initialFamilyStats);
    setFamilyStatus("正在读取家庭成员信息 Excel...");

    const workbookData = await readWorkbook(file);
    if (!looksLikeFamilyFile(file.name, workbookData)) {
      throw new Error("当前页面仅支持困难生家庭成员信息文件");
    }

    const parsed = parseFamilyTemplate(workbookData);
    if (!parsed.fields.some((field) => /家庭成员|学生身份证|关系|健康|职业|年收入/.test(field))) {
      throw new Error("当前页面仅支持困难生家庭成员信息文件");
    }

    applyFamilyTemplate(parsed);

    const collegeDetection = resolveCollegeUpload(file.name);
    setFamilyCollegeName(collegeDetection.collegeName);
    setFamilyCollegeValidationError(collegeDetection.error);
    if (collegeDetection.error) pushFamilyLog("error", collegeDetection.error);
    else pushFamilyLog("success", `所属学部（院）已识别：${collegeDetection.collegeName}（来源：${collegeDetection.source === "account" ? "当前账号" : "文件名"}）`);

    const firstSheet = workbookData.sheetNames[0];
    const rows = workbookData.sheets[firstSheet] || [];
    setFamilySourceRows(rows);
    setFamilyStatus("已读取 Excel，正在自动治理...");

    pushFamilyLog(
      "success",
      `家庭成员信息 Excel 已读取：${file.name}
数据表：${firstSheet}
原始行数：${rows.length}
系统将自动执行既有治理规则。`
    );
    setFamilyAutoProcessRequested(true);
  };

  const uploadFamilyData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    await uploadFamilyDataFile(file);
    input.value = "";
    if (familyDataRef.current) familyDataRef.current.value = "";
  };

  const uploadFamilyDataFile = async (file: File) => {
    try {
      await loadFamilyDataFile(file);
    } catch (error) {
      console.error("Family Excel load failed:", error);
      const message = error instanceof Error ? error.message : "家庭成员信息读取失败";
      setFamilyStatus("Excel 读取失败");
      pushFamilyLog("error", message);
      alert(message);
    } finally {
      setIsFamilyProcessing(false);
      if (familyDataRef.current) familyDataRef.current.value = "";
    }
  };

  const processFamilyData = async () => {
    if (isFamilyProcessing) {
      alert("家庭成员治理任务执行中");
      return;
    }
    if (familyTemplateFields.length === 0) {
      alert("请先上传家庭成员模板");
      return;
    }
    if (familySourceRows.length === 0) {
      alert("请先上传家庭成员数据");
      return;
    }
    if (familyCollegeValidationError) {
      pushFamilyLog("error", familyCollegeValidationError);
      alert(familyCollegeValidationError);
      return;
    }

    try {
      setIsFamilyProcessing(true);
      setFamilyProcessedData([]);
      setFamilyHighlightCellMap({});
      setFamilyReviewRows([]);
      setFamilyAnalysis({});

      const result = await processFamilyRows({
        familyTemplateFields,
        familyTemplateFirstRow,
        familyDictionaryMap,
        familyFieldDictMap,
        familySourceRows,
        onLog: (item) => pushFamilyLog(item.type, item.message),
        onProgress: (nextStats, nextStatus) => {
          setFamilyStats(nextStats);
          setFamilyStatus(nextStatus);
        },
      });

      setFamilyProcessedData(result.familyProcessedData);
      setFamilyHighlightCellMap(result.familyHighlightCellMap);
      setFamilyReviewRows(result.familyReviewRows);
      setFamilyAnalysis(result.familyAnalysis);
      setFamilyStats(result.familyStats);
      setFamilyStatus("家庭成员治理完成");

      window.dispatchEvent(
        new CustomEvent("bos:college-upload-result", {
          detail: {
            errorCount: result.familyStats.review,
            totalCount: result.familyStats.total,
            fixedCount: result.familyStats.repaired,
            validationErrors: result.familyReviewRows.map((item) => ({
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
自动修复：${result.familyStats.repaired}
异常问题：${result.familyStats.errors}
标记单元格：${result.familyStats.highlighted}
待复核行数：${result.familyStats.review}
数据库未命中：${result.familyStats.databaseMiss}
`);
    } catch (error) {
      console.error(error);
      pushFamilyLog("error", "家庭成员信息处理失败");
      alert("家庭成员信息处理失败，请检查模板和数据格式。");
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
        <div style={styles.processingWorkspace}>
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
              hideSubmitAction={false}
              status={status}
              studentCollegeName={studentCollegeName}
              stats={stats}
              renderTable={renderTable}
              processedData={processedData}
              disqualifiedRows={disqualifiedRows}
              analysis={analysis}
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
    height: "auto",
    minHeight: 740,
    background: "transparent",
    overflow: "visible",
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
    maxHeight: 260,
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






