import React, { useEffect, useRef, useState } from "react";
// 主页面组件：负责功能区切换、上传按钮、状态管理、结果预览和日志展示。

import { getMergeBatches, saveMergeBatch } from "./db/localMergeDb";
import DatabasePage from "./pages/DatabasePage";
import MergePage from "./pages/MergePage";
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

export default function App() {
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

  const addStudentResultToMergePool = async () => {
    if (processedData.length === 0) {
      alert("没有可加入汇总池的本专科处理结果");
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
      !confirm("检测到该学院本专科信息可能已加入汇总池，是否仍然继续加入？")
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

    pushLog("success", `${collegeName} 本专科信息已加入汇总池，共 ${processedData.length} 条`);
    alert("已加入汇总池");
  };

  const addFamilyResultToMergePool = async () => {
    if (familyProcessedData.length === 0) {
      alert("没有可加入汇总池的家庭成员处理结果");
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
      !confirm("检测到该学院家庭成员信息可能已加入汇总池，是否仍然继续加入？")
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

    pushFamilyLog("success", `${collegeName} 家庭成员信息已加入汇总池，共 ${familyProcessedData.length} 条`);
    alert("家庭成员信息已加入汇总池");
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
      alert("暂无异常报告");
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
    <div style={styles.page}>
      <div style={styles.moduleBar}>
        <div style={styles.moduleTitle}>数据治理系统</div>

        <button
          onClick={() => setActiveModule("processing")}
          style={activeModule === "processing" ? styles.activeModule : styles.inactiveModule}
        >
          困难生数据处理
        </button>

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
            <div style={styles.layout}>
              <div style={styles.leftPanel}>
                <div style={styles.windowHeader}>
                  <h1 style={styles.title}>本专科困难生信息处理</h1>
                  <span style={styles.windowBadge}>困难生数据处理子功能</span>
                </div>

                <div style={styles.buttonGrid}>
                  <input ref={templateRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={uploadTemplate} />
                  <button onClick={() => templateRef.current?.click()} style={styles.blueButton}>上传模板</button>
                  <input ref={dataRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={uploadData} />
                  <button onClick={() => dataRef.current?.click()} style={styles.greenButton}>上传待处理数据</button>
                  <button disabled={isProcessing} onClick={processData} style={styles.orangeButton}>
                    {isProcessing ? "治理执行中..." : "开始治理"}
                  </button>
                  <button onClick={exportExcel} style={styles.purpleButton}>导出结果</button>
                  <button onClick={exportStudentErrorReport} style={styles.purpleButton}>导出异常报告</button>
                  <button onClick={addStudentResultToMergePool} style={styles.mergeButton}>加入汇总池</button>
                </div>

                <div style={styles.status}>{status}</div>
                <div style={styles.status}>当前识别学院：{studentCollegeName}</div>

                <div style={styles.statsGrid}>
                  <div style={styles.statCard}><div>数据行数</div><strong>{stats.total}</strong></div>
                  <div style={styles.statCard}><div>修复</div><strong style={{ color: "#16a34a" }}>{stats.repaired}</strong></div>
                  <div style={styles.statCard}><div>异常</div><strong style={{ color: "#dc2626" }}>{stats.errors}</strong></div>
                  <div style={styles.statCard}><div>标记</div><strong style={{ color: "#7c3aed" }}>{stats.highlighted}</strong></div>
                  <div style={styles.statCard}><div>不通过</div><strong style={{ color: "#dc2626" }}>{stats.disqualified}</strong></div>
                </div>

                <section style={styles.section}><h2>模板预览</h2>{renderTemplatePreview()}</section>
                <section style={styles.section}><h2>待处理数据预览</h2>{renderTable(makeSourcePreview(sourceRows, templateFields))}</section>
                <section style={styles.section}><h2>治理结果预览</h2>{renderTable(processedData)}</section>
                <section style={styles.section}><h2>不通过名单预览</h2>{renderTable(disqualifiedRows)}</section>

                <section style={styles.section}>
                  <h2>问题分析</h2>
                  {Object.keys(analysis).length === 0 ? (
                    <div style={styles.empty}>暂无分析结果</div>
                  ) : (
                    Object.keys(analysis).map((key) => (
                      <div key={key} style={styles.problemItem}>{key}：{analysis[key]} 项问题</div>
                    ))
                  )}
                </section>
              </div>

              <div style={styles.rightPanel}>
                <h2 style={styles.logTitle}>本专科处理日志</h2>
                <div style={styles.logBox}>
                  {logs.map((item, index) => (
                    <div
                      key={index}
                      style={{
                        ...styles.logItem,
                        color: item.type === "error" ? "#f87171" : item.type === "success" ? "#4ade80" : "#ffffff",
                      }}
                    >
                      [{item.time}] {item.message}
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>
            </div>
          ) : (
            <div style={styles.familyLayout}>
              <div style={styles.familyMainPanel}>
                <div style={styles.windowHeader}>
                  <h1 style={styles.title}>家庭成员信息处理</h1>
                  <span style={styles.windowBadge}>困难生数据处理子功能</span>
                </div>

                <div style={styles.buttonGrid}>
                  <input ref={familyTemplateRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={uploadFamilyTemplate} />
                  <button onClick={() => familyTemplateRef.current?.click()} style={styles.blueButton}>上传模板</button>
                  <input ref={familyDataRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={uploadFamilyData} />
                  <button onClick={() => familyDataRef.current?.click()} style={styles.greenButton}>上传家庭成员数据</button>
                  <button disabled={isFamilyProcessing} onClick={processFamilyData} style={styles.orangeButton}>
                    {isFamilyProcessing ? "处理中..." : "开始处理"}
                  </button>
                  <button onClick={exportFamilyResult} style={styles.purpleButton}>导出结果</button>
                  <button onClick={addFamilyResultToMergePool} style={styles.mergeButton}>加入汇总池</button>
                </div>

                <div style={styles.status}>{familyStatus}</div>
                <div style={styles.status}>当前识别学院：{familyCollegeName}</div>

                <div style={styles.statsGrid}>
                  <div style={styles.statCard}><div>成员数据行数</div><strong>{familyStats.total}</strong></div>
                  <div style={styles.statCard}><div>修复</div><strong style={{ color: "#16a34a" }}>{familyStats.repaired}</strong></div>
                  <div style={styles.statCard}><div>异常</div><strong style={{ color: "#dc2626" }}>{familyStats.errors}</strong></div>
                  <div style={styles.statCard}><div>标记</div><strong style={{ color: "#7c3aed" }}>{familyStats.highlighted}</strong></div>
                  <div style={styles.statCard}><div>待复核</div><strong style={{ color: "#f97316" }}>{familyStats.review}</strong></div>
                  <div style={styles.statCard}><div>库未命中</div><strong style={{ color: "#dc2626" }}>{familyStats.databaseMiss}</strong></div>
                </div>

                <section style={styles.section}><h2>家庭成员模板预览</h2>{renderFamilyTemplatePreview()}</section>
                <section style={styles.section}><h2>家庭成员数据预览</h2>{renderTable(makeSourcePreview(familySourceRows, familyTemplateFields))}</section>
                <section style={styles.section}><h2>家庭成员处理结果</h2>{renderTable(familyProcessedData)}</section>
                <section style={styles.section}><h2>家庭成员待复核名单</h2>{renderTable(familyReviewRows)}</section>

                <section style={styles.section}>
                  <h2>问题分析</h2>
                  {Object.keys(familyAnalysis).length === 0 ? (
                    <div style={styles.empty}>暂无分析结果</div>
                  ) : (
                    Object.keys(familyAnalysis).map((key) => (
                      <div key={key} style={styles.problemItem}>{key}：{familyAnalysis[key]} 项问题</div>
                    ))
                  )}
                </section>
              </div>

              <div style={styles.familySidePanel}>
                <h2 style={styles.logTitle}>家庭成员处理日志</h2>
                <div style={styles.logBox}>
                  {familyLogs.length === 0 && (
                    <div style={{ ...styles.logItem, color: "#ffffff" }}>[等待] 家庭成员信息处理功能区已就绪</div>
                  )}
                  {familyLogs.map((item, index) => (
                    <div
                      key={index}
                      style={{
                        ...styles.logItem,
                        color: item.type === "error" ? "#f87171" : item.type === "success" ? "#4ade80" : "#ffffff",
                      }}
                    >
                      [{item.time}] {item.message}
                    </div>
                  ))}
                  <div ref={familyLogEndRef} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    height: "100vh",
    background: "#f1f5f9",
    padding: 16,
    boxSizing: "border-box",
    overflow: "hidden",
    fontFamily: "Arial, Microsoft YaHei, sans-serif",
  },
  moduleBar: {
    minHeight: 56,
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
    paddingBottom: 8,
    background: "#f1f5f9",
    position: "sticky",
    top: 0,
    zIndex: 20,
  },
  moduleTitle: {
    fontSize: 22,
    fontWeight: 800,
    color: "#1e293b",
    marginRight: 8,
  },
  activeModule: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 14,
    padding: "12px 18px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },
  inactiveModule: {
    background: "#ffffff",
    color: "#1e293b",
    border: "1px solid #cbd5e1",
    borderRadius: 14,
    padding: "12px 18px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },
  disabledModule: {
    background: "#e2e8f0",
    color: "#64748b",
    border: "none",
    borderRadius: 14,
    padding: "12px 18px",
    fontSize: 15,
    cursor: "not-allowed",
  },
  processingWorkspace: {
    height: "calc(100% - 70px)",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
  subModuleBar: {
    display: "flex",
    gap: 10,
    marginBottom: 12,
    flexWrap: "wrap",
    flexShrink: 0,
  },
  activeSubModule: {
    background: "#0f172a",
    color: "#ffffff",
    border: "none",
    borderRadius: 12,
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  inactiveSubModule: {
    background: "#ffffff",
    color: "#334155",
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "58% 42%",
    gap: 16,
    minHeight: 0,
    flex: 1,
  },
  familyLayout: {
    display: "grid",
    gridTemplateColumns: "58% 42%",
    gap: 16,
    minHeight: 0,
    flex: 1,
  },
  databaseLayout: {
    height: "calc(100% - 70px)",
    overflowY: "auto",
  },
  databasePanel: {
    background: "#ffffff",
    borderRadius: 24,
    padding: 24,
    maxWidth: 1180,
    margin: "0 auto",
    boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
  },
  leftPanel: {
    background: "#ffffff",
    borderRadius: 24,
    padding: 24,
    overflowY: "auto",
    boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
  },
  rightPanel: {
    background: "#020617",
    borderRadius: 24,
    padding: 24,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  familyMainPanel: {
    background: "#ffffff",
    borderRadius: 24,
    padding: 24,
    overflowY: "auto",
    boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
  },
  familySidePanel: {
    background: "#020617",
    borderRadius: 24,
    padding: 24,
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
    fontSize: 34,
    margin: 0,
    color: "#1e293b",
  },
  windowBadge: {
    background: "#dbeafe",
    color: "#1d4ed8",
    borderRadius: 999,
    padding: "8px 14px",
    fontSize: 14,
    fontWeight: 700,
  },
  buttonGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 12,
    marginBottom: 16,
  },
  blueButton: button("#2563eb"),
  greenButton: button("#16a34a"),
  orangeButton: button("#f97316"),
  purpleButton: button("#7c3aed"),
  mergeButton: button("#0891b2"),
  status: {
    background: "#020617",
    color: "#4ade80",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    fontSize: 16,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))",
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    background: "#f8fafc",
    borderRadius: 16,
    padding: 16,
    textAlign: "center",
    border: "1px solid #e2e8f0",
  },
  section: {
    background: "#f8fafc",
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
    border: "1px solid #e2e8f0",
  },
  empty: {
    color: "#64748b",
    padding: 12,
  },
  tableWrap: {
    maxHeight: 260,
    overflow: "auto",
    border: "1px solid #cbd5e1",
    borderRadius: 12,
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
    background: "#e2e8f0",
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
    background: "#fee2e2",
    color: "#991b1b",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  logTitle: {
    color: "#4ade80",
    fontSize: 26,
    margin: "0 0 16px 0",
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
    borderRadius: 14,
    padding: "14px 18px",
    fontSize: 16,
    cursor: "pointer",
  };
}


