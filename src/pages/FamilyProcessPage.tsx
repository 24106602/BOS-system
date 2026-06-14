import { useMemo, useState, type CSSProperties, type ChangeEventHandler, type DragEvent, type ReactNode, type RefObject } from "react";
import type { FamilyProcessingStats, FamilyReviewRow, LogItem } from "../services/types";

type FamilyProcessPageProps = {
  familyDataRef: RefObject<HTMLInputElement | null>;
  uploadFamilyData: ChangeEventHandler<HTMLInputElement>;
  uploadFamilyDataFile: (file: File) => Promise<void>;
  isFamilyProcessing: boolean;
  exportFamilyResult: () => void;
  exportFamilyErrorReport: () => void;
  addFamilyResultToMergePool: () => void;
  confirmCollegeReview: () => void;
  reviewConfirmed: boolean;
  uploadedToSchool: boolean;
  onViewDifficultyStudents?: () => void;
  hideSubmitAction?: boolean;
  familyStatus: string;
  familyCollegeName: string;
  familyStats: FamilyProcessingStats;
  renderTable: (rows: Record<string, unknown>[] | FamilyReviewRow[]) => ReactNode;
  familyProcessedData: Record<string, unknown>[];
  familyReviewRows: FamilyReviewRow[];
  familyAnalysis: Record<string, number>;
  familyLogs: LogItem[];
  familyLogEndRef: RefObject<HTMLDivElement | null>;
  onBackToDifficulty?: () => void;
};

type ModalType = "import" | "passed" | "failed" | "analysis" | null;

