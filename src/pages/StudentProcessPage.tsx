import { useState, type CSSProperties, type ChangeEventHandler, type DragEvent, type ReactNode, type RefObject } from "react";
import type {
  DataTemplateValidationResult,
  DisqualifiedRow,
  LogItem,
  ProcessingStats,
  TemplateValidationResult,
} from "../services/types";
import {
  DIFFICULTY_STUDENT_TEMPLATE_FIELDS,
  getDifficultyTemplateValue,
} from "../constants/difficultyStudentTemplate";
import AdminCard from "../components/ui/AdminCard";
import PageHeader from "../components/ui/PageHeader";
import StatCard from "../components/ui/StatCard";
import Toolbar from "../components/ui/Toolbar";

type StudentProcessPageProps = {
  templateRef: RefObject<HTMLInputElement | null>;
  dataRef: RefObject<HTMLInputElement | null>;
  uploadData: ChangeEventHandler<HTMLInputElement>;
  uploadTemplateFile: (file: File) => Promise<void>;
  uploadDataFile: (file: File) => Promise<void>;
  startProcessing: () => Promise<void>;
  templateInfo: TemplateValidationResult | null;
  dataTemplateCheck: DataTemplateValidationResult | null;
  isProcessing: boolean;
  exportExcel: () => void;
  exportStudentErrorReport: () => void;
  addStudentResultToMergePool: () => void;
  confirmCollegeReview: () => void;
  reviewConfirmed: boolean;
  uploadedToSchool: boolean;
  onBackToDifficulty?: () => void;
  status: string;
  academicYear: string;
  onAcademicYearChange: (year: string) => void;
  studentCollegeName: string;
  stats: ProcessingStats;
  renderTable: (rows: Record<string, unknown>[] | DisqualifiedRow[]) => ReactNode;
  processedData: Record<string, unknown>[];
  disqualifiedRows: DisqualifiedRow[];
  logs: LogItem[];
  logEndRef: RefObject<HTMLDivElement | null>;
};

type ModalType = "import" | "passed" | "failed" | null;

