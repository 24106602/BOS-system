import { useMemo, useState, type CSSProperties, type ChangeEventHandler, type DragEvent, type ReactNode, type RefObject } from "react";
import type {
  DataTemplateValidationResult,
  DisqualifiedRow,
  LogItem,
  ProcessingStats,
  TemplateValidationResult,
} from "../services/types";
import { ACADEMIC_YEAR_OPTIONS } from "../utils/academicYear";
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
  analysis?: Record<string, number>;
  logs: LogItem[];
  aiReport?: string;
  logEndRef: RefObject<HTMLDivElement | null>;
  onBackToDifficulty?: () => void;
};

type ModalType = "import" | "passed" | "failed" | null;
type ImportTab = "success" | "failed";

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
  logs,
  logEndRef,
  onBackToDifficulty,
}: StudentProcessPageProps) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [importTab, setImportTab] = useState<ImportTab>("success");
  const [templateFileName, setTemplateFileName] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [filters, setFilters] = useState({
    academicYear: academicYear,
    semester: "",
    name: "",
    idCard: "",
    schoolName: "",
    department: "",
    difficultyLevel: "",
    gender: "",
    status: "",
  });

  const failedRowNumbers = useMemo(
    () => new Set(disqualifiedRows.map((row) => row.rowNumber)),
    [disqualifiedRows]
  );
  const passedRows = useMemo(
    () => processedData.filter((_, index) => !failedRowNumbers.has(index + 1)),
    [failedRowNumbers, processedData]
  );

  const filteredRows = useMemo(() => {
    return processedData.filter((row) => {
      const rowAcademicYear = getDifficultyTemplateValue(row, "学年(*)");
      const rowSemester = getDifficultyTemplateValue(row, "学期(*)");
      const rowName = getDifficultyTemplateValue(row, "姓名(*)");
      const rowIdCard = getDifficultyTemplateValue(row, "身份证号(*)");
      const rowSchool = getDifficultyTemplateValue(row, "学校名称(*)");
      const rowDepartment = getDifficultyTemplateValue(row, "院系(*)");
      const rowDifficulty = getDifficultyTemplateValue(row, "困难等级(*)");
      const rowGender = getDifficultyTemplateValue(row, "性别(*)");
      const rowStatus = getDifficultyTemplateValue(row, "状态(*)");

      if (filters.academicYear && !String(rowAcademicYear).includes(filters.academicYear)) return false;
      if (filters.semester && !String(rowSemester).includes(filters.semester)) return false;
      if (filters.name && !String(rowName).includes(filters.name)) return false;
      if (filters.idCard && !String(rowIdCard).includes(filters.idCard)) return false;
      if (filters.schoolName && !String(rowSchool).includes(filters.schoolName)) return false;
      if (filters.department && !String(rowDepartment).includes(filters.department)) return false;
      if (filters.difficultyLevel && !String(rowDifficulty).includes(filters.difficultyLevel)) return false;
      if (filters.gender && !String(rowGender).includes(filters.gender)) return false;
      if (filters.status && !String(rowStatus).includes(filters.status)) return false;
      return true;
    });
  }, [filters, processedData]);

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
    setImportTab("success");
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    await uploadDataFile(file);
    setImportTab("success");
  };

  const handleTemplateDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    setTemplateFileName(file.name);
    setImportFileName("");
    await uploadTemplateFile(file);
  };

  const resetFilters = () => {
    setFilters({
      academicYear: academicYear,
      semester: "",
      name: "",
      idCard: "",
      schoolName: "",
      department: "",
      difficultyLevel: "",
      gender: "",
      status: "",
    });
  };

  const handleConfirmImportSuccess = () => {
    if (passedRows.length === 0) {
      alert("没有可导入的成功数据");
      return;
    }
    if (hasBlockingRows) {
      alert("存在失败数据，请先处理失败数据或仅导入成功数据");
      return;
    }
    addStudentResultToMergePool();
    setActiveModal(null);
  };

  const handleRevalidateFailed = async () => {
    if (disqualifiedRows.length === 0) {
      alert("没有需要重新校验的失败数据");
      return;
    }
    await startProcessing();
  };

  const importSuccessCount = passedRows.length;
  const importFailedCount = disqualifiedRows.length;
  const importTotalCount = processedData.length;

  return (
    <section className="bos-table-page difficulty-workspace">
      <PageHeader
        breadcrumb="困难生业务 / 本专科信息"
        title="本专科信息处理"
        description="上传模板表与数据表，完成格式校验、自动修复和学院上载。"
        actions={(
          <div className="bos-status-row">
            <span className="bos-status-badge">{studentCollegeName}</span>
            {onBackToDifficulty && <button className="bos-button" onClick={onBackToDifficulty}>返回业务首页</button>}
          </div>
        )}
      />

      <div className="bos-stat-grid">
        <StatCard label="上传总数" value={importTotalCount} />
        <StatCard label="成功人数" value={importSuccessCount} tone="green" />
        <StatCard label="失败人数" value={importFailedCount} tone="red" />
        <StatCard label="自动修复数" value={stats.repaired} tone="amber" />
      </div>

      <div className="bos-status-row">
        <span className="bos-status-badge">当前状态：{status}</span>
        <span className={`bos-status-badge${hasBlockingRows ? " is-danger" : " is-success"}`}>学院确认：{reviewStatus}</span>
      </div>

      <section className="bos-filter-card">
        <div className="bos-filter-grid difficulty-student-filter">
          <label className="bos-filter-field">学年
            <select value={filters.academicYear} onChange={(event) => setFilters((current) => ({ ...current, academicYear: event.target.value }))}>
              {ACADEMIC_YEAR_OPTIONS.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <label className="bos-filter-field">学期
            <select value={filters.semester} onChange={(event) => setFilters((current) => ({ ...current, semester: event.target.value }))}>
              <option value="">全部</option>
              <option value="秋季学期">秋季学期</option>
              <option value="春季学期">春季学期</option>
            </select>
          </label>
          <label className="bos-filter-field">姓名<input value={filters.name} onChange={(event) => setFilters((current) => ({ ...current, name: event.target.value }))} placeholder="请输入姓名" /></label>
          <label className="bos-filter-field">身份证号<input value={filters.idCard} onChange={(event) => setFilters((current) => ({ ...current, idCard: event.target.value }))} placeholder="请输入身份证号" /></label>
          <label className="bos-filter-field">学校名称<input value={filters.schoolName} onChange={(event) => setFilters((current) => ({ ...current, schoolName: event.target.value }))} placeholder="请输入学校名称" /></label>
          <label className="bos-filter-field">院系<input value={filters.department} onChange={(event) => setFilters((current) => ({ ...current, department: event.target.value }))} placeholder="请输入院系" /></label>
          <label className="bos-filter-field">困难等级
            <select value={filters.difficultyLevel} onChange={(event) => setFilters((current) => ({ ...current, difficultyLevel: event.target.value }))}>
              <option value="">全部</option>
              <option value="特别困难">特别困难</option>
              <option value="比较困难">比较困难</option>
              <option value="一般困难">一般困难</option>
            </select>
          </label>
          <label className="bos-filter-field">性别
            <select value={filters.gender} onChange={(event) => setFilters((current) => ({ ...current, gender: event.target.value }))}>
              <option value="">全部</option>
              <option value="男">男</option>
              <option value="女">女</option>
            </select>
          </label>
          <label className="bos-filter-field">状态
            <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="">全部</option>
              <option value="通过">通过</option>
              <option value="不通过">不通过</option>
              <option value="待审核">待审核</option>
            </select>
          </label>
          <div className="bos-filter-actions">
            <button className="is-primary" onClick={() => setFilters({ ...filters })}>查询</button>
            <button onClick={resetFilters}>重置</button>
          </div>
        </div>
      </section>

      <Toolbar>
        <button className="is-primary" onClick={() => setActiveModal("import")}>数据导入</button>
        <button className="is-purple" disabled={!hasProcessedRows} onClick={exportExcel}>导出通过名单</button>
        <button className="is-purple" disabled={!hasProcessedRows} onClick={exportStudentErrorReport}>导出不通过名单</button>
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

      <section className="bos-table-card">
        <div className="bos-table-card-head">
          <h2>本专科困难生数据表</h2>
          <span>显示 {filteredRows.length} / {processedData.length} 条</span>
        </div>
        <div className="bos-table-card-body">
          {filteredRows.length === 0 ? (
            <div style={pageStyles.empty}>暂无处理数据，请点击“数据导入”上传 Excel。</div>
          ) : (
            renderTable(filteredRows)
          )}
        </div>
      </section>

      {activeModal === "import" && (
        <Modal title="数据导入" width="900px" headerTone="green" onClose={() => setActiveModal(null)}>
          <div style={pageStyles.importHint}>
            <strong>导入说明</strong>
            <span>1. 请先下载标准模板，按模板要求填写困难生本专科信息；</span>
            <span>2. 第一步上传模板表，第二步上传同格式的数据表；</span>
            <span>3. 系统会自动校验是否为对应模板表，匹配通过后才可导入。</span>
          </div>

          {!templateInfo?.ok ? (
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
          ) : (
            <div
              style={{
                ...pageStyles.importDrop,
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
          )}

          <div style={pageStyles.modalInfoGrid}>
            <Info label="模板文件" value={templateFileName || "未选择文件"} />
            <Info label="模板表状态" value={templateStatusText} />
            <Info label="数据文件" value={importFileName || "未选择文件"} />
            <Info label="数据表状态" value={dataStatusText} />
            <Info label="上传总数" value={String(importTotalCount)} />
            <Info label="成功人数" value={String(importSuccessCount)} />
            <Info label="失败人数" value={String(importFailedCount)} />
          </div>

          {processedData.length > 0 && (
            <>
              <div style={pageStyles.importTabs}>
                <button
                  style={importTab === "success" ? pageStyles.importTabActive : pageStyles.importTab}
                  onClick={() => setImportTab("success")}
                >
                  成功数据（{importSuccessCount}）
                </button>
                <button
                  style={importTab === "failed" ? pageStyles.importTabActive : pageStyles.importTab}
                  onClick={() => setImportTab("failed")}
                >
                  失败数据（{importFailedCount}）
                </button>
              </div>

              <div style={pageStyles.importPreview}>
                <div style={pageStyles.importPreviewHeader}>
                  <span>导入预览</span>
                  <span>显示 {importTab === "success" ? importSuccessCount : importFailedCount} 条</span>
                </div>
                <div style={pageStyles.importPreviewBody}>
                  {importTab === "success" ? (
                    passedRows.length === 0 ? (
                      <div style={pageStyles.empty}>暂无成功数据</div>
                    ) : (
                      renderTable(passedRows)
                    )
                  ) : (
                    disqualifiedRows.length === 0 ? (
                      <div style={pageStyles.empty}>暂无失败数据</div>
                    ) : (
                      renderTable(disqualifiedRows)
                    )
                  )}
                </div>
              </div>
            </>
          )}

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

            {importTab === "success" && (
              <button
                style={importSuccessCount > 0 && !hasBlockingRows ? pageStyles.greenButton : pageStyles.disabledButton}
                disabled={importSuccessCount === 0 || hasBlockingRows}
                onClick={handleConfirmImportSuccess}
              >
                成功数据正式导入
              </button>
            )}

            {importTab === "failed" && (
              <>
                <button
                  style={importFailedCount > 0 ? pageStyles.orangeButton : pageStyles.disabledButton}
                  disabled={importFailedCount === 0 || isProcessing}
                  onClick={handleRevalidateFailed}
                >
                  失败数据重新校验
                </button>
                <button
                  style={importFailedCount > 0 ? pageStyles.purpleButton : pageStyles.disabledButton}
                  disabled={importFailedCount === 0}
                  onClick={exportStudentErrorReport}
                >
                  下载失败数据
                </button>
              </>
            )}

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
      <section className={`bos-modal${width === "620px" ? " bos-modal--compact" : ""}`} style={{ width, maxWidth: "96vw", height: "auto", maxHeight: "90vh" }}>
        <div style={headerTone === "green" ? pageStyles.modalHeaderGreen : pageStyles.modalHeader}>
          <h2 style={headerTone === "green" ? pageStyles.modalTitleWhite : pageStyles.modalTitle}>{title}</h2>
          <button style={headerTone === "green" ? pageStyles.modalCloseWhite : undefined} onClick={onClose}>关闭</button>
        </div>
        <div className="bos-modal-body" style={{ overflow: "auto" }}>{children}</div>
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
  modalFooter: { flex: "0 0 auto", display: "flex", justifyContent: "flex-end", gap: 8, padding: "11px 0 0", borderTop: "1px solid #e2e8f0", background: "#fff" },
  modalTableScroll: { flex: 1, minHeight: 280, display: "flex", overflow: "auto", border: "1px solid #d7e1ed", borderRadius: 6 },
  importHint: { display: "grid", gap: 6, padding: 12, borderRadius: 6, background: "#f0f9f4", border: "1px solid #b8e0c8", color: "#1a5c3a", fontSize: 12, lineHeight: 1.6 },
  importDrop: { display: "grid", gap: 8, placeItems: "center", textAlign: "center", border: "1px dashed #7faed4", borderRadius: 8, background: "#f7fbff", padding: 24, cursor: "pointer", color: "#40526a" },
  modalHeaderGreen: { flex: "0 0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: "1px solid #0a8f68", background: "#0a8f68" },
  modalTitleWhite: { margin: 0, color: "#fff", fontSize: 18 },
  modalCloseWhite: { border: "1px solid rgba(255,255,255,0.5)", borderRadius: 6, padding: "7px 10px", background: "transparent", color: "#fff", fontWeight: 800, cursor: "pointer" },
  templateButton: { border: "1px solid #cbd8e6", borderRadius: 6, minHeight: 34, padding: "8px 11px", background: "#fff", color: "#26364e", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" },
  modalInfoGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 },
  infoItem: { display: "grid", gap: 4, padding: 10, border: "1px solid #d7e1ed", borderRadius: 6, background: "#f8fbfe", color: "#63738a", fontSize: 12 },
  modalLogBox: { minHeight: 80, maxHeight: 120, overflow: "auto", padding: 10, borderRadius: 6, background: "#0b1428", color: "#dceafe", fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.6 },
  purpleButton: button("#5d5ab5"),
  greenButton: button("#0a8f68"),
  orangeButton: button("#c77a0a"),
  disabledButton: { ...button("#a6b4c5"), cursor: "not-allowed" },
  secondaryButton: { border: "1px solid #cbd8e6", borderRadius: 6, minHeight: 34, padding: "7px 11px", background: "#fff", color: "#26364e", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" },
  importTabs: { display: "flex", gap: 8, borderBottom: "1px solid #e2e8f0" },
  importTab: { padding: "10px 16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderBottom: "none", borderRadius: "6px 6px 0 0", color: "#64748b", fontSize: 13, fontWeight: 800, cursor: "pointer" },
  importTabActive: { padding: "10px 16px", background: "#0a8f68", border: "1px solid #0a8f68", borderBottom: "none", borderRadius: "6px 6px 0 0", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" },
  importPreview: { border: "1px solid #e2e8f0", borderRadius: "0 6px 6px 6px", overflow: "hidden" },
  importPreviewHeader: { display: "flex", justifyContent: "space-between", padding: "10px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 13, fontWeight: 800, color: "#334155" },
  importPreviewBody: { maxHeight: 320, overflow: "auto", padding: 12 },
};