export default function FamilyProcessPage({
  familyDataRef,
  uploadFamilyData,
  uploadFamilyDataFile,
  isFamilyProcessing,
  exportFamilyResult,
  exportFamilyErrorReport,
  addFamilyResultToMergePool,
  confirmCollegeReview,
  reviewConfirmed,
  uploadedToSchool,
  onViewDifficultyStudents,
  hideSubmitAction = false,
  familyStatus,
  familyCollegeName,
  familyStats,
  renderTable,
  familyProcessedData,
  familyReviewRows,
  familyAnalysis,
  familyLogs,
  familyLogEndRef,
  onBackToDifficulty,
}: FamilyProcessPageProps) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [importFileName, setImportFileName] = useState("");
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");

  const failedRowNumbers = useMemo(
    () => new Set(familyReviewRows.map((row) => row.rowNumber)),
    [familyReviewRows]
  );
  const passedRows = useMemo(
    () => familyProcessedData.filter((_, index) => !failedRowNumbers.has(index + 1)),
    [failedRowNumbers, familyProcessedData]
  );
  const summaryRows = useMemo(() => {
    const key = appliedKeyword.trim();
    if (!key) return familyProcessedData;
    return familyProcessedData.filter((row) => Object.values(row).some((value) => String(value ?? "").includes(key)));
  }, [appliedKeyword, familyProcessedData]);

  const hasProcessedRows = familyProcessedData.length > 0 && !isFamilyProcessing;
  const hasBlockingRows = familyReviewRows.length > 0 || familyStats.errors > 0;
  const canConfirm = hasProcessedRows && !reviewConfirmed && !hasBlockingRows;
  const uploadButtonStyle =
    hasProcessedRows && reviewConfirmed && !hasBlockingRows ? pageStyles.greenButton :
    hasProcessedRows ? pageStyles.orangeButton :
    pageStyles.disabledButton;
  const reviewStatus =
    !familyProcessedData.length ? "未处理" :
    hasBlockingRows ? "存在不通过数据，禁止确认/上载" :
    uploadedToSchool ? "已上载学校端" :
    reviewConfirmed ? "学院已确认" :
    "已处理，待确认";

  const selectFile = () => {
    if (!familyDataRef.current) return;
    familyDataRef.current.value = "";
    familyDataRef.current.click();
  };

  const handleFileChange: ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.currentTarget.files?.[0];
    if (file) setImportFileName(file.name);
    await uploadFamilyData(event);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    await uploadFamilyDataFile(file);
  };

  const resetSearch = () => {
    setKeyword("");
    setAppliedKeyword("");
  };

  return (
    <section style={pageStyles.page}>
      <div style={pageStyles.mainColumn}>
        <section style={{ ...pageStyles.card, ...pageStyles.headerCard }}>
          <div style={pageStyles.header}>
            <div>
              <div style={pageStyles.eyebrow}>困难生业务 / 学院端数据处理</div>
              <h1 style={pageStyles.title}>困难生家庭成员信息处理</h1>
              <p style={pageStyles.description}>主页面保留查询、统计和操作入口，Excel 导入、名单查看和问题分析均在弹窗中完成，避免长表格撑开页面。</p>
            </div>
            <span style={pageStyles.badge}>当前学部（院）：{familyCollegeName}</span>
          </div>
          {onBackToDifficulty && (
            <button style={pageStyles.backButton} onClick={onBackToDifficulty}>返回业务首页</button>
          )}
        </section>

        <section style={{ ...pageStyles.card, ...pageStyles.toolbarCard }}>
          <div style={pageStyles.filterGrid}>
            <label style={pageStyles.fieldLabel}>
              关键词
              <input
                style={pageStyles.input}
                value={keyword}
                placeholder="学生姓名 / 学号 / 身份证号 / 家庭成员"
                onChange={(event) => setKeyword(event.target.value)}
              />
            </label>
            <button style={pageStyles.secondaryButton} onClick={() => setAppliedKeyword(keyword.trim())}>查询</button>
            <button style={pageStyles.secondaryButton} onClick={resetSearch}>重置</button>
            <button style={pageStyles.secondaryButton} onClick={() => setAppliedKeyword(keyword.trim())}>刷新</button>
          </div>

          <div style={pageStyles.statusLine}>
            <span>当前状态：{familyStatus}</span>
            <span>学院确认：{reviewStatus}</span>
            {familyProcessedData.length > 0 && hasBlockingRows && <span style={pageStyles.errorText}>存在不通过数据，禁止确认/上载</span>}
            {familyProcessedData.length > 0 && !hasBlockingRows && !reviewConfirmed && <span style={pageStyles.warnText}>请先完成学院确认审核后再上载学校端</span>}
            {familyProcessedData.length > 0 && !hasBlockingRows && reviewConfirmed && <span style={pageStyles.okText}>学院已确认，可上载学校端</span>}
          </div>

          <div style={pageStyles.statsGrid}>
            <Stat label="总人数" value={familyStats.total} />
            <Stat label="通过人数" value={passedRows.length} tone="#087b5b" />
            <Stat label="不通过人数" value={familyReviewRows.length} tone="#b42336" />
            <Stat label="自动修复项" value={familyStats.repaired} tone="#0f766e" />
          </div>

          <div style={pageStyles.buttonGrid}>
            <button style={pageStyles.blueButton} onClick={() => setActiveModal("import")}>数据导入</button>
            <button style={pageStyles.blueButton} onClick={() => setActiveModal("passed")}>查看通过数据</button>
            <button style={pageStyles.blueButton} onClick={() => setActiveModal("failed")}>查看不通过数据</button>
            <button style={pageStyles.blueButton} onClick={() => setActiveModal("analysis")}>查看问题分析</button>
            <button style={pageStyles.purpleButton} onClick={exportFamilyResult}>导出通过名单</button>
            <button style={pageStyles.purpleButton} onClick={exportFamilyErrorReport}>导出不通过名单</button>
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
                  onClick={addFamilyResultToMergePool}
                >
                  上载到学校端
                </button>
              </>
            )}
            {onViewDifficultyStudents && (
              <button style={pageStyles.secondaryButton} onClick={onViewDifficultyStudents}>查看困难生明细</button>
            )}
          </div>
        </section>

        <section style={{ ...pageStyles.card, ...pageStyles.tableCard }}>
          <div style={pageStyles.tableHeader}>
            <div>
              <h2 style={pageStyles.subTitle}>当前数据表格摘要</h2>
              <p style={pageStyles.description}>显示 {summaryRows.length} / {familyProcessedData.length} 条处理结果。完整通过名单和不通过名单请通过弹窗查看。</p>
            </div>
          </div>
          <div style={pageStyles.tableBody}>
            {summaryRows.length === 0 ? <div style={pageStyles.empty}>暂无处理数据，请点击“数据导入”上传 Excel。</div> : renderTable(summaryRows)}
          </div>
        </section>
      </div>

      <aside style={pageStyles.logPanel}>
        <h2 style={pageStyles.logTitle}>处理日志</h2>
        <div style={pageStyles.logBox}>
          {familyLogs.length === 0 && <div style={pageStyles.logItem}>[等待] 家庭成员信息处理功能区已就绪</div>}
          {familyLogs.map((item, index) => (
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
          <div ref={familyLogEndRef} />
        </div>
      </aside>

      {activeModal === "import" && (
        <Modal title="家庭成员信息数据导入" width="620px" onClose={() => setActiveModal(null)}>
          <div
            style={pageStyles.importDrop}
            onClick={selectFile}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <input ref={familyDataRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleFileChange} />
            <strong>选择 Excel 文件</strong>
            <span>支持 .xls / .xlsx，支持 A1/A2 表头；选择同一文件也可再次处理。</span>
            <button type="button" style={isFamilyProcessing ? pageStyles.disabledButton : pageStyles.blueButton} disabled={isFamilyProcessing}>
              {isFamilyProcessing ? "正在治理..." : "选择文件并自动治理"}
            </button>
          </div>
          <div style={pageStyles.modalInfoGrid}>
            <Info label="文件名" value={importFileName || "未选择文件"} />
            <Info label="读取状态" value={familyStatus} />
            <Info label="识别学院" value={familyCollegeName} />
          </div>
          <div style={pageStyles.modalLogBox}>
            {familyLogs.length === 0 ? <div style={pageStyles.modalMuted}>暂无导入日志</div> : familyLogs.map((item, index) => (
              <div key={`${item.time}_${index}`}>[{item.time}] {item.message}</div>
            ))}
          </div>
          <div style={pageStyles.modalFooter}>
            <button style={pageStyles.secondaryButton} onClick={() => setActiveModal(null)}>取消</button>
            <button style={isFamilyProcessing ? pageStyles.disabledButton : pageStyles.blueButton} disabled={isFamilyProcessing} onClick={selectFile}>开始治理</button>
            <button style={pageStyles.greenButton} onClick={() => setActiveModal(null)}>确认导入/完成</button>
          </div>
        </Modal>
      )}

      {activeModal === "passed" && (
        <ListModal
          title="家庭成员信息通过数据"
          count={passedRows.length}
          onClose={() => setActiveModal(null)}
          onExport={exportFamilyResult}
        >
          {passedRows.length === 0 ? <div style={pageStyles.empty}>暂无通过数据</div> : renderTable(passedRows)}
        </ListModal>
      )}

      {activeModal === "failed" && (
        <ListModal
          title="家庭成员信息不通过数据"
          count={familyReviewRows.length}
          onClose={() => setActiveModal(null)}
          onExport={exportFamilyErrorReport}
        >
          {familyReviewRows.length === 0 ? <div style={pageStyles.empty}>暂无不通过数据</div> : renderTable(familyReviewRows)}
        </ListModal>
      )}

      {activeModal === "analysis" && (
        <Modal title="家庭成员信息问题分析" onClose={() => setActiveModal(null)}>
          <div style={pageStyles.analysisGrid}>
            {Object.keys(familyAnalysis).length === 0 && familyReviewRows.length === 0 ? (
              <div style={pageStyles.empty}>暂无问题分析结果</div>
            ) : (
              <>
                {Object.entries(familyAnalysis).map(([key, value]) => (
                  <div key={key} style={pageStyles.problemItem}>
                    <strong>{key}</strong>
                    <span>问题数量：{value}</span>
                    <span>严重程度：需核查</span>
                    <span>修改建议：请按模板要求修正该字段后重新导入。</span>
                  </div>
                ))}
                {familyReviewRows.slice(0, 50).map((row) => (
                  <div key={`${row.rowNumber}_${row.studentId}_${row.memberName}`} style={pageStyles.problemItem}>
                    <strong>第 {row.rowNumber} 行：{row.memberName || "未填写家庭成员姓名"}</strong>
                    <span>学生学号：{row.studentId || "-"}</span>
                    <span>关系：{row.relation || "-"}</span>
                    <span>问题原因：{row.reason}</span>
                    <span>严重程度：不通过</span>
                    <span>修改建议：请导出不通过名单，按问题说明修正后重新导入。</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </Modal>
      )}
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={pageStyles.infoItem}>
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

function Modal({ title, width = "80vw", children, onClose }: { title: string; width?: string; children: ReactNode; onClose: () => void }) {
  return (
    <div style={pageStyles.modalBackdrop}>
      <section style={{ ...pageStyles.modal, width }}>
        <div style={pageStyles.modalHeader}>
          <h2 style={pageStyles.modalTitle}>{title}</h2>
          <button style={pageStyles.closeButton} onClick={onClose}>关闭</button>
        </div>
        <div style={pageStyles.modalBody}>{children}</div>
      </section>
    </div>
  );
}

function ListModal({
  title,
  count,
  children,
  onExport,
  onClose,
}: {
  title: string;
  count: number;
  children: ReactNode;
  onExport: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={`${title}（${count} 条）`} onClose={onClose}>
      <div style={pageStyles.modalTableScroll}>{children}</div>
      <div style={pageStyles.modalFooter}>
        <button style={pageStyles.purpleButton} onClick={onExport}>导出当前名单</button>
        <button style={pageStyles.secondaryButton} onClick={onClose}>关闭</button>
      </div>
    </Modal>
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
  mainColumn: { height: "100%", display: "grid", gridTemplateRows: "auto auto minmax(0, 1fr)", gap: 12, minWidth: 0, minHeight: 0, overflow: "hidden" },
  card: { background: "#fff", borderRadius: 8, border: "1px solid #d7e1ed", padding: 14, boxShadow: "0 4px 14px rgba(15,35,64,0.05)", minWidth: 0, minHeight: 0, boxSizing: "border-box" },
  headerCard: { overflow: "hidden" },
  toolbarCard: { overflow: "hidden" },
  tableCard: { display: "flex", flexDirection: "column", overflow: "hidden" },
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 },
  eyebrow: { color: "#0077d4", fontSize: 12, fontWeight: 800, marginBottom: 5 },
  title: { margin: 0, color: "#172033", fontSize: 23 },
  subTitle: { margin: "0 0 4px", color: "#172033", fontSize: 17 },
  description: { color: "#63738a", fontSize: 13, lineHeight: 1.7, margin: "5px 0 0" },
  badge: { padding: "6px 9px", borderRadius: 999, background: "#e8f4ff", color: "#0077d4", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" },
  backButton: { border: "1px solid #cbd8e6", borderRadius: 6, padding: "8px 11px", background: "#fff", color: "#26364e", fontWeight: 800, cursor: "pointer" },
  filterGrid: { display: "grid", gridTemplateColumns: "minmax(220px, 1fr) auto auto auto", gap: 8, alignItems: "end", marginBottom: 10 },
  fieldLabel: { display: "grid", gap: 5, color: "#40526a", fontSize: 12, fontWeight: 800 },
  input: { border: "1px solid #cfdbe7", borderRadius: 6, padding: "8px 9px", color: "#15304f", background: "#fff", fontSize: 13 },
  statusLine: { display: "flex", gap: 10, flexWrap: "wrap", padding: 8, borderRadius: 6, background: "#f3f9ff", color: "#0875bd", border: "1px solid #cce3f8", fontSize: 12, fontWeight: 700 },
  okText: { color: "#087b5b" },
  warnText: { color: "#9a6700" },
  errorText: { color: "#b42336" },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(90px, 1fr))", gap: 8, marginTop: 10 },
  statCard: { padding: 9, borderRadius: 6, border: "1px solid #dbe5ef", background: "#f8fbfe", textAlign: "center" },
  statLabel: { color: "#63738a", fontSize: 12, marginBottom: 5 },
  statValue: { fontSize: 20 },
  buttonGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))", gap: 8, marginTop: 10 },
  tableHeader: { display: "flex", justifyContent: "space-between", gap: 10, flexShrink: 0, marginBottom: 8 },
  tableBody: { flex: 1, minHeight: 0, display: "flex", overflow: "hidden" },
  blueButton: button("#0077d4"),
  purpleButton: button("#6757c8"),
  greenButton: button("#0b9b6f"),
  orangeButton: button("#d78a14"),
  disabledButton: { ...button("#a6b4c5"), cursor: "not-allowed" },
  secondaryButton: { border: "1px solid #cbd8e6", borderRadius: 6, padding: "9px 12px", background: "#fff", color: "#26364e", fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" },
  empty: { color: "#8190a4", padding: 18, textAlign: "center", width: "100%" },
  logPanel: { height: "100%", maxHeight: "100%", minHeight: 0, padding: 16, borderRadius: 8, background: "#0b1428", overflow: "hidden", display: "flex", flexDirection: "column", boxSizing: "border-box" },
  logTitle: { color: "#e5efff", fontSize: 18, margin: "0 0 12px" },
  logBox: { flex: 1, minHeight: 0, overflowY: "auto", fontFamily: "Consolas, monospace", fontSize: 13, lineHeight: 1.6, paddingRight: 4 },
  logItem: { color: "#fff", whiteSpace: "pre-line", marginBottom: 10 },
  modalBackdrop: { position: "fixed", inset: 0, zIndex: 9999, background: "rgba(15, 23, 42, 0.45)", display: "grid", placeItems: "center", padding: 18 },
  modal: { maxWidth: "96vw", height: "70vh", maxHeight: "760px", minHeight: 420, background: "#fff", borderRadius: 10, boxShadow: "0 24px 80px rgba(15,23,42,0.28)", display: "flex", flexDirection: "column", overflow: "hidden" },
  modalHeader: { flex: "0 0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "1px solid #d7e1ed" },
  modalTitle: { margin: 0, color: "#172033", fontSize: 18 },
  closeButton: { border: "1px solid #cbd8e6", borderRadius: 6, padding: "7px 10px", background: "#fff", color: "#26364e", fontWeight: 800, cursor: "pointer" },
  modalBody: { flex: 1, minHeight: 0, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 },
  modalFooter: { flex: "0 0 auto", display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 10, borderTop: "1px solid #eef2f7" },
  modalTableScroll: { height: "calc(70vh - 120px)", minHeight: 300, display: "flex", overflow: "auto" },
  importDrop: { display: "grid", gap: 8, placeItems: "center", textAlign: "center", border: "1px dashed #9fc7e6", borderRadius: 8, background: "#f8fbfe", padding: 20, cursor: "pointer", color: "#40526a" },
  modalInfoGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 },
  infoItem: { display: "grid", gap: 4, padding: 10, border: "1px solid #d7e1ed", borderRadius: 6, background: "#f8fbfe", color: "#63738a", fontSize: 12 },
  modalLogBox: { minHeight: 120, maxHeight: 180, overflow: "auto", padding: 10, borderRadius: 6, background: "#0b1428", color: "#dceafe", fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.6 },
  modalMuted: { color: "#94a3b8" },
  analysisGrid: { display: "grid", gap: 10, overflow: "auto" },
  problemItem: { display: "grid", gap: 5, background: "#fff8e6", color: "#7a4b00", padding: 10, borderRadius: 6, border: "1px solid #fde6a7", fontSize: 13 },
};
