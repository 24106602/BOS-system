import { useEffect, useMemo, useState, type CSSProperties, type ChangeEventHandler, type DragEvent, type ReactNode, type RefObject } from "react";
import type { DisqualifiedRow, LogItem, ProcessingStats } from "../services/types";
import { ACADEMIC_YEAR_OPTIONS } from "../utils/academicYear";
import {
  DIFFICULTY_STUDENT_TEMPLATE_FIELDS,
  getDifficultyTemplateValue,
} from "../constants/difficultyStudentTemplate";

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
  academicYear: string;
  onAcademicYearChange: (year: string) => void;
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

type ModalType = "import" | "passed" | "failed" | "analysis" | null;

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
  academicYear,
  onAcademicYearChange,
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
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [importFileName, setImportFileName] = useState("");
  const [filters, setFilters] = useState({
    name: "",
    studentId: "",
    idCard: "",
    difficulty: "",
    status: "",
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  const failedRowNumbers = useMemo(
    () => new Set(disqualifiedRows.map((row) => row.rowNumber)),
    [disqualifiedRows]
  );
  const passedRows = useMemo(
    () => processedData.filter((_, index) => !failedRowNumbers.has(index + 1)),
    [failedRowNumbers, processedData]
  );
  const summaryRows = useMemo(() => {
    const terms = Object.values(appliedFilters).map((value) => value.trim()).filter(Boolean);
    return processedData.map((row, index) => {
      const idCard = getDifficultyTemplateValue(row, "身份证号(*)");
      const name = getDifficultyTemplateValue(row, "姓名(*)");
      return {
        row,
        key: `${idCard || name || "row"}::${index}`,
      };
    }).filter(({ row, key }) => {
      if (hiddenKeys.has(key)) return false;
      if (terms.length === 0) return true;
      const rowText = Object.values(row).map((value) => String(value ?? "")).join(" ");
      return terms.every((term) => rowText.includes(term));
    });
  }, [appliedFilters, hiddenKeys, processedData]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelectedKeys(new Set());
      setHiddenKeys(new Set());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [processedData]);

  const hasProcessedRows = processedData.length > 0 && !isProcessing;
  const hasBlockingRows = disqualifiedRows.length > 0 || stats.errors > 0;
  const canConfirm = hasProcessedRows && !reviewConfirmed && !hasBlockingRows;
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

  const handleFileChange: ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.currentTarget.files?.[0];
    if (file) setImportFileName(file.name);
    await uploadData(event);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    await uploadDataFile(file);
  };

  const resetSearch = () => {
    const empty = { name: "", studentId: "", idCard: "", difficulty: "", status: "" };
    setFilters(empty);
    setAppliedFilters(empty);
  };

  const allVisibleSelected =
    summaryRows.length > 0 && summaryRows.every((item) => selectedKeys.has(item.key));

  const toggleAllRows = () => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (allVisibleSelected) summaryRows.forEach((item) => next.delete(item.key));
      else summaryRows.forEach((item) => next.add(item.key));
      return next;
    });
  };

  const toggleRow = (key: string) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const deleteSelectedRows = () => {
    if (selectedKeys.size === 0) return;
    if (!confirm(`确认从当前页面移除已选中的 ${selectedKeys.size} 条数据？此操作不会删除 Supabase 数据。`)) return;
    setHiddenKeys((current) => new Set([...current, ...selectedKeys]));
    setSelectedKeys(new Set());
  };

  return (
    <section className="bos-table-page difficulty-workspace">
      <header className="bos-page-title-row">
        <div>
          <div className="bos-breadcrumb">困难生业务 / 本专科信息 / Student Information</div>
          <h1>困难生数据处理</h1>
          <p>当前处理：本专科信息。保留原 Excel 解析、数据治理、自动修复、名单导出、学院确认和学校端上载逻辑。</p>
        </div>
        <div className="bos-status-row">
          <span className="bos-status-badge">{studentCollegeName}</span>
          {onBackToDifficulty && <button style={pageStyles.backButton} onClick={onBackToDifficulty}>返回业务首页</button>}
        </div>
      </header>

      <div className="difficulty-cockpit-grid">
        <CockpitStat label="治理数据总量" value={stats.total} tone="blue" />
        <CockpitStat label="治理通过" value={passedRows.length} tone="green" />
        <CockpitStat label="不通过" value={disqualifiedRows.length} tone="red" />
        <CockpitStat label="自动修复" value={stats.repaired} tone="amber" />
        <CockpitStat label="当前选中" value={selectedKeys.size} tone="purple" />
      </div>

      <section className="bos-filter-card">
        <div className="bos-filter-grid">
          <label className="bos-filter-field">学年
            <select value={academicYear} onChange={(event) => onAcademicYearChange(event.target.value)}>
              {ACADEMIC_YEAR_OPTIONS.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <label className="bos-filter-field">学院/学部<input value={studentCollegeName} readOnly /></label>
          <label className="bos-filter-field">姓名<input value={filters.name} onChange={(event) => setFilters((current) => ({ ...current, name: event.target.value }))} /></label>
          <label className="bos-filter-field">学号<input value={filters.studentId} onChange={(event) => setFilters((current) => ({ ...current, studentId: event.target.value }))} /></label>
          <label className="bos-filter-field">身份证号<input value={filters.idCard} onChange={(event) => setFilters((current) => ({ ...current, idCard: event.target.value }))} /></label>
          <label className="bos-filter-field">困难等级<input value={filters.difficulty} onChange={(event) => setFilters((current) => ({ ...current, difficulty: event.target.value }))} /></label>
          <label className="bos-filter-field">状态<input value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} /></label>
          <button className="is-primary" onClick={() => setAppliedFilters(filters)}>查询</button>
          <button onClick={resetSearch}>重置</button>
        </div>
      </section>

      <div className="bos-action-toolbar">
        <button className="is-primary" onClick={() => setActiveModal("import")}>数据导入</button>
        <button onClick={() => setAppliedFilters(filters)}>刷新</button>
        <button onClick={() => setActiveModal("passed")}>查看通过数据</button>
        <button onClick={() => setActiveModal("failed")}>查看不通过数据</button>
        <button onClick={() => setActiveModal("analysis")}>问题分析</button>
        <button className="is-purple" onClick={exportExcel}>导出通过名单</button>
        <button className="is-purple" onClick={exportStudentErrorReport}>导出不通过名单</button>
        <button className="is-danger" disabled={selectedKeys.size === 0} onClick={deleteSelectedRows}>
          删除选中（{selectedKeys.size}）
        </button>
        {!hideSubmitAction && (
          <>
            <button className={reviewConfirmed ? "is-success" : "is-warning"} disabled={!canConfirm} onClick={confirmCollegeReview}>
              {reviewConfirmed ? "学院已确认" : "学院确认审核"}
            </button>
            <button
              className={hasProcessedRows && reviewConfirmed && !hasBlockingRows && !uploadedToSchool ? "is-success" : "is-warning"}
              disabled={!hasProcessedRows || !reviewConfirmed || hasBlockingRows || uploadedToSchool}
              onClick={addStudentResultToMergePool}
            >
              {uploadedToSchool ? "已上载学校端" : "上载到学校端"}
            </button>
          </>
        )}
        {onViewDifficultyStudents && <button onClick={onViewDifficultyStudents}>查看困难生明细</button>}
      </div>

      <div className="bos-status-row">
        <span className="bos-status-badge">当前状态：{status}</span>
        <span className={`bos-status-badge${hasBlockingRows ? " is-danger" : " is-success"}`}>学院确认：{reviewStatus}</span>
        <span className="bos-status-badge">总数 {stats.total}</span>
        <span className="bos-status-badge is-success">通过 {passedRows.length}</span>
        <span className={`bos-status-badge${disqualifiedRows.length ? " is-danger" : ""}`}>不通过 {disqualifiedRows.length}</span>
        <span className="bos-status-badge">自动修复 {stats.repaired}</span>
      </div>

      <section className="difficulty-processing-log" aria-label="本专科信息处理日志">
        <strong>处理日志</strong>
        <div>
          {logs.length === 0
            ? "等待导入 Excel"
            : logs.slice(-4).map((item) => `[${item.time}] ${item.message}`).join("　｜　")}
        </div>
      </section>

      <section className="bos-table-card">
        <div className="bos-table-card-head">
          <h2>本专科困难生数据表</h2>
          <span>40 个模板字段 · 显示 {summaryRows.length} / {processedData.length} 条</span>
        </div>
        <div className="bos-table-card-body">
          {summaryRows.length === 0 ? (
            <div style={pageStyles.empty}>暂无处理数据，请点击“数据导入”上传 Excel。</div>
          ) : (
            <DifficultyTemplateTable
              rows={summaryRows}
              selectedKeys={selectedKeys}
              allSelected={allVisibleSelected}
              onToggleAll={toggleAllRows}
              onToggleRow={toggleRow}
            />
          )}
        </div>
        <div className="bos-table-card-foot">
          <span>第 1 页</span>
          <span>当前页最多展示 30 条 · 共 {summaryRows.length} 条</span>
        </div>
      </section>

      {activeModal === "import" && (
        <Modal title="本专科信息数据导入" width="620px" onClose={() => setActiveModal(null)}>
          <div
            style={pageStyles.importDrop}
            onClick={selectFile}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <input ref={dataRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleFileChange} />
            <strong>选择 Excel 文件</strong>
            <span>支持 .xls / .xlsx，支持 A1/A2 表头；选择同一文件也可再次处理。</span>
            <button type="button" style={isProcessing ? pageStyles.disabledButton : pageStyles.blueButton} disabled={isProcessing}>
              {isProcessing ? "正在治理..." : "选择文件并自动治理"}
            </button>
          </div>
          <div style={pageStyles.modalInfoGrid}>
            <Info label="文件名" value={importFileName || "未选择文件"} />
            <Info label="读取状态" value={status} />
            <Info label="识别学院" value={studentCollegeName} />
          </div>
          <div style={pageStyles.modalLogBox}>
            {logs.length === 0 ? <div style={pageStyles.modalMuted}>暂无导入日志</div> : logs.map((item, index) => (
              <div key={`${item.time}_${index}`}>[{item.time}] {item.message}</div>
            ))}
            <div ref={logEndRef} />
          </div>
          <div style={pageStyles.modalFooter}>
            <button style={pageStyles.secondaryButton} onClick={() => setActiveModal(null)}>取消</button>
            <button style={isProcessing ? pageStyles.disabledButton : pageStyles.blueButton} disabled={isProcessing} onClick={selectFile}>开始治理</button>
            <button style={pageStyles.greenButton} onClick={() => setActiveModal(null)}>确认导入/完成</button>
          </div>
        </Modal>
      )}

      {activeModal === "passed" && (
        <ListModal
          title="本专科信息通过数据"
          count={passedRows.length}
          onClose={() => setActiveModal(null)}
          onExport={exportExcel}
        >
          {passedRows.length === 0 ? <div style={pageStyles.empty}>暂无通过数据</div> : renderTable(passedRows)}
        </ListModal>
      )}

      {activeModal === "failed" && (
        <ListModal
          title="本专科信息不通过数据"
          count={disqualifiedRows.length}
          onClose={() => setActiveModal(null)}
          onExport={exportStudentErrorReport}
        >
          {disqualifiedRows.length === 0 ? <div style={pageStyles.empty}>暂无不通过数据</div> : renderTable(disqualifiedRows)}
        </ListModal>
      )}

      {activeModal === "analysis" && (
        <Modal title="本专科信息问题分析" onClose={() => setActiveModal(null)}>
          <div style={pageStyles.analysisGrid}>
            {Object.keys(analysis).length === 0 && disqualifiedRows.length === 0 ? (
              <div style={pageStyles.empty}>暂无问题分析结果</div>
            ) : (
              <>
                {Object.entries(analysis).map(([key, value]) => (
                  <div key={key} style={pageStyles.problemItem}>
                    <strong>{key}</strong>
                    <span>问题数量：{value}</span>
                    <span>严重程度：需核查</span>
                    <span>修改建议：请按模板要求修正该字段后重新导入。</span>
                  </div>
                ))}
                {disqualifiedRows.slice(0, 50).map((row) => (
                  <div key={`${row.rowNumber}_${row.idCard}`} style={pageStyles.problemItem}>
                    <strong>第 {row.rowNumber} 行：{row.name || "未填写姓名"}</strong>
                    <span>身份证号：{row.idCard || "-"}</span>
                    <span>问题原因：{row.reason}</span>
                    <span>严重程度：不通过</span>
                    <span>修改建议：请导出不通过名单，按问题说明修正后重新导入。</span>
                  </div>
                ))}
                {aiReport && (
                  <div style={pageStyles.aiReport}>
                    <strong>DeepSeek 智能分析</strong>
                    <pre style={pageStyles.aiPre}>{aiReport}</pre>
                  </div>
                )}
              </>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}

function CockpitStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "green" | "red" | "amber" | "purple";
}) {
  return (
    <div className={`difficulty-cockpit-card is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DifficultyTemplateTable({
  rows,
  selectedKeys,
  allSelected,
  onToggleAll,
  onToggleRow,
}: {
  rows: Array<{ row: Record<string, unknown>; key: string }>;
  selectedKeys: Set<string>;
  allSelected: boolean;
  onToggleAll: () => void;
  onToggleRow: (key: string) => void;
}) {
  return (
    <div className="difficulty-template-table-scroll">
      <table className="difficulty-template-table">
        <thead>
          <tr>
            <th className="difficulty-checkbox-column">
              <input
                type="checkbox"
                aria-label="选择当前全部数据"
                checked={allSelected}
                onChange={onToggleAll}
              />
            </th>
            {DIFFICULTY_STUDENT_TEMPLATE_FIELDS.map((field) => <th key={field}>{field}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row, key }) => (
            <tr key={key} className={selectedKeys.has(key) ? "is-selected" : ""}>
              <td className="difficulty-checkbox-column">
                <input
                  type="checkbox"
                  aria-label={`选择${getDifficultyTemplateValue(row, "姓名(*)", "该学生")}`}
                  checked={selectedKeys.has(key)}
                  onChange={() => onToggleRow(key)}
                />
              </td>
              {DIFFICULTY_STUDENT_TEMPLATE_FIELDS.map((field) => (
                <td key={field} title={getDifficultyTemplateValue(row, field)}>
                  {getDifficultyTemplateValue(row, field) || "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
    <div className="bos-modal-backdrop">
      <section className={`bos-modal${width === "620px" ? " bos-modal--compact" : ""}`} style={{ width }}>
        <div className="bos-modal-header">
          <h2 style={pageStyles.modalTitle}>{title}</h2>
          <button onClick={onClose}>关闭</button>
        </div>
        <div className="bos-modal-body">{children}</div>
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
  border: "1px solid transparent",
  borderRadius: 6,
  minHeight: 34,
  padding: "8px 11px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
});

const pageStyles: Record<string, CSSProperties> = {
  page: { flex: 1, height: "100%", minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) clamp(280px, 24vw, 350px)", gap: 10, alignItems: "stretch", overflow: "hidden" },
  mainColumn: { height: "100%", display: "grid", gridTemplateRows: "auto auto minmax(0, 1fr)", gap: 10, minWidth: 0, minHeight: 0, overflow: "hidden" },
  card: { background: "#fff", borderRadius: 9, border: "1px solid #d5dee9", padding: 12, boxShadow: "0 2px 10px rgba(15,35,64,0.05)", minWidth: 0, minHeight: 0, boxSizing: "border-box" },
  headerCard: { overflow: "hidden" },
  toolbarCard: { overflow: "hidden" },
  tableCard: { display: "flex", flexDirection: "column", overflow: "hidden" },
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 6 },
  eyebrow: { color: "#1e5aa8", fontSize: 11, fontWeight: 900, marginBottom: 4, letterSpacing: "0.04em" },
  title: { margin: 0, color: "#0f1f33", fontSize: 21 },
  subTitle: { margin: "0 0 3px", color: "#0f1f33", fontSize: 15 },
  description: { color: "#66758a", fontSize: 12, lineHeight: 1.55, margin: "4px 0 0" },
  badge: { padding: "5px 9px", borderRadius: 999, background: "#eff4ff", color: "#1e5aa8", border: "1px solid #cbd9ee", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" },
  backButton: { border: "1px solid #cbd8e6", borderRadius: 6, padding: "8px 11px", background: "#fff", color: "#26364e", fontWeight: 800, cursor: "pointer" },
  sectionTitleBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "0 0 6px", color: "#334155" },
  sectionTitle: { fontSize: 11, fontWeight: 900, letterSpacing: "0.05em" },
  sectionHint: { color: "#94a3b8", fontSize: 10 },
  filterGrid: { display: "grid", gridTemplateColumns: "minmax(220px, 1fr) auto auto auto", gap: 7, alignItems: "end", marginBottom: 8 },
  fieldLabel: { display: "grid", gap: 5, color: "#40526a", fontSize: 12, fontWeight: 800 },
  input: { border: "1px solid #cfd8e3", borderRadius: 6, padding: "7px 9px", color: "#15304f", background: "#fff", fontSize: 12, outline: "none" },
  statusLine: { display: "flex", gap: 10, flexWrap: "wrap", padding: "7px 9px", borderRadius: 6, background: "#f3f7fc", color: "#1e5aa8", border: "1px solid #d6e0ec", fontSize: 11, fontWeight: 800 },
  okText: { color: "#087b5b" },
  warnText: { color: "#9a6700" },
  errorText: { color: "#b42336" },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(90px, 1fr))", gap: 7, marginTop: 7 },
  statCard: { padding: "7px 8px", borderRadius: 6, border: "1px solid #dbe3ec", borderLeft: "3px solid #1e5aa8", background: "#f8fafc", textAlign: "left" },
  statLabel: { color: "#718096", fontSize: 10, marginBottom: 2 },
  statValue: { fontSize: 18 },
  buttonGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 7, marginBottom: 8 },
  tableHeader: { display: "flex", justifyContent: "space-between", gap: 10, flexShrink: 0, marginBottom: 8 },
  tableBody: { flex: 1, minHeight: 0, display: "flex", overflow: "hidden" },
  blueButton: button("#1e5aa8"),
  purpleButton: button("#5d5ab5"),
  greenButton: button("#0a8f68"),
  orangeButton: button("#c77a0a"),
  disabledButton: { ...button("#a6b4c5"), cursor: "not-allowed" },
  secondaryButton: { border: "1px solid #cbd8e6", borderRadius: 6, minHeight: 34, padding: "7px 11px", background: "#fff", color: "#26364e", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" },
  empty: { color: "#8190a4", padding: 18, textAlign: "center", width: "100%" },
  logPanel: { height: "100%", maxHeight: "100%", minHeight: 0, padding: 14, borderRadius: 9, background: "linear-gradient(180deg, #0b1c30 0%, #0a1426 100%)", border: "1px solid #1e3350", overflow: "hidden", display: "flex", flexDirection: "column", boxSizing: "border-box", boxShadow: "0 4px 18px rgba(8,20,40,0.16)" },
  logHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingBottom: 10, borderBottom: "1px solid rgba(148,163,184,0.2)" },
  logTitle: { color: "#e5efff", fontSize: 15, margin: 0 },
  liveBadge: { display: "inline-flex", alignItems: "center", gap: 5, color: "#9fdcc8", fontSize: 10, fontWeight: 800 },
  liveDot: { width: 7, height: 7, borderRadius: "50%", background: "#21d59c", boxShadow: "0 0 0 3px rgba(33,213,156,0.12)" },
  logBox: { flex: 1, minHeight: 0, overflowY: "auto", fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.55, padding: "10px 3px 0 0" },
  logItem: { color: "#fff", whiteSpace: "pre-line", marginBottom: 9 },
  modalBackdrop: { position: "fixed", inset: 0, zIndex: 9999, background: "rgba(11, 28, 48, 0.58)", display: "grid", placeItems: "center", padding: 18, backdropFilter: "blur(2px)" },
  modal: { maxWidth: "96vw", height: "78vh", maxHeight: "820px", minHeight: 420, background: "#fff", borderRadius: 10, border: "1px solid #cbd5e1", boxShadow: "0 28px 90px rgba(15,23,42,0.34)", display: "flex", flexDirection: "column", overflow: "hidden" },
  modalHeader: { flex: "0 0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: "1px solid #d7e1ed", background: "#f8fafc" },
  modalTitle: { margin: 0, color: "#172033", fontSize: 18 },
  closeButton: { border: "1px solid #cbd8e6", borderRadius: 6, padding: "7px 10px", background: "#fff", color: "#26364e", fontWeight: 800, cursor: "pointer" },
  modalBody: { flex: 1, minHeight: 0, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 },
  modalFooter: { position: "sticky", bottom: 0, zIndex: 2, flex: "0 0 auto", display: "flex", justifyContent: "flex-end", gap: 8, padding: "11px 0 0", borderTop: "1px solid #e2e8f0", background: "#fff" },
  modalTableScroll: { flex: 1, minHeight: 280, display: "flex", overflow: "auto", border: "1px solid #d7e1ed", borderRadius: 6 },
  importDrop: { display: "grid", gap: 8, placeItems: "center", textAlign: "center", border: "1px dashed #7faed4", borderRadius: 8, background: "#f7fbff", padding: 20, cursor: "pointer", color: "#40526a" },
  modalInfoGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 },
  infoItem: { display: "grid", gap: 4, padding: 10, border: "1px solid #d7e1ed", borderRadius: 6, background: "#f8fbfe", color: "#63738a", fontSize: 12 },
  modalLogBox: { minHeight: 120, maxHeight: 180, overflow: "auto", padding: 10, borderRadius: 6, background: "#0b1428", color: "#dceafe", fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.6 },
  modalMuted: { color: "#94a3b8" },
  analysisGrid: { display: "grid", gap: 10, overflow: "auto" },
  problemItem: { display: "grid", gap: 5, background: "#fff8e6", color: "#7a4b00", padding: 10, borderRadius: 6, border: "1px solid #fde6a7", fontSize: 13 },
  aiReport: { display: "grid", gap: 8, padding: 12, borderRadius: 8, background: "#f3f9ff", border: "1px solid #cce3f8", color: "#15304f" },
  aiPre: { margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.7, fontFamily: "inherit" },
};
