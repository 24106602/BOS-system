import { useState, type CSSProperties, type ChangeEventHandler, type DragEvent, type ReactNode, type RefObject } from "react";
import type { FamilyProcessingStats, FamilyReviewRow, LogItem } from "../services/types";
import AdminCard from "../components/ui/AdminCard";
import PageHeader from "../components/ui/PageHeader";
import StatCard from "../components/ui/StatCard";
import Toolbar from "../components/ui/Toolbar";

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
  familyStatus: string;
  academicYear: string;
  onAcademicYearChange: (year: string) => void;
  familyCollegeName: string;
  familyStats: FamilyProcessingStats;
  renderTable: (rows: Record<string, unknown>[] | FamilyReviewRow[], dataType: "student" | "family", academicYear?: string, collegeName?: string) => ReactNode;
  familyProcessedData: Record<string, unknown>[];
  familyReviewRows: FamilyReviewRow[];
  familyLogs: LogItem[];
  familyLogEndRef: RefObject<HTMLDivElement | null>;
  onBackToDifficulty?: () => void;
};

type ModalType = "import" | "passed" | "failed" | null;

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
  familyStatus,
  academicYear,
  onAcademicYearChange,
  familyCollegeName,
  familyStats,
  renderTable,
  familyProcessedData,
  familyReviewRows,
  familyLogs,
  familyLogEndRef,
  onBackToDifficulty,
}: FamilyProcessPageProps) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [importFileName, setImportFileName] = useState("");

  const failedRowNumbers = new Set(familyReviewRows.map((row) => row.rowNumber));
  const passedRows = familyProcessedData.filter((_, index) => !failedRowNumbers.has(index + 1));

  const hasProcessedRows = familyProcessedData.length > 0 && !isFamilyProcessing;
  const hasBlockingRows = familyReviewRows.length > 0 || familyStats.errors > 0;
  const canConfirm = hasProcessedRows && !reviewConfirmed && !hasBlockingRows;
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

  return (
    <section className="bos-table-page difficulty-workspace">
      <PageHeader
        breadcrumb="困难生业务 / 家庭成员信息"
        title="家庭成员信息处理"
        description="上传家庭成员信息 Excel，完成格式校验、自动修复和学院上载。"
        actions={(
          <div className="bos-status-row">
          <span className="bos-status-badge">{familyCollegeName}</span>
          {onBackToDifficulty && <button className="bos-button" onClick={onBackToDifficulty}>返回业务首页</button>}
          </div>
        )}
      />

      <div className="bos-stat-grid">
        <StatCard label="数据总量" value={familyStats.total} />
        <StatCard label="通过人数" value={passedRows.length} tone="green" />
        <StatCard label="不通过人数" value={familyReviewRows.length} tone="red" />
        <StatCard label="自动修复数" value={familyStats.repaired} tone="amber" />
      </div>

      <div className="bos-status-row">
        <span className="bos-status-badge">当前状态：{familyStatus}</span>
        <span className={`bos-status-badge${hasBlockingRows ? " is-danger" : " is-success"}`}>学院确认：{reviewStatus}</span>
      </div>

      <Toolbar>
        <button className="is-primary" onClick={() => setActiveModal("import")}>数据导入</button>
        <button className="is-purple" disabled={!hasProcessedRows} onClick={exportFamilyResult}>导出通过名单</button>
        <button className="is-purple" disabled={!hasProcessedRows} onClick={exportFamilyErrorReport}>导出不通过名单</button>
        <button className={reviewConfirmed ? "is-success" : "is-warning"} disabled={!canConfirm} onClick={confirmCollegeReview}>
          {reviewConfirmed ? "学院已确认" : "学院确认审核"}
        </button>
        <button
          className={hasProcessedRows && reviewConfirmed && !hasBlockingRows && !uploadedToSchool ? "is-success" : "is-warning"}
          disabled={!hasProcessedRows || !reviewConfirmed || hasBlockingRows || uploadedToSchool}
          onClick={addFamilyResultToMergePool}
        >
          {uploadedToSchool ? "已上载学校端" : "上载到学校端"}
        </button>
      </Toolbar>

      <AdminCard title="处理日志" description="格式修复与处理过程记录。">
        <div className="bos-log-scroll" aria-label="家庭成员信息处理日志">
          {familyLogs.length === 0
            ? <div className="bos-log-empty">等待导入 Excel</div>
            : familyLogs.map((item, index) => (
              <div key={`${item.time}_${index}`} className="bos-log-item">
                <time>{item.time}</time><span>{item.message}</span>
              </div>
            ))}
          <div ref={familyLogEndRef} />
        </div>
      </AdminCard>

      <section className="bos-table-card">
          <div className="bos-table-card-head">
            <h2>家庭成员数据表</h2>
            <span>显示 {familyProcessedData.length} 条</span>
          </div>
          <div className="bos-table-card-body">
            {renderTable(familyProcessedData, "family", academicYear, familyCollegeName)}
          </div>
        </section>

      {familyReviewRows.length > 0 && (
        <AdminCard
          title={`不通过预览（${familyReviewRows.length}）`}
          description="展示需要人工确认的问题。"
          extra={<button className="bos-button" onClick={() => setActiveModal("failed")}>查看全部</button>}
        >
          <div className="bos-preview-table-wrap">
            <table className="bos-preview-table">
              <thead><tr><th>行号</th><th>家庭成员姓名</th><th>学生学号</th><th>关系</th><th>问题原因</th><th>修改建议</th></tr></thead>
              <tbody>
                {familyReviewRows.slice(0, 8).map((row) => (
                  <tr key={`${row.rowNumber}_${row.studentId}_${row.memberName}`} className="is-error-row">
                    <td>{row.rowNumber}</td><td>{row.memberName || "-"}</td><td>{row.studentId || "-"}</td>
                    <td>{row.relation || "-"}</td><td>{row.reason}</td><td>按问题说明核实并修正后重新导入</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminCard>
      )}

      {activeModal === "import" && (
        <Modal title="家庭成员信息数据导入" width="620px" headerTone="green" onClose={() => setActiveModal(null)}>
          <div style={pageStyles.importHint}>
            <strong>导入说明</strong>
            <span>1. 请先下载标准模板，按模板要求填写家庭成员信息；</span>
            <span>2. 支持 .xls / .xlsx 格式，建议单个文件大小不超过 5MB；</span>
            <span>3. 上传后将自动识别表头并执行数据治理。</span>
          </div>
          <div
            style={pageStyles.importDrop}
            onClick={selectFile}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <input ref={familyDataRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleFileChange} />
            <strong>点击上传 EXCEL 文件</strong>
            <span>或将文件拖拽到此处</span>
          </div>
          <div style={pageStyles.modalInfoGrid}>
            <Info label="文件名" value={importFileName || "未选择文件"} />
            <Info label="读取状态" value={familyStatus} />
            <Info label="识别学院" value={familyCollegeName} />
          </div>
          <div style={pageStyles.modalFooter}>
            <button style={pageStyles.templateButton} onClick={() => {
              const template = [
                ["学生身份证号(*)", "学生姓名(*)", "家庭成员姓名(*)", "与学生关系(*)", "年龄", "工作单位", "职业", "年收入（元）(*)", "健康状况(*)", "联系电话(*)", "是否共同生活(*)", "备注"],
                ["341022200301011801", "张三", "张大三", "父亲", "50", "某公司", "职员", "50000", "健康", "13800138001", "是", ""],
              ];
              const csv = template.map((row) => row.join(",")).join("\n");
              const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = "家庭成员信息模板.csv";
              link.click();
              URL.revokeObjectURL(url);
            }}>下载模板</button>
            <button style={isFamilyProcessing ? pageStyles.disabledButton : pageStyles.greenButton} disabled={isFamilyProcessing} onClick={selectFile}>上传文件</button>
            <button style={pageStyles.secondaryButton} onClick={() => setActiveModal(null)}>关闭</button>
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
          {passedRows.length === 0 ? <div style={pageStyles.empty}>暂无通过数据</div> : renderTable(passedRows, "family", academicYear, familyCollegeName)}
        </ListModal>
      )}

      {activeModal === "failed" && (
        <ListModal
          title="家庭成员信息不通过数据"
          count={familyReviewRows.length}
          onClose={() => setActiveModal(null)}
          onExport={exportFamilyErrorReport}
        >
          {familyReviewRows.length === 0 ? <div style={pageStyles.empty}>暂无不通过数据</div> : renderTable(familyReviewRows, "family", academicYear, familyCollegeName)}
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
  purpleButton: button("#5d5ab5"),
  greenButton: button("#0a8f68"),
  disabledButton: { ...button("#a6b4c5"), cursor: "not-allowed" },
  secondaryButton: { border: "1px solid #cbd8e6", borderRadius: 6, minHeight: 34, padding: "7px 11px", background: "#fff", color: "#26364e", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" },
};
