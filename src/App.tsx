import React, { useEffect, useRef, useState } from "react";
// 主页面组件：负责功能区切换、上传按钮、状态管理、结果预览和日志展示。

import { getMergeBatches, saveMergeBatch } from "./db/localMergeDb";
import DatabasePage from "./pages/DatabasePage";
import MergePage from "./pages/MergePage";
import StudentProcessPage from "./pages/StudentProcessPage";
import FamilyProcessPage from "./pages/FamilyProcessPage";
import { exportErrorReport } from "./services/errorReport";
import { exportFamilyExcel, processFamilyRows } from "./services/familyProcessor";
import { exportStudentExcel, processStudentRows } from "./services/studentProcessor";

import {
  makeSourcePreview,
  parseFamilyTemplate,
  parseStudentTemplate,
  readWorkbook,
} from "./services/templateParser";
import { detectCollegeName } from "./utils/collegeDetector";
import type {
  DisqualifiedRow,
  ErrorReportItem,
  FamilyProcessingStats,
  FamilyReviewRow,
  HighlightInfo,
  LogItem,
  LogType,
  ProcessingStats,
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
  items.map((item) => {
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

type AppProps = {
  collegeMode?: boolean;
};

export default function App({ collegeMode = false }: AppProps) {
  const templateRef = useRef<HTMLInputElement>(null);
  const dataRef = useRef<HTMLInputElement>(null);
  const familyTemplateRef = useRef<HTMLInputElement>(null);
  const familyDataRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const familyLogEndRef = useRef<HTMLDivElement>(null);

  const [templateWorkbook, setTemplateWorkbook] = useState<WorkbookData | null>(null);
  const [templateOutputSheet, setTemplateOutputSheet] = useState("");
  const [templateDictSheet, setTemplateDictSheet] = useState("");
  const [templateFirstRow, setTemplateFirstRow] = useState<unknown[]>([]);
  const [templateSecondRow, setTemplateSecondRow] = useState<unknown[]>([]);
  const [templateFields, setTemplateFields] = useState<string[]>([]);
  const [dictionaryMap, setDictionaryMap] = useState<Record<string, string[]>>({});
  const [fieldDictMap, setFieldDictMap] = useState<Record<string, string>>({});
  const [sourceRows, setSourceRows] = useState<unknown[][]>([]);
  const [studentCollegeName, setStudentCollegeName] = useState("未知学院");
  const [processedData, setProcessedData] = useState<Record<string, unknown>[]>([]);
  const [studentErrorReports, setStudentErrorReports] = useState<ErrorReportItem[]>([]);
  const [highlightCellMap, setHighlightCellMap] = useState<Record<string, HighlightInfo>>({});
  const [disqualifiedRows, setDisqualifiedRows] = useState<DisqualifiedRow[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [status, setStatus] = useState("等待任务");
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysis, setAnalysis] = useState<Record<string, number>>({});
  const [activeModule, setActiveModule] = useState<"processing" | "database" | "merge">("processing");
  const [activeProcessingPanel, setActiveProcessingPanel] = useState<"student" | "family">("student");
  const [stats, setStats] = useState<ProcessingStats>(initialStats);

  const [familyTemplateWorkbook, setFamilyTemplateWorkbook] = useState<WorkbookData | null>(null);
  const [familyTemplateOutputSheet, setFamilyTemplateOutputSheet] = useState("");
  const [familyTemplateDictSheet, setFamilyTemplateDictSheet] = useState("");
  const [familyTemplateFirstRow, setFamilyTemplateFirstRow] = useState<unknown[]>([]);
  const [familyTemplateSecondRow, setFamilyTemplateSecondRow] = useState<unknown[]>([]);
  const [familyTemplateFields, setFamilyTemplateFields] = useState<string[]>([]);
  const [familyDictionaryMap, setFamilyDictionaryMap] = useState<Record<string, string[]>>({});
  const [familyFieldDictMap, setFamilyFieldDictMap] = useState<Record<string, string>>({});
  const [familySourceRows, setFamilySourceRows] = useState<unknown[][]>([]);
  const [familyCollegeName, setFamilyCollegeName] = useState("未知学院");
  const [familyProcessedData, setFamilyProcessedData] = useState<Record<string, unknown>[]>([]);
  const [familyHighlightCellMap, setFamilyHighlightCellMap] = useState<Record<string, HighlightInfo>>({});
  const [familyReviewRows, setFamilyReviewRows] = useState<FamilyReviewRow[]>([]);
  const [familyLogs, setFamilyLogs] = useState<LogItem[]>([]);
  const [familyStatus, setFamilyStatus] = useState("等待任务");
  const [isFamilyProcessing, setIsFamilyProcessing] = useState(false);
  const [familyAnalysis, setFamilyAnalysis] = useState<Record<string, number>>({});
  const [familyStats, setFamilyStats] = useState<FamilyProcessingStats>(initialFamilyStats);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    familyLogEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [familyLogs]);


  const pushLog = (type: LogType, message: string) => {
    setLogs((prev) => [...prev, { type, message, time: new Date().toLocaleTimeString() }]);
  };

  const pushFamilyLog = (type: LogType, message: string) => {
    setFamilyLogs((prev) => [...prev, { type, message, time: new Date().toLocaleTimeString() }]);
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
      !confirm("检测到该学院本专科信息可能已上载，是否仍然继续上载？")
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
      !confirm("检测到该学院家庭成员信息可能已上载，是否仍然继续上载？")
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

  const uploadTemplate = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const parsed = parseStudentTemplate(await readWorkbook(file));
      setTemplateWorkbook(parsed.workbookData);
      setTemplateOutputSheet(parsed.outputSheet);
      setTemplateDictSheet(parsed.dictSheet);
      setTemplateFirstRow(parsed.firstRow);
      setTemplateSecondRow(parsed.secondRow);
      setTemplateFields(parsed.fields);
      setDictionaryMap(parsed.dictionaries);
      setFieldDictMap(parsed.fieldToDict);
      setStatus("模板加载完成");

      pushLog(
        "success",
        `模板上传成功：${file.name}
功能板块：困难生数据处理
输出范围：A 到 AN，共 ${parsed.fields.length} 列
输出表：${parsed.outputSheet}
字典表：${parsed.dictSheet}

已启用：
AA、AB、AD列统一填写“同意”；
W列只检查是否超过60字，超过则自动精简，不标黄；
其它原有规则保留。`
      );
    } catch {
      pushLog("error", "模板读取失败");
      alert("模板读取失败");
    } finally {
      event.target.value = "";
    }
  };

  const uploadData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const detectedCollege = detectCollegeName(file.name);
    setStudentCollegeName(detectedCollege);

    try {
      const workbookData = await readWorkbook(file);
      const firstSheet = workbookData.sheetNames[0];
      const rows = workbookData.sheets[firstSheet] || [];
      setSourceRows(rows);
      setProcessedData([]);
      setHighlightCellMap({});
      setDisqualifiedRows([]);
      setStatus("待处理数据已加载");

      pushLog(
        "success",
        `待处理数据上传成功：${file.name}
数据表：${firstSheet}
原始行数：${rows.length}`
      );
    } catch {
      pushLog("error", "数据读取失败");
      alert("数据读取失败");
    } finally {
      event.target.value = "";
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
            errorCount: result.stats.errors,
            validationErrors: toCollegeValidationErrors(result.errorReports),
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
    const win = window as typeof window & {
      __bosHasBlockingErrors?: () => boolean;
      __bosSyncToSchool?: () => Promise<void>;
    };

    win.__bosHasBlockingErrors = hasBlockingStudentUpload;
    win.__bosSyncToSchool = async () => {
      if (hasBlockingStudentUpload()) {
        const message = "上传失败，当前数据仍存在不通过项，请查看“不通过预览”";
        pushLog("error", message);
        setStatus(message);
        throw new Error(message);
      }
      await addStudentResultToMergePool();
    };

    return () => {
      delete win.__bosHasBlockingErrors;
      delete win.__bosSyncToSchool;
    };
  }, [stats.errors, disqualifiedRows, studentErrorReports, processedData, studentCollegeName]);

  const exportExcel = () => {
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
      });
      pushLog("success", `Excel导出成功，不通过名单人数：${result.failCount}`);
    } catch (error) {
      console.error(error);
      alert("导出失败，请检查模板是否存在。");
    }
  };

  const exportStudentErrorReport = () => {
    if (studentErrorReports.length === 0) {
      alert("暂无不通过名单");
      return;
    }

    exportErrorReport(studentErrorReports);
  };

  const uploadFamilyTemplate = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const parsed = parseFamilyTemplate(await readWorkbook(file));
      setFamilyTemplateWorkbook(parsed.workbookData);
      setFamilyTemplateOutputSheet(parsed.outputSheet);
      setFamilyTemplateDictSheet(parsed.dictSheet);
      setFamilyTemplateFirstRow(parsed.firstRow);
      setFamilyTemplateSecondRow(parsed.secondRow);
      setFamilyTemplateFields(parsed.fields);
      setFamilyDictionaryMap(parsed.dictionaries);
      setFamilyFieldDictMap(parsed.fieldToDict);
      setFamilyStatus("家庭成员模板加载完成");

      pushFamilyLog(
        "success",
        `家庭成员模板上传成功：${file.name}
输出表：${parsed.outputSheet}
字典表：${parsed.dictSheet}
识别字段：${parsed.fields.join("、")}

已启用：
年度、学期、与学生关系、健康状况按字典校验；
姓名、年龄、单位、年收入、职业按模板填写要求校验；
家庭成员信息处理默认只进行格式治理，不强制匹配困难生数据库。`
      );
    } catch (error) {
      console.error(error);
      pushFamilyLog("error", "家庭成员模板读取失败");
      alert("家庭成员模板读取失败");
    } finally {
      event.target.value = "";
    }
  };

  const uploadFamilyData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const detectedCollege = detectCollegeName(file.name);
    setFamilyCollegeName(detectedCollege);

    try {
      const workbookData = await readWorkbook(file);
      const firstSheet = workbookData.sheetNames[0];
      const rows = workbookData.sheets[firstSheet] || [];
      setFamilySourceRows(rows);
      setFamilyProcessedData([]);
      setFamilyHighlightCellMap({});
      setFamilyReviewRows([]);
      setFamilyAnalysis({});
      setFamilyStatus("家庭成员数据已加载");

      pushFamilyLog(
        "success",
        `家庭成员数据上传成功：${file.name}
数据表：${firstSheet}
原始行数：${rows.length}`
      );
    } catch (error) {
      console.error(error);
      pushFamilyLog("error", "家庭成员数据读取失败");
      alert("家庭成员数据读取失败");
    } finally {
      event.target.value = "";
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

  const exportFamilyResult = () => {
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
      });
      pushFamilyLog("success", `Excel导出成功，待复核行数：${result.reviewCount}`);
    } catch (error) {
      console.error(error);
      alert("家庭成员结果导出失败，请检查模板是否存在。");
    }
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

  const renderTemplatePreview = () => {
    if (templateFields.length === 0) return <div style={styles.empty}>暂无模板</div>;
    const previewRows = [
      templateFields.reduce<Record<string, unknown>>((obj, field, index) => {
        obj[field] = templateFirstRow[index] ?? "";
        return obj;
      }, {}),
      templateFields.reduce<Record<string, unknown>>((obj, field, index) => {
        obj[field] = templateSecondRow[index] ?? field;
        return obj;
      }, {}),
    ];
    return renderTable(previewRows);
  };

  const renderFamilyTemplatePreview = () => {
    if (familyTemplateFields.length === 0) return <div style={styles.empty}>暂无模板</div>;
    const previewRows = [
      familyTemplateFields.reduce<Record<string, unknown>>((obj, field, index) => {
        obj[field] = familyTemplateFirstRow[index] ?? "";
        return obj;
      }, {}),
      familyTemplateFields.reduce<Record<string, unknown>>((obj, field, index) => {
        obj[field] = familyTemplateSecondRow[index] ?? field;
        return obj;
      }, {}),
    ];
    return renderTable(previewRows);
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

          {activeProcessingPanel === "student" ? (
            <StudentProcessPage
              styles={styles}
              templateRef={templateRef}
              dataRef={dataRef}
              uploadTemplate={uploadTemplate}
              uploadData={uploadData}
              isProcessing={isProcessing}
              processData={processData}
              exportExcel={exportExcel}
              exportStudentErrorReport={exportStudentErrorReport}
              addStudentResultToMergePool={addStudentResultToMergePool}
              hideSubmitAction={collegeMode}
              status={status}
              studentCollegeName={studentCollegeName}
              stats={stats}
              renderTemplatePreview={renderTemplatePreview}
              renderTable={renderTable}
              sourceRows={sourceRows}
              templateFields={templateFields}
              processedData={processedData}
              disqualifiedRows={disqualifiedRows}
              analysis={analysis}
              logs={logs}
              logEndRef={logEndRef}
            />
          ) : (
            <FamilyProcessPage
              styles={styles}
              familyTemplateRef={familyTemplateRef}
              familyDataRef={familyDataRef}
              uploadFamilyTemplate={uploadFamilyTemplate}
              uploadFamilyData={uploadFamilyData}
              isFamilyProcessing={isFamilyProcessing}
              processFamilyData={processFamilyData}
              exportFamilyResult={exportFamilyResult}
              addFamilyResultToMergePool={addFamilyResultToMergePool}
              hideSubmitAction={collegeMode}
              familyStatus={familyStatus}
              familyCollegeName={familyCollegeName}
              familyStats={familyStats}
              renderFamilyTemplatePreview={renderFamilyTemplatePreview}
              renderTable={renderTable}
              makeSourcePreview={makeSourcePreview}
              familySourceRows={familySourceRows}
              familyTemplateFields={familyTemplateFields}
              familyProcessedData={familyProcessedData}
              familyReviewRows={familyReviewRows}
              familyAnalysis={familyAnalysis}
              familyLogs={familyLogs}
              familyLogEndRef={familyLogEndRef}
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
    flex: 1,
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