export default function StudentProcessPage({
  templateRef,
  dataRef,
  uploadData,
  uploadTemplateFile,
  uploadDataFile,
  startProcessing,
  templateInfo,
  dataTemplateCheck,
  isProcessing,
  exportExcel,
  exportStudentErrorReport,
  addStudentResultToMergePool,
  confirmCollegeReview,
  reviewConfirmed,
  uploadedToSchool,
  onBackToDifficulty,
  status,
  academicYear,
  onAcademicYearChange,
  studentCollegeName,
  stats,
  renderTable,
  processedData,
  disqualifiedRows,
  logs,
  logEndRef,
}: StudentProcessPageProps) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [templateFileName, setTemplateFileName] = useState("");
  const [importFileName, setImportFileName] = useState("");

  const failedRowNumbers = new Set(disqualifiedRows.map((row) => row.rowNumber));
  const passedRows = processedData.filter((_, index) => !failedRowNumbers.has(index + 1));

  const hasProcessedRows = processedData.length > 0 && !isProcessing;
  const hasBlockingRows = disqualifiedRows.length > 0 || stats.errors > 0;
  const canConfirm = hasProcessedRows && !reviewConfirmed && !hasBlockingRows;
  const reviewStatus =
    !processedData.length ? "未处理" :
    hasBlockingRows ? "存在不通过数据，禁止确认/上载" :
    uploadedToSchool ? "已上载学校端" :
    reviewConfirmed ? "学院已确认" :
    "已处理，待确认";

  const canUploadData = Boolean(templateInfo?.ok) && !isProcessing;
  const canStartProcessing = Boolean(templateInfo?.ok && dataTemplateCheck?.ok) && !isProcessing;
  const templateStatusText = !templateInfo
    ? "未上传"
    : templateInfo.ok
    ? `已识别：匹配字段 ${templateInfo.matchedFieldCount} 个，核心字段 ${templateInfo.coreMatchedCount} 个`
    : `识别失败：${templateInfo.errors[0] || "模板不符合要求"}`;
  const dataStatusText = !dataTemplateCheck
    ? "未上传"
    : dataTemplateCheck.ok
    ? `与模板匹配：匹配率 ${(dataTemplateCheck.matchRate * 100).toFixed(1)}%`
    : `与模板不匹配：${dataTemplateCheck.errors[0] || "数据表格式错误"}`;

  const selectTemplateFile = () => {
    if (!templateRef.current || isProcessing) return;
    templateRef.current.value = "";
    templateRef.current.click();
  };

  const selectFile = () => {
    if (!templateInfo?.ok) {
      alert("必须先上传并通过校验的困难生本专科模板表。");
      return;
    }
    if (!dataRef.current) return;
    dataRef.current.value = "";
    dataRef.current.click();
  };

  const handleTemplateFileChange: ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setTemplateFileName(file.name);
    setImportFileName("");
    await uploadTemplateFile(file);
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

  const handleTemplateDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    setTemplateFileName(file.name);
    setImportFileName("");
    await uploadTemplateFile(file);
  };

  return (
    <section className="bos-table-page difficulty-workspace">
      <PageHeader
        breadcrumb="困难生业务 / 本专科信息"
        title="困难生本专科信息处理"
        description="上传模板表与数据表，完成格式校验、自动修复和学院上载。"
        actions={(
          <div className="bos-status-row">
          <span className="bos-status-badge">{studentCollegeName}</span>
          {onBackToDifficulty && <button className="bos-button" onClick={onBackToDifficulty}>返回业务首页</button>}
          </div>
        )}
      />

      <AdminCard
        className="difficulty-upload-overview"
        title="文件上传与模板校验"
        description="必须先识别困难生模板表，再校验同格式数据表；两步均通过后才可开始处理。"
        extra={<button className="bos-button is-primary" onClick={() => setActiveModal("import")}>导入数据</button>}
      >
        <div className="difficulty-upload-steps">
          <div className={`difficulty-upload-step${templateInfo?.ok ? " is-success" : templateInfo ? " is-error" : ""}`}>
            <span>1</span>
            <div><strong>模板表</strong><small>{templateStatusText}</small></div>
          </div>
          <div className={`difficulty-upload-step${dataTemplateCheck?.ok ? " is-success" : dataTemplateCheck ? " is-error" : ""}`}>
            <span>2</span>
            <div><strong>数据表</strong><small>{dataStatusText}</small></div>
          </div>
          <button
            className="bos-button is-primary"
            disabled={!canStartProcessing}
            onClick={() => void startProcessing()}
          >
            {isProcessing ? "正在处理..." : "开始处理"}
          </button>
        </div>
      </AdminCard>

      <div className="bos-stat-grid">
        <StatCard label="数据总量" value={stats.total} />
        <StatCard label="通过人数" value={passedRows.length} tone="green" />
        <StatCard label="不通过人数" value={disqualifiedRows.length} tone="red" />
        <StatCard label="自动修复数" value={stats.repaired} tone="amber" />
      </div>

      <div className="bos-status-row">
        <span className="bos-status-badge">当前状态：{status}</span>
        <span className={`bos-status-badge${hasBlockingRows ? " is-danger" : " is-success"}`}>学院确认：{reviewStatus}</span>
      </div>

      <Toolbar>
        <button className="is-primary" onClick={() => setActiveModal("import")}>数据导入</button>
        <button className="is-purple" disabled={!hasProcessedRows} onClick={exportExcel}>导出通过名单</button>
        <button className="is-purple" disabled={!hasProcessedRows} onClick={exportStudentErrorReport}>导出不通过名单</button>
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
      </Toolbar>

      <AdminCard title="处理日志" description="格式修复与处理过程记录。">
        <div className="bos-log-scroll" aria-label="本专科信息处理日志">
          {logs.length === 0
            ? <div className="bos-log-empty">等待导入 Excel</div>
            : logs.map((item, index) => (
              <div key={`${item.time}_${index}`} className="bos-log-item">
                <time>{item.time}</time><span>{item.message}</span>
              </div>
            ))}
          <div ref={logEndRef} />
        </div>
      </AdminCard>

      {processedData.length > 0 && (
        <section className="bos-table-card">
          <div className="bos-table-card-head">
            <h2>本专科困难生数据表</h2>
            <span>显示 {processedData.length} 条</span>
          </div>
          <div className="bos-table-card-body">
            {renderTable(processedData)}
          </div>
        </section>
      )}

      <AdminCard
        title={`不通过预览（${disqualifiedRows.length}）`}
        description="展示需要人工确认的问题，自动修复项不会进入本表。"
        extra={<button className="bos-button" disabled={!disqualifiedRows.length} onClick={() => setActiveModal("failed")}>查看全部</button>}
      >
        <div className="bos-preview-table-wrap">
          <table className="bos-preview-table">
            <thead><tr><th>行号</th><th>姓名</th><th>身份证号</th><th>问题原因</th><th>修改建议</th></tr></thead>
            <tbody>
              {disqualifiedRows.length === 0 ? (
                <tr><td colSpan={5} className="bos-empty-cell">暂无需要人工处理的问题</td></tr>
              ) : disqualifiedRows.slice(0, 8).map((row) => (
                <tr key={`${row.rowNumber}_${row.idCard}`} className="is-error-row">
                  <td>{row.rowNumber}</td><td>{row.name || "-"}</td><td>{row.idCard || "-"}</td>
                  <td>{row.reason}</td><td>按问题说明核实并修正后重新导入</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminCard>

      {activeModal === "import" && (
        <Modal title="本专科信息数据导入" width="720px" headerTone="green" onClose={() => setActiveModal(null)}>
          <div style={pageStyles.importHint}>
            <strong>导入说明</strong>
            <span>1. 请先下载标准模板，按模板要求填写困难生本专科信息；</span>
            <span>2. 第一步上传模板表，第二步上传同格式的数据表；</span>
            <span>3. 支持 .xls / .xlsx 格式，数据表匹配率需达到 90% 以上。</span>
          </div>
          <div
            style={pageStyles.importDrop}
            onClick={selectTemplateFile}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleTemplateDrop}
          >
            <input ref={templateRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleTemplateFileChange} />
            <strong>第一步：上传困难生本专科模板表</strong>
            <span>点击或拖拽上传模板表</span>
          </div>
          <div
            style={{
              ...pageStyles.importDrop,
              marginTop: "12px",
              opacity: canUploadData ? 1 : 0.58,
              cursor: canUploadData ? "pointer" : "not-allowed",
            }}
            onClick={selectFile}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <input ref={dataRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleFileChange} />
            <strong>第二步：上传同模板格式的数据表</strong>
            <span>模板校验通过后才可选择</span>
          </div>
          <div style={pageStyles.modalInfoGrid}>
            <Info label="模板文件" value={templateFileName || "未选择文件"} />
            <Info label="模板表状态" value={templateStatusText} />
            <Info label="数据文件" value={importFileName || "未选择文件"} />
            <Info label="数据表状态" value={dataStatusText} />
            <Info label="当前流程" value={status} />
            <Info label="识别学院" value={studentCollegeName} />
          </div>
          {(templateInfo?.warnings.length || dataTemplateCheck?.warnings.length || dataTemplateCheck?.errors.length) ? (
            <div style={pageStyles.modalLogBox}>
              {templateInfo?.warnings.map((message) => <div key={`template_${message}`}>模板提示：{message}</div>)}
              {dataTemplateCheck?.warnings.map((message) => <div key={`data_warning_${message}`}>数据提示：{message}</div>)}
              {dataTemplateCheck?.errors.map((message) => <div key={`data_error_${message}`}>数据错误：{message}</div>)}
            </div>
          ) : null}
          <div style={pageStyles.modalFooter}>
            <button style={pageStyles.templateButton} onClick={() => {
              const template = [DIFFICULTY_STUDENT_TEMPLATE_FIELDS, DIFFICULTY_STUDENT_TEMPLATE_FIELDS.map(() => "")];
              const csv = template.map((row) => row.join(",")).join("\n");
              const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = "困难生本专科信息模板.csv";
              link.click();
              URL.revokeObjectURL(url);
            }}>下载模板</button>
            <button
              style={canStartProcessing ? pageStyles.greenButton : pageStyles.disabledButton}
              disabled={!canStartProcessing}
              onClick={() => void startProcessing()}
            >
              {isProcessing ? "正在处理..." : "开始处理"}
            </button>
            <button style={pageStyles.secondaryButton} onClick={() => setActiveModal(null)}>关闭</button>
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
    </section>
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

function Modal({ title, width = "80vw", headerTone, children, onClose }: { title: string; width?: string; headerTone?: "green"; children: ReactNode; onClose: () => void }) {
  return (
    <div className="bos-modal-backdrop">
      <section className={`bos-modal${width === "620px" ? " bos-modal--compact" : ""}`} style={{ width }}>
        <div style={headerTone === "green" ? pageStyles.modalHeaderGreen : pageStyles.modalHeader}>
          <h2 style={headerTone === "green" ? pageStyles.modalTitleWhite : pageStyles.modalTitle}>{title}</h2>
          <button style={headerTone === "green" ? pageStyles.modalCloseWhite : undefined} onClick={onClose}>关闭</button>
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
  empty: { color: "#8190a4", padding: 18, textAlign: "center", width: "100%" },
  modalHeader: { flex: "0 0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: "1px solid #d7e1ed", background: "#f8fafc" },
  modalTitle: { margin: 0, color: "#172033", fontSize: 18 },
  modalBody: { flex: 1, minHeight: 0, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 },
  modalFooter: { position: "sticky", bottom: 0, zIndex: 2, flex: "0 0 auto", display: "flex", justifyContent: "flex-end", gap: 8, padding: "11px 0 0", borderTop: "1px solid #e2e8f0", background: "#fff" },
  modalTableScroll: { flex: 1, minHeight: 280, display: "flex", overflow: "auto", border: "1px solid #d7e1ed", borderRadius: 6 },
  importHint: { display: "grid", gap: 6, padding: 12, borderRadius: 6, background: "#f0f9f4", border: "1px solid #b8e0c8", color: "#1a5c3a", fontSize: 12, lineHeight: 1.6 },
  importDrop: { display: "grid", gap: 8, placeItems: "center", textAlign: "center", border: "1px dashed #7faed4", borderRadius: 8, background: "#f7fbff", padding: 24, cursor: "pointer", color: "#40526a" },
  modalHeaderGreen: { flex: "0 0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: "1px solid #0a8f68", background: "#0a8f68" },
  modalTitleWhite: { margin: 0, color: "#fff", fontSize: 18 },
  modalCloseWhite: { border: "1px solid rgba(255,255,255,0.5)", borderRadius: 6, padding: "7px 10px", background: "transparent", color: "#fff", fontWeight: 800, cursor: "pointer" },
  templateButton: { border: "1px solid #cbd8e6", borderRadius: 6, minHeight: 34, padding: "8px 11px", background: "#fff", color: "#26364e", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" },
  modalInfoGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 },
  infoItem: { display: "grid", gap: 4, padding: 10, border: "1px solid #d7e1ed", borderRadius: 6, background: "#f8fbfe", color: "#63738a", fontSize: 12 },
  modalLogBox: { minHeight: 120, maxHeight: 180, overflow: "auto", padding: 10, borderRadius: 6, background: "#0b1428", color: "#dceafe", fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.6 },
  purpleButton: button("#5d5ab5"),
  greenButton: button("#0a8f68"),
  disabledButton: { ...button("#a6b4c5"), cursor: "not-allowed" },
  secondaryButton: { border: "1px solid #cbd8e6", borderRadius: 6, minHeight: 34, padding: "7px 11px", background: "#fff", color: "#26364e", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" },
};
