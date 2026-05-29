import type { CSSProperties, ChangeEventHandler, ReactNode, RefObject } from "react";
import { makeSourcePreview } from "../services/templateParser";
import type { DisqualifiedRow, LogItem, ProcessingStats } from "../services/types";

type StudentProcessPageProps = {
  styles: Record<string, CSSProperties>;
  templateRef: RefObject<HTMLInputElement | null>;
  dataRef: RefObject<HTMLInputElement | null>;
  uploadTemplate: ChangeEventHandler<HTMLInputElement>;
  uploadData: ChangeEventHandler<HTMLInputElement>;
  isProcessing: boolean;
  processData: () => void;
  exportExcel: () => void;
  exportStudentErrorReport: () => void;
  addStudentResultToMergePool: () => void;
  status: string;
  studentCollegeName: string;
  stats: ProcessingStats;
  renderTemplatePreview: () => ReactNode;
  renderTable: (rows: Record<string, unknown>[] | DisqualifiedRow[]) => ReactNode;
  sourceRows: unknown[][];
  templateFields: string[];
  processedData: Record<string, unknown>[];
  disqualifiedRows: DisqualifiedRow[];
  analysis: Record<string, number>;
  logs: LogItem[];
  logEndRef: RefObject<HTMLDivElement | null>;
};

export default function StudentProcessPage({
  styles,
  templateRef,
  dataRef,
  uploadTemplate,
  uploadData,
  isProcessing,
  processData,
  exportExcel,
  exportStudentErrorReport,
  addStudentResultToMergePool,
  status,
  studentCollegeName,
  stats,
  renderTemplatePreview,
  renderTable,
  sourceRows,
  templateFields,
  processedData,
  disqualifiedRows,
  analysis,
  logs,
  logEndRef,
}: StudentProcessPageProps) {
  return (
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
  );
}

