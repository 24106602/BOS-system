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
  confirmCollegeReview: () => void;
  reviewConfirmed: boolean;
  uploadedToSchool: boolean;
  onViewDifficultyStudents?: () => void;
  hideSubmitAction?: boolean;
  status: string;
  studentCollegeName: string;
  stats: ProcessingStats;
  renderTable: (rows: Record<string, unknown>[] | DisqualifiedRow[]) => ReactNode;
  processedData: Record<string, unknown>[];
  disqualifiedRows: DisqualifiedRow[];
  analysis: Record<string, number>;
  logs: LogItem[];
  aiReport: string;
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
  confirmCollegeReview,
  reviewConfirmed,
  uploadedToSchool,
  onViewDifficultyStudents,
  hideSubmitAction = false,
  status,
  studentCollegeName,
  stats,
  renderTable,
  processedData,
  disqualifiedRows,
  analysis,
  aiReport,
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
  const hasProcessedRows = processedData.length > 0 && !isProcessing;
  const hasBlockingRows = disqualifiedRows.length > 0 || stats.errors > 0;
  const canConfirm = hasProcessedRows && !reviewConfirmed;
  const uploadButtonStyle =
    hasProcessedRows && reviewConfirmed && !hasBlockingRows ? pageStyles.greenButton :
    hasProcessedRows ? pageStyles.orangeButton :
    pageStyles.disabledButton;
  const reviewStatus =
    !processedData.length ? "未处理" :
    hasBlockingRows ? "存在不通过数据，禁止确认/上载" :
    uploadedToSchool ? "已上载学校端" :
    reviewConfirmed ? "学院已确认" :
    "已处理，待确认";

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
        <section style={{ ...pageStyles.card, ...pageStyles.actionCard }}>
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
        </section>

        <section style={{ ...pageStyles.card, ...pageStyles.statsCard }}>
          <div style={pageStyles.status}>{status}</div>
          <div style={pageStyles.status}>当前识别学部（院）：{studentCollegeName}</div>
          <div style={reviewConfirmed ? pageStyles.reviewStatusOk : hasBlockingRows ? pageStyles.reviewStatusError : pageStyles.reviewStatus}>
            学院确认状态：{reviewStatus}
          </div>

          <div style={pageStyles.statsGrid}>
            <Stat label="总数据" value={stats.total} />
            <Stat label="通过人数" value={passedRows.length} tone="#087b5b" />
            <Stat label="不通过人数" value={disqualifiedRows.length} tone="#b42336" />
              <Stat label="自动修复数量" value={stats.repaired} tone="#0f766e" />
          </div>
        </section>

        <section style={{ ...pageStyles.card, ...pageStyles.actionBarCard }}>
          <div style={pageStyles.buttonGrid}>
            <button style={pageStyles.purpleButton} onClick={exportExcel}>导出通过名单</button>
            <button style={pageStyles.purpleButton} onClick={exportStudentErrorReport}>导出不通过名单</button>
            {!hideSubmitAction && (
              <>
                <button
                  style={canConfirm ? pageStyles.orangeButton : reviewConfirmed ? pageStyles.greenButton : pageStyles.disabledButton}
                  disabled={!canConfirm}
                  onClick={confirmCollegeReview}
                >
                  {reviewConfirmed ? "已确认，可上载学校端" : "学院确认审核"}
                </button>
                <button
                  style={uploadButtonStyle}
                  disabled={!hasProcessedRows}
                  onClick={addStudentResultToMergePool}
                >
                  上载到学校端
                </button>
              </>
            )}
            {onViewDifficultyStudents && (
              <button style={pageStyles.blueButton} onClick={onViewDifficultyStudents}>
                查看困难生明细
              </button>
            )}
          </div>
        </section>

        <section style={{ ...pageStyles.card, ...pageStyles.noticeCard }}>
          {processedData.length > 0 && disqualifiedRows.length > 0 && (
            <div style={pageStyles.errorStatus}>当前存在不通过项，不能确认审核，也不能上载到学校端，请导出不通过名单修改后重新处理。</div>
          )}
          {processedData.length > 0 && disqualifiedRows.length === 0 && !reviewConfirmed && (
            <div style={pageStyles.successStatus}>当前数据已全部通过，请先完成学院确认审核。</div>
          )}
          {processedData.length > 0 && disqualifiedRows.length === 0 && reviewConfirmed && (
            <div style={pageStyles.successStatus}>学院已确认，可上载学校端。</div>
          )}
        </section>

        <section style={{ ...pageStyles.card, ...pageStyles.previewCard }}>
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

        <section style={{ ...pageStyles.card, ...pageStyles.analysisCard }}>
          <h2 style={pageStyles.subTitle}>问题分析</h2>
          <div style={pageStyles.analysisScroll}>
            {Object.keys(analysis).length === 0 ? (
              <div style={pageStyles.empty}>暂无分析结果</div>
            ) : (
              Object.keys(analysis).map((key) => (
                <div key={key} style={pageStyles.problemItem}>{key}：{analysis[key]} 项问题</div>
              ))
            )}
          </div>
        </section>

         <section style={{ ...pageStyles.card, ...pageStyles.aiCard }}>
           <h2 style={pageStyles.subTitle}>
            DeepSeek 智能分析
           </h2>

           <div
                style={{
                        maxHeight: 220,
                        overflowY: "auto",
                       whiteSpace: "pre-wrap",
                       lineHeight: 1.8,
                        color: "#1f2937"
                       }}
          >
         {aiReport || "等待 AI 分析..."}
         </div>
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
  page: { flex: 1, height: "100%", minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(340px, 420px)", gap: 12, alignItems: "stretch", overflow: "hidden" },
  mainColumn: { height: "100%", display: "flex", flexDirection: "column", gap: 12, minWidth: 0, minHeight: 0, overflowY: "auto", overflowX: "hidden", paddingRight: 4 },
  card: { background: "#fff", borderRadius: 8, border: "1px solid #d7e1ed", padding: 14, boxShadow: "0 4px 14px rgba(15,35,64,0.05)", minWidth: 0, minHeight: 0, boxSizing: "border-box" },
  actionCard: { overflow: "visible", flex: "0 0 auto" },
  statsCard: { overflow: "visible", flex: "0 0 auto" },
  actionBarCard: { overflow: "visible", flex: "0 0 auto", position: "sticky", top: 0, zIndex: 5 },
  noticeCard: { overflow: "visible", flex: "0 0 auto", padding: 10 },
  previewCard: { display: "flex", flexDirection: "column", overflow: "hidden", flex: "0 0 clamp(280px, 38vh, 360px)", minHeight: 280, maxHeight: 360 },
  analysisCard: { display: "flex", flexDirection: "column", overflow: "hidden", flex: "0 0 clamp(160px, 22vh, 220px)", minHeight: 160, maxHeight: 220 },
  aiCard: { display: "flex", flexDirection: "column", overflow: "hidden", flex: "0 0 clamp(160px, 22vh, 220px)", minHeight: 160, maxHeight: 220 },
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 },
  eyebrow: { color: "#0077d4", fontSize: 12, fontWeight: 800, marginBottom: 5 },
  title: { margin: 0, color: "#172033", fontSize: 23 },
  subTitle: { margin: "0 0 10px", color: "#172033", fontSize: 17 },
  description: { color: "#63738a", fontSize: 13, lineHeight: 1.7, margin: "7px 0 0" },
  badge: { padding: "6px 9px", borderRadius: 999, background: "#e8f4ff", color: "#0077d4", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" },
  uploadArea: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, border: "1px dashed #a9c7e1", borderRadius: 8, padding: 12, background: "#f8fbfe", marginBottom: 8, cursor: "pointer" },
  uploadTitle: { color: "#26364e", fontSize: 14 },
  buttonGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))", gap: 8, margin: 0, alignItems: "stretch" },
  blueButton: button("#0077d4"),
  purpleButton: button("#6757c8"),
  greenButton: button("#0b9b6f"),
  orangeButton: button("#d78a14"),
  disabledButton: { ...button("#a6b4c5"), cursor: "not-allowed" },
  backButton: { border: "1px solid #cbd8e6", borderRadius: 6, padding: "8px 11px", background: "#fff", color: "#26364e", fontWeight: 800, cursor: "pointer", marginBottom: 12 },
  status: { background: "#f3f9ff", color: "#0875bd", border: "1px solid #cce3f8", borderRadius: 6, padding: 8, marginTop: 6, fontSize: 12 },
  reviewStatus: { background: "#fff8e6", color: "#9a6700", border: "1px solid #fde6a7", borderRadius: 6, padding: 8, marginTop: 6, fontSize: 12, fontWeight: 800 },
  reviewStatusOk: { background: "#e9f8f2", color: "#087b5b", border: "1px solid #c7eedf", borderRadius: 6, padding: 8, marginTop: 6, fontSize: 12, fontWeight: 800 },
  reviewStatusError: { background: "#fff1f2", color: "#b42336", border: "1px solid #ffd4da", borderRadius: 6, padding: 8, marginTop: 6, fontSize: 12, fontWeight: 800 },
  errorStatus: { background: "#fff1f2", color: "#b42336", border: "1px solid #ffd4da", borderRadius: 6, padding: 8, marginTop: 8, fontSize: 12, fontWeight: 700 },
  successStatus: { background: "#e9f8f2", color: "#087b5b", border: "1px solid #c7eedf", borderRadius: 6, padding: 8, marginTop: 8, fontSize: 12, fontWeight: 700 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8, marginTop: 10 },
  statCard: { padding: 9, borderRadius: 6, border: "1px solid #dbe5ef", background: "#f8fbfe", textAlign: "center" },
  statLabel: { color: "#63738a", fontSize: 12, marginBottom: 5 },
  statValue: { fontSize: 21 },
  tabs: { display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", flexShrink: 0 },
  tab: { border: "1px solid #d7e1ed", borderRadius: 6, padding: "8px 12px", background: "#fff", color: "#52647b", fontWeight: 800, cursor: "pointer" },
  activeTab: { border: "1px solid #0077d4", borderRadius: 6, padding: "8px 12px", background: "#0077d4", color: "#fff", fontWeight: 800, cursor: "pointer" },
  empty: { color: "#8190a4", padding: 12 },
  analysisScroll: { minHeight: 0, overflow: "auto", paddingRight: 4 },
  problemItem: { background: "#fff1f2", color: "#b42336", padding: 10, borderRadius: 6, marginBottom: 8 },
  logPanel: { height: "100%", maxHeight: "100%", minHeight: 0, padding: 16, borderRadius: 8, background: "#0b1428", overflow: "hidden", display: "flex", flexDirection: "column", boxSizing: "border-box" },
  logTitle: { color: "#e5efff", fontSize: 18, margin: "0 0 12px" },
  logBox: { flex: 1, minHeight: 0, overflowY: "auto", fontFamily: "Consolas, monospace", fontSize: 13, lineHeight: 1.6, paddingRight: 4 },
  logItem: { color: "#fff", whiteSpace: "pre-line", marginBottom: 10 },
};
