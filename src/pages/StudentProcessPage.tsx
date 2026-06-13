import { useMemo, useState, type CSSProperties, type ChangeEventHandler, type DragEvent, type ReactNode, type RefObject } from "react";
import type { DisqualifiedRow, LogItem, ProcessingStats } from "../services/types";

type StudentProcessPageProps = {
  dataRef: RefObject<HTMLInputElement | null>;
  uploadData: ChangeEventHandler<HTMLInputElement>;
  uploadDataFile: (file: File) => Promise<void>;
  isProcessing: boolean;
  exportExcel: () => void;
  exportStudentErrorReport: () => void;
  addStudentResultToMergePool: () => void;
  hideSubmitAction?: boolean;
  status: string;
  studentCollegeName: string;
  stats: ProcessingStats;
  renderTable: (rows: Record<string, unknown>[] | DisqualifiedRow[]) => ReactNode;
  processedData: Record<string, unknown>[];
  disqualifiedRows: DisqualifiedRow[];
  analysis: Record<string, number>;
  logs: LogItem[];
  logEndRef: RefObject<HTMLDivElement | null>;
  onBackToDifficulty?: () => void;
};

export default function StudentProcessPage({
  dataRef,
  uploadData,
  uploadDataFile,
  isProcessing,
  exportExcel,
  exportStudentErrorReport,
  addStudentResultToMergePool,
  hideSubmitAction = false,
  status,
  studentCollegeName,
  stats,
  renderTable,
  processedData,
  disqualifiedRows,
  analysis,
  logs,
  logEndRef,
  onBackToDifficulty,
}: StudentProcessPageProps) {
  const [previewMode, setPreviewMode] = useState<"passed" | "failed">("passed");
  const failedRowNumbers = useMemo(
    () => new Set(disqualifiedRows.map((row) => row.rowNumber)),
    [disqualifiedRows]
  );
  const passedRows = useMemo(
    () => processedData.filter((_, index) => !failedRowNumbers.has(index + 1)),
    [failedRowNumbers, processedData]
  );
  const canUpload = processedData.length > 0 && disqualifiedRows.length === 0 && stats.errors === 0 && !isProcessing;

  const selectFile = () => {
    if (!dataRef.current) return;
    dataRef.current.value = "";
    dataRef.current.click();
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) await uploadDataFile(file);
  };

  return (
    <section style={pageStyles.page}>
      <div style={pageStyles.mainColumn}>
        <section style={pageStyles.card}>
          {onBackToDifficulty && (
            <button style={pageStyles.backButton} onClick={onBackToDifficulty}>
              返回业务首页
            </button>
          )}
          <div style={pageStyles.header}>
            <div>
              <div style={pageStyles.eyebrow}>困难生业务 / 学院端数据处理</div>
              <h1 style={pageStyles.title}>困难生本专科信息处理</h1>
              <p style={pageStyles.description}>上传本专科信息表后，系统将自动完成数据检查、修复和名单拆分。</p>
            </div>
            <span style={pageStyles.badge}>自动读取并治理</span>
          </div>

          <div
            style={pageStyles.uploadArea}
            onClick={selectFile}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <input ref={dataRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={uploadData} />
            <div>
              <strong style={pageStyles.uploadTitle}>上传本专科信息 Excel</strong>
              <div style={pageStyles.description}>点击选择或拖拽 Excel 到此处，上传后自动开始治理。</div>
            </div>
            <button
              type="button"
              style={isProcessing ? pageStyles.disabledButton : pageStyles.blueButton}
              disabled={isProcessing}
              onClick={(event) => {
                event.stopPropagation();
                selectFile();
              }}
            >
              {isProcessing ? "处理中..." : "选择 Excel 文件"}
            </button>
          </div>

          <div style={pageStyles.status}>{status}</div>
          <div style={pageStyles.status}>当前识别学部（院）：{studentCollegeName}</div>

          <div style={pageStyles.statsGrid}>
            <Stat label="总数据" value={stats.total} />
            <Stat label="通过人数" value={passedRows.length} tone="#087b5b" />
            <Stat label="不通过人数" value={disqualifiedRows.length} tone="#b42336" />
            <Stat label="自动修复数量" value={stats.repaired} tone="#0f766e" />
          </div>

          <div style={pageStyles.buttonGrid}>
            <button style={pageStyles.purpleButton} onClick={exportExcel}>导出通过名单</button>
            <button style={pageStyles.purpleButton} onClick={exportStudentErrorReport}>导出不通过名单</button>
            {!hideSubmitAction && (
              <button
                style={canUpload ? pageStyles.greenButton : pageStyles.disabledButton}
                disabled={!canUpload}
                onClick={addStudentResultToMergePool}
              >
                上载到学校端
              </button>
            )}
          </div>

          {processedData.length > 0 && disqualifiedRows.length > 0 && (
            <div style={pageStyles.errorStatus}>当前存在不通过项，不能上载到学校端，请导出不通过名单修改后重新处理。</div>
          )}
          {processedData.length > 0 && disqualifiedRows.length === 0 && (
            <div style={pageStyles.successStatus}>当前数据已全部通过，可以上载到学校端。</div>
          )}
        </section>

        <section style={pageStyles.card}>
          <div style={pageStyles.tabs}>
            <button
              style={previewMode === "passed" ? pageStyles.activeTab : pageStyles.tab}
              onClick={() => setPreviewMode("passed")}
            >
              通过数据
            </button>
            <button
              style={previewMode === "failed" ? pageStyles.activeTab : pageStyles.tab}
              onClick={() => setPreviewMode("failed")}
            >
              不通过数据
            </button>
          </div>
          {previewMode === "passed" ? renderTable(passedRows) : renderTable(disqualifiedRows)}
        </section>

        <section style={pageStyles.card}>
          <h2 style={pageStyles.subTitle}>问题分析</h2>
          {Object.keys(analysis).length === 0 ? (
            <div style={pageStyles.empty}>暂无分析结果</div>
          ) : (
            Object.keys(analysis).map((key) => (
              <div key={key} style={pageStyles.problemItem}>{key}：{analysis[key]} 项问题</div>
            ))
          )}
        </section>
      </div>

      <aside style={pageStyles.logPanel}>
        <h2 style={pageStyles.logTitle}>处理日志</h2>
        <div style={pageStyles.logBox}>
          {logs.length === 0 && <div style={pageStyles.logItem}>[等待] 本专科信息处理功能区已就绪</div>}
          {logs.map((item, index) => (
            <div
              key={`${item.time}_${index}`}
              style={{
                ...pageStyles.logItem,
                color: item.type === "error" ? "#f87171" : item.type === "success" ? "#4ade80" : "#ffffff",
              }}
            >
              [{item.time}] {item.message}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </aside>
    </section>
  );
}

function Stat({ label, value, tone = "#0077d4" }: { label: string; value: number; tone?: string }) {
  return (
    <div style={pageStyles.statCard}>
      <div style={pageStyles.statLabel}>{label}</div>
      <strong style={{ ...pageStyles.statValue, color: tone }}>{value}</strong>
    </div>
  );
}

const button = (background: string): CSSProperties => ({
  background,
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
});

const pageStyles: Record<string, CSSProperties> = {
  page: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 34%)", gap: 12, alignItems: "start" },
  mainColumn: { display: "grid", gap: 12, minWidth: 0 },
  card: { background: "#fff", borderRadius: 8, border: "1px solid #d7e1ed", padding: 16, boxShadow: "0 4px 14px rgba(15,35,64,0.05)", minWidth: 0 },
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 },
  eyebrow: { color: "#0077d4", fontSize: 12, fontWeight: 800, marginBottom: 5 },
  title: { margin: 0, color: "#172033", fontSize: 23 },
  subTitle: { margin: "0 0 10px", color: "#172033", fontSize: 17 },
  description: { color: "#63738a", fontSize: 13, lineHeight: 1.7, margin: "7px 0 0" },
  badge: { padding: "6px 9px", borderRadius: 999, background: "#e8f4ff", color: "#0077d4", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" },
  uploadArea: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, border: "1px dashed #a9c7e1", borderRadius: 8, padding: 14, background: "#f8fbfe", marginBottom: 10, cursor: "pointer" },
  uploadTitle: { color: "#26364e", fontSize: 14 },
  buttonGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))", gap: 8, marginTop: 12 },
  blueButton: button("#0077d4"),
  purpleButton: button("#6757c8"),
  greenButton: button("#0b9b6f"),
  disabledButton: { ...button("#a6b4c5"), cursor: "not-allowed" },
  backButton: { border: "1px solid #cbd8e6", borderRadius: 6, padding: "8px 11px", background: "#fff", color: "#26364e", fontWeight: 800, cursor: "pointer", marginBottom: 12 },
  status: { background: "#f3f9ff", color: "#0875bd", border: "1px solid #cce3f8", borderRadius: 6, padding: 9, marginTop: 7, fontSize: 13 },
  errorStatus: { background: "#fff1f2", color: "#b42336", border: "1px solid #ffd4da", borderRadius: 6, padding: 9, marginTop: 10, fontSize: 13, fontWeight: 700 },
  successStatus: { background: "#e9f8f2", color: "#087b5b", border: "1px solid #c7eedf", borderRadius: 6, padding: 9, marginTop: 10, fontSize: 13, fontWeight: 700 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8, marginTop: 12 },
  statCard: { padding: 11, borderRadius: 6, border: "1px solid #dbe5ef", background: "#f8fbfe", textAlign: "center" },
  statLabel: { color: "#63738a", fontSize: 12, marginBottom: 5 },
  statValue: { fontSize: 21 },
  tabs: { display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" },
  tab: { border: "1px solid #d7e1ed", borderRadius: 6, padding: "8px 12px", background: "#fff", color: "#52647b", fontWeight: 800, cursor: "pointer" },
  activeTab: { border: "1px solid #0077d4", borderRadius: 6, padding: "8px 12px", background: "#0077d4", color: "#fff", fontWeight: 800, cursor: "pointer" },
  empty: { color: "#8190a4", padding: 12 },
  problemItem: { background: "#fff1f2", color: "#b42336", padding: 10, borderRadius: 6, marginBottom: 8 },
  logPanel: { position: "sticky", top: 18, padding: 16, borderRadius: 8, background: "#0b1428", overflow: "hidden", maxHeight: "calc(100vh - 36px)" },
  logTitle: { color: "#e5efff", fontSize: 18, margin: "0 0 12px" },
  logBox: { maxHeight: "calc(100vh - 110px)", overflowY: "auto", fontFamily: "Consolas, monospace", fontSize: 13, lineHeight: 1.6 },
  logItem: { color: "#fff", whiteSpace: "pre-line", marginBottom: 10 },
};
