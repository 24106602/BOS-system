import * as XLSX from "xlsx-js-style";
import { useMemo, useRef, useState, type CSSProperties, type ChangeEventHandler, type DragEvent, type ReactNode, type RefObject } from "react";
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
import {
  DifficultyStudentApiError,
  confirmDifficultyStudentImport,
  validateDifficultyStudentImport,
  type DifficultyImportConfirmResult,
  type DifficultyImportValidationResult,
} from "../services/difficultyStudentApi";

type StudentProcessPageProps = {
  dataRef: RefObject<HTMLInputElement | null>;
  uploadDataFile: (file: File) => Promise<void>;
  templateInfo: TemplateValidationResult | null;
  dataTemplateCheck: DataTemplateValidationResult | null;
  isProcessing: boolean;
  exportExcel: () => void;
  exportStudentErrorReport: () => void;
  addStudentResultToMergePool: () => void;
  onFormalImportConfirmed?: (result: DifficultyImportConfirmResult) => void | Promise<void>;
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
  renderTable: (rows: Record<string, unknown>[] | DisqualifiedRow[], dataType: "student" | "family", academicYear?: string, collegeName?: string, pagination?: { currentPage: number; pageSize: number; total: number }) => ReactNode;
  processedData: Record<string, unknown>[];
  disqualifiedRows: DisqualifiedRow[];
  logs: LogItem[];
  logEndRef: RefObject<HTMLDivElement | null>;
  onBackToDifficulty?: () => void;
};

type ModalType = "import" | null;
type ImportTab = "success" | "failed";
type ImportStep = 1 | 2 | 3;

export default function StudentProcessPage({
  dataRef,
  uploadDataFile,
  templateInfo,
  dataTemplateCheck,
  isProcessing,
  exportExcel,
  exportStudentErrorReport,
  addStudentResultToMergePool,
  onFormalImportConfirmed,
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
}: StudentProcessPageProps) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [importTab, setImportTab] = useState<ImportTab>("success");
  const [importStep, setImportStep] = useState<ImportStep>(1);
  const [importFileName, setImportFileName] = useState("");
  const [importValidation, setImportValidation] = useState<DifficultyImportValidationResult | null>(null);
  const [isImportValidating, setIsImportValidating] = useState(false);
  const [isImportConfirming, setIsImportConfirming] = useState(false);
  const [importConfirmResult, setImportConfirmResult] = useState<DifficultyImportConfirmResult | null>(null);
  const retryFileRef = useRef<HTMLInputElement | null>(null);
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
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);

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

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return filteredRows.slice(start, end);
  }, [filteredRows, currentPage, pageSize]);

  const hasProcessedRows = processedData.length > 0 && !isProcessing;
  const hasBlockingRows = disqualifiedRows.length > 0 || stats.errors > 0;
  const canConfirm = hasProcessedRows && !reviewConfirmed && !hasBlockingRows;
  const reviewStatus =
    !processedData.length ? "未处理" :
    hasBlockingRows ? "存在不通过数据，禁止确认/上载" :
    uploadedToSchool ? "已上载学校端" :
    reviewConfirmed ? "学院已确认" :
    "已处理，待确认";

  const dataStatusText = !dataTemplateCheck
    ? "未上传"
    : dataTemplateCheck.ok
    ? `与模板匹配：匹配率 ${(dataTemplateCheck.matchRate * 100).toFixed(1)}%`
    : `与模板不匹配：${dataTemplateCheck.errors[0] || "数据表格式错误"}`;

  const selectFile = () => {
    if (!dataRef.current) return;
    dataRef.current.value = "";
    dataRef.current.click();
  };

  const openImportModal = () => {
    setActiveModal("import");
    setImportStep(1);
    setImportTab("success");
    setImportFileName("");
    setImportValidation(null);
    setImportConfirmResult(null);
  };

  const validateImportFile = async (file: File, retryFailedOnly = false) => {
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      alert("仅支持 .xls 或 .xlsx 格式的 Excel 文件");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      alert("单个 Excel 文件不能超过 6MB");
      return;
    }
    if (retryFailedOnly && !importValidation) {
      alert("没有可重新校验的失败数据");
      return;
    }

    setImportFileName(file.name);
    setIsImportValidating(true);
    try {
      if (!retryFailedOnly) {
        await uploadDataFile(file);
      }
      const result = await validateDifficultyStudentImport(file, {
        academicYear,
        collegeName: studentCollegeName,
        retryToken: retryFailedOnly ? importValidation?.validationToken : undefined,
        acceptedRows: retryFailedOnly ? importValidation?.passedRows : undefined,
      });
      setImportValidation(result);
      setImportStep(2);
      setImportTab(result.failed > 0 ? "failed" : "success");
    } catch (error) {
      const message = error instanceof DifficultyStudentApiError
        ? error.message
        : error instanceof Error
        ? error.message
        : "困难生导入校验失败";
      alert(message);
    } finally {
      setIsImportValidating(false);
    }
  };

  const handleFileChange: ChangeEventHandler<HTMLInputElement> = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file) await validateImportFile(file);
    input.value = "";
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await validateImportFile(file);
  };

  const handleRetryFileChange: ChangeEventHandler<HTMLInputElement> = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file) await validateImportFile(file, true);
    input.value = "";
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
    setCurrentPage(1);
  };

  const handleConfirmImport = async () => {
    if (!importValidation || importValidation.passed === 0) {
      alert("没有可正式导入的通过数据");
      return;
    }
    if (importValidation.failed > 0) {
      alert("仍有校验失败数据，请修正后重新校验");
      return;
    }
    if (hasBlockingRows) {
      alert("原有数据治理仍存在不通过数据，请修正并重新上传后再正式导入");
      return;
    }
    if (!confirm(`确认正式导入 ${importValidation.passed} 条困难生数据？`)) return;

    setIsImportConfirming(true);
    try {
      const result = await confirmDifficultyStudentImport(
        importValidation.validationToken,
        importValidation.passedRows
      );
      setImportConfirmResult(result);
      setImportStep(3);
      await onFormalImportConfirmed?.(result);
    } catch (error) {
      const message = error instanceof DifficultyStudentApiError
        ? error.message
        : error instanceof Error
        ? error.message
        : "困难生正式导入失败";
      alert(message);
    } finally {
      setIsImportConfirming(false);
    }
  };

  const downloadFailedImportRows = () => {
    if (!importValidation?.failedRows.length) {
      alert("没有可下载的失败数据");
      return;
    }
    const rows = importValidation.failedRows.map((row) => ({
      "原始行号": row.row,
      "错误字段": row.errors.map((item) => item.field).join("；"),
      "错误原因": row.errors.map((item) => item.reason).join("；"),
      ...row.data,
    }));
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = Object.keys(rows[0]).map((key) => ({
      wch: Math.min(Math.max(key.length + 4, 14), key.includes("原因") ? 48 : 28),
    }));
    XLSX.utils.book_append_sheet(workbook, worksheet, "失败数据");
    XLSX.writeFile(workbook, `困难生导入失败数据_${Date.now()}.xlsx`);
  };

  const importSuccessCount = passedRows.length;
  const importFailedCount = disqualifiedRows.length;
  const importTotalCount = processedData.length;

  const importPassedPreviewRows = useMemo(() => (
    (importValidation?.passedRows || []).map((row) => ({
      "学年": row.academic_year,
      "学院": row.college_name,
      ...(row.raw_data && typeof row.raw_data === "object" ? row.raw_data : {}),
    }))
  ), [importValidation]);

  const importFailedPreviewRows = useMemo(() => (
    (importValidation?.failedRows || []).map((row) => ({
      "原始行号": row.row,
      "错误字段": row.errors.map((item) => item.field).join("；"),
      "错误原因": row.errors.map((item) => item.reason).join("；"),
      ...row.data,
    }))
  ), [importValidation]);

  return (
    <div style={pageStyles.workspace}>
      <div style={pageStyles.headerSection}>
        <div style={pageStyles.headerLeft}>
          <h2 style={pageStyles.pageTitle}>本专科信息处理</h2>
        </div>
      </div>

      <div style={pageStyles.filterSection}>
        <div style={pageStyles.filterTitle}>
          <span>过滤</span>
          <div style={pageStyles.filterButtons}>
            <button style={pageStyles.queryButton}>查询</button>
            <button style={pageStyles.resetButton} onClick={resetFilters}>重置</button>
          </div>
        </div>
        <div style={pageStyles.filterContent}>
          <div style={pageStyles.filterRow}>
            <label style={pageStyles.filterField}>
              <span>学年</span>
              <select value={filters.academicYear} onChange={(event) => setFilters((current) => ({ ...current, academicYear: event.target.value }))}>
                {ACADEMIC_YEAR_OPTIONS.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
            <label style={pageStyles.filterField}>
              <span>学期</span>
              <select value={filters.semester} onChange={(event) => setFilters((current) => ({ ...current, semester: event.target.value }))}>
                <option value="">全部</option>
                <option value="秋季学期">秋季学期</option>
                <option value="春季学期">春季学期</option>
              </select>
            </label>
            <label style={pageStyles.filterField}>
              <span>姓名</span>
              <input value={filters.name} onChange={(event) => setFilters((current) => ({ ...current, name: event.target.value }))} placeholder="请输入姓名" />
            </label>
            <label style={pageStyles.filterField}>
              <span>身份证号</span>
              <input value={filters.idCard} onChange={(event) => setFilters((current) => ({ ...current, idCard: event.target.value }))} placeholder="请输入身份证号" />
            </label>
            <label style={pageStyles.filterField}>
              <span>学校名称</span>
              <input value={filters.schoolName} onChange={(event) => setFilters((current) => ({ ...current, schoolName: event.target.value }))} placeholder="请输入学校名称" />
            </label>
            <label style={pageStyles.filterField}>
              <span>院系</span>
              <input value={filters.department} onChange={(event) => setFilters((current) => ({ ...current, department: event.target.value }))} placeholder="请输入院系" />
            </label>
            <label style={pageStyles.filterField}>
              <span>困难等级</span>
              <select value={filters.difficultyLevel} onChange={(event) => setFilters((current) => ({ ...current, difficultyLevel: event.target.value }))}>
                <option value="">全部</option>
                <option value="特别困难">特别困难</option>
                <option value="比较困难">比较困难</option>
                <option value="一般困难">一般困难</option>
              </select>
            </label>
            <label style={pageStyles.filterField}>
              <span>性别</span>
              <select value={filters.gender} onChange={(event) => setFilters((current) => ({ ...current, gender: event.target.value }))}>
                <option value="">全部</option>
                <option value="男">男</option>
                <option value="女">女</option>
              </select>
            </label>
            <label style={pageStyles.filterField}>
              <span>状态</span>
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
                <option value="">全部</option>
                <option value="通过">通过</option>
                <option value="不通过">不通过</option>
                <option value="待审核">待审核</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <div style={pageStyles.toolbarSection}>
        <button style={pageStyles.toolbarButton} onClick={openImportModal}>数据导入</button>
        <button style={pageStyles.toolbarButton} disabled={!hasProcessedRows} onClick={exportExcel}>导出通过名单</button>
        <button style={pageStyles.toolbarButton} disabled={!hasProcessedRows} onClick={exportStudentErrorReport}>导出不通过名单</button>
        {!hideSubmitAction && (
          <>
            <button
              style={reviewConfirmed ? { ...pageStyles.toolbarButton, background: "#67c23a", borderColor: "#67c23a", color: "#fff" } : pageStyles.toolbarButton}
              disabled={!canConfirm}
              onClick={confirmCollegeReview}
            >
              {reviewConfirmed ? "学院已确认" : "学院确认审核"}
            </button>
            <button
              style={hasProcessedRows && reviewConfirmed && !hasBlockingRows && !uploadedToSchool ? { ...pageStyles.toolbarButton, background: "#67c23a", borderColor: "#67c23a", color: "#fff" } : pageStyles.toolbarButton}
              disabled={!hasProcessedRows || !reviewConfirmed || hasBlockingRows || uploadedToSchool}
              onClick={addStudentResultToMergePool}
            >
              {uploadedToSchool ? "已上载学校端" : "上载到学校端"}
            </button>
          </>
        )}
      </div>

      {importTotalCount > 0 && (
        <div style={pageStyles.statusSection}>
          <span style={pageStyles.statusBadge}>当前状态：{status}</span>
          <span style={hasBlockingRows ? { ...pageStyles.statusBadge, ...pageStyles.statusDanger } : { ...pageStyles.statusBadge, ...pageStyles.statusSuccess }}>
            学院确认：{reviewStatus}
          </span>
          <span style={pageStyles.statusBadge}>上传总数：{importTotalCount}</span>
          <span style={{ ...pageStyles.statusBadge, ...pageStyles.statusSuccess }}>成功人数：{importSuccessCount}</span>
          <span style={{ ...pageStyles.statusBadge, ...pageStyles.statusDanger }}>失败人数：{importFailedCount}</span>
          <span style={{ ...pageStyles.statusBadge, ...pageStyles.statusAmber }}>自动修复数：{stats.repaired}</span>
        </div>
      )}

      <div style={pageStyles.tableSection}>
        <div style={pageStyles.tableHeader}>
          <span>本专科困难生数据表</span>
          <span style={pageStyles.tableCount}>显示 {filteredRows.length} / {processedData.length} 条</span>
        </div>
        <div style={pageStyles.tableBody}>
          <div style={pageStyles.tableScrollWrapper}>
            {renderTable(filteredRows, "student", academicYear, studentCollegeName, {
              currentPage,
              pageSize,
              total: filteredRows.length,
            })}
          </div>
        </div>
        <div style={pageStyles.tableFooter}>
            <div style={pageStyles.pagination}>
              <button
                style={currentPage === 1 ? pageStyles.paginationButtonDisabled : pageStyles.paginationButton}
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                上一页
              </button>
              <span style={pageStyles.paginationText}>
                第 {currentPage} / {totalPages} 页
              </span>
              <button
                style={currentPage === totalPages ? pageStyles.paginationButtonDisabled : pageStyles.paginationButton}
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                下一页
              </button>
            </div>
          </div>
      </div>

      {activeModal === "import" && (
        <Modal title="数据导入" onClose={() => setActiveModal(null)}>
          <div style={pageStyles.importSteps}>
            {[
              [1, "选择文件"],
              [2, "校验结果"],
              [3, "正式导入"],
            ].map(([step, label]) => (
              <div
                key={step}
                style={Number(step) <= importStep ? pageStyles.importStepActive : pageStyles.importStep}
              >
                <span>{step}</span>
                <strong>{label}</strong>
              </div>
            ))}
          </div>

          {importStep === 1 && (
            <div
              style={pageStyles.importDrop}
              onClick={isImportValidating ? undefined : selectFile}
              onDragOver={(event) => event.preventDefault()}
              onDrop={isImportValidating ? undefined : handleDrop}
            >
              <input ref={dataRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleFileChange} />
              <strong>{isImportValidating ? "正在解析并校验，请稍候…" : "点击上传 EXCEL 文件"}</strong>
              <span>{importFileName || "或将文件拖拽到此处（最大 6MB）"}</span>
              <small>上传后仅执行解析与校验，不会写入困难生数据库。</small>
            </div>
          )}

          {importStep === 2 && importValidation && (
            <>
              <div style={pageStyles.importSummary}>
                <div><span>总数据</span><strong>{importValidation.total}</strong></div>
                <div style={pageStyles.importSummarySuccess}><span>通过</span><strong>{importValidation.passed}</strong></div>
                <div style={pageStyles.importSummaryDanger}><span>失败</span><strong>{importValidation.failed}</strong></div>
                <p>
                  {importValidation.failed > 0
                    ? "失败数据不会入库。请下载失败数据，修改后仅上传该失败文件重新校验。"
                    : hasBlockingRows
                    ? "后端导入校验已通过，但原有数据治理仍有不通过数据，暂不能正式导入。"
                    : "全部校验通过。点击“正式导入”后才会写入数据库并进入草稿态。"}
                </p>
              </div>
              <div style={pageStyles.importTabs}>
                <button
                  style={importTab === "success" ? pageStyles.importTabActive : pageStyles.importTab}
                  onClick={() => setImportTab("success")}
                >
                  通过 {importValidation.passed} 条
                </button>
                <button
                  style={importTab === "failed" ? pageStyles.importTabActive : pageStyles.importTab}
                  onClick={() => setImportTab("failed")}
                >
                  失败 {importValidation.failed} 条
                </button>
              </div>

              <div style={pageStyles.importPreview}>
                <div style={pageStyles.importPreviewHeader}>
                  <span>导入预览</span>
                  <span>显示 {importTab === "success" ? importValidation.passed : importValidation.failed} 条</span>
                </div>
                <div style={pageStyles.importPreviewBody}>
                  {importTab === "success" ? (
                    importPassedPreviewRows.length === 0 ? (
                      <div style={pageStyles.empty}>暂无成功数据</div>
                    ) : (
                      <div style={pageStyles.tableScrollWrapper}>
                        {renderSuccessTable(importPassedPreviewRows, academicYear, studentCollegeName)}
                      </div>
                    )
                  ) : (
                    importFailedPreviewRows.length === 0 ? (
                      <div style={pageStyles.empty}>暂无失败数据</div>
                    ) : (
                      <div style={pageStyles.tableScrollWrapper}>
                        {renderFailedTable(importFailedPreviewRows)}
                      </div>
                    )
                  )}
                </div>
                <div style={pageStyles.importPreviewFooter}>
                  <span>共 {importTab === "success" ? importValidation.passed : importValidation.failed} 条</span>
                </div>
              </div>
            </>
          )}

          {importStep === 3 && importConfirmResult && (
            <div style={pageStyles.importComplete}>
              <span>✓</span>
              <h3>正式导入完成</h3>
              <strong>已写入 {importConfirmResult.inserted} 条困难生数据</strong>
              <p>新导入记录当前为草稿态，请继续完成学院确认审核后再上载学校端。</p>
            </div>
          )}

          <div style={pageStyles.modalFooter}>
            {importStep === 1 && <button style={pageStyles.modalButton} onClick={() => {
              const template = [DIFFICULTY_STUDENT_TEMPLATE_FIELDS, DIFFICULTY_STUDENT_TEMPLATE_FIELDS.map(() => "")];
              const csv = template.map((row) => row.join(",")).join("\n");
              const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = "困难生本专科信息模板.csv";
              link.click();
              URL.revokeObjectURL(url);
            }}>下载模板</button>}

            {importStep === 1 && (
              <button
                style={isImportValidating ? pageStyles.modalDisabledButton : pageStyles.modalGreenButton}
                disabled={isImportValidating}
                onClick={selectFile}
              >
                {isImportValidating ? "正在校验" : "选择文件并校验"}
              </button>
            )}

            {importStep === 2 && importValidation && (
              <>
                <button style={pageStyles.modalButton} onClick={() => setImportStep(1)}>重新选择完整文件</button>
                {importValidation.failed > 0 ? (
                  <>
                    <button style={pageStyles.modalOrangeButton} onClick={downloadFailedImportRows}>下载失败数据</button>
                    <input
                      ref={retryFileRef}
                      type="file"
                      accept=".xlsx,.xls"
                      style={{ display: "none" }}
                      onChange={handleRetryFileChange}
                    />
                    <button
                      style={isImportValidating ? pageStyles.modalDisabledButton : pageStyles.modalGreenButton}
                      disabled={isImportValidating}
                      onClick={() => retryFileRef.current?.click()}
                    >
                      {isImportValidating ? "正在重新校验" : "只重新校验失败数据"}
                    </button>
                  </>
                ) : (
                  <button
                    style={isImportConfirming || hasBlockingRows ? pageStyles.modalDisabledButton : pageStyles.modalGreenButton}
                    disabled={isImportConfirming || hasBlockingRows}
                    onClick={handleConfirmImport}
                  >
                    {isImportConfirming ? "正在正式导入" : hasBlockingRows ? "原有治理未通过" : "正式导入"}
                  </button>
                )}
              </>
            )}

            <button style={pageStyles.modalButton} onClick={() => setActiveModal(null)}>
              {importStep === 3 ? "完成" : "关闭"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function renderSuccessTable(rows: Record<string, unknown>[], academicYear?: string, collegeName?: string) {
  if (rows.length === 0) return null;
  const extraColumns = ["学年", "学院"];
  const dataColumns = Object.keys(rows[0]).filter((col) => !extraColumns.includes(col));
  const columns = [...extraColumns, ...dataColumns];
  return (
    <table style={styles.successTable}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col} style={styles.successTh}>{col}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            <td style={styles.successTd}>{String(row["学年"] || row["academic_year"] || academicYear || "-")}</td>
            <td style={styles.successTd}>{String(row["学院"] || row["college_name"] || row["_college"] || collegeName || "-")}</td>
            {dataColumns.map((col) => (
              <td key={col} style={styles.successTd}>{String(row[col] ?? "")}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderFailedTable(rows: Record<string, unknown>[]) {
  const columns = ["原始行号", "错误字段", "错误原因", "姓名(*)", "学号", "身份证号(*)", "学院", "院系(*)"];
  const availableColumns = columns.filter((col) => rows[0] && col in rows[0]);
  if (availableColumns.length === 0) return null;
  return (
    <table style={styles.failedTable}>
      <thead>
        <tr>
          {availableColumns.map((col) => (
            <th key={col} style={styles.failedTh}>{col}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {availableColumns.map((col) => (
              <td key={col} style={col === "错误原因" ? styles.failedErrorTd : styles.failedTd}>
                {String(row[col] ?? "")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div style={pageStyles.modalBackdrop}>
      <section style={pageStyles.modal}>
        <div style={pageStyles.modalHeader}>
          <h2 style={pageStyles.modalTitle}>{title}</h2>
          <button style={pageStyles.modalClose} onClick={onClose}>×</button>
        </div>
        <div style={pageStyles.modalBody}>{children}</div>
      </section>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  successTable: {
    borderCollapse: "collapse",
    minWidth: "100%",
    fontSize: 13,
    tableLayout: "auto",
  },
  successTh: {
    border: "1px solid #cbd5e1",
    padding: "8px 12px",
    background: "#edf4fa",
    textAlign: "center",
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    zIndex: 1,
  },
  successTd: {
    border: "1px solid #cbd5e1",
    padding: "8px 12px",
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  failedTable: {
    borderCollapse: "collapse",
    minWidth: "100%",
    fontSize: 13,
    tableLayout: "auto",
  },
  failedTh: {
    border: "1px solid #cbd5e1",
    padding: "8px 12px",
    background: "#edf4fa",
    textAlign: "center",
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    zIndex: 1,
  },
  failedTd: {
    border: "1px solid #cbd5e1",
    padding: "8px 12px",
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  failedErrorTd: {
    border: "1px solid #cbd5e1",
    padding: "8px 12px",
    textAlign: "left",
    whiteSpace: "normal",
    minWidth: 200,
    maxWidth: 300,
    color: "#f56c6c",
    background: "#fff5f5",
  },
};

const pageStyles: Record<string, CSSProperties> = {
  workspace: {
    width: "100%",
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: "#f5f7fa",
  },
  headerSection: {
    flex: "0 0 auto",
    display: "flex",
    alignItems: "center",
    padding: "10px 16px",
    background: "#fff",
    borderBottom: "1px solid #e4e7ed",
  },
  headerLeft: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  pageTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    color: "#303133",
  },
  filterSection: {
    flex: "0 0 auto",
    margin: "8px 16px 0",
    background: "#fff",
    border: "1px solid #e4e7ed",
    borderRadius: 6,
    overflow: "hidden",
  },
  filterTitle: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 14px",
    background: "#f5f7fa",
    borderBottom: "1px solid #e4e7ed",
    fontWeight: 600,
    color: "#606266",
    fontSize: 13,
  },
  filterContent: {
    padding: "10px 14px",
  },
  filterRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 10,
    alignItems: "end",
  },
  filterField: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 12,
    color: "#606266",
  },
  filterButtons: {
    display: "flex",
    gap: 8,
  },
  queryButton: {
    padding: "5px 18px",
    border: "none",
    borderRadius: 4,
    background: "#409eff",
    color: "#fff",
    fontSize: 12,
    cursor: "pointer",
  },
  resetButton: {
    padding: "5px 18px",
    border: "1px solid #dcdfe6",
    borderRadius: 4,
    background: "#fff",
    color: "#606266",
    fontSize: 12,
    cursor: "pointer",
  },
  toolbarSection: {
    flex: "0 0 auto",
    display: "flex",
    gap: 8,
    padding: "8px 16px",
    background: "#fff",
    borderBottom: "1px solid #e4e7ed",
  },
  toolbarButton: {
    padding: "6px 16px",
    border: "1px solid #dcdfe6",
    borderRadius: 4,
    background: "#fff",
    color: "#606266",
    fontSize: 12,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  statusSection: {
    flex: "0 0 auto",
    display: "flex",
    gap: 10,
    padding: "6px 16px",
    background: "#fff",
    borderBottom: "1px solid #e4e7ed",
    flexWrap: "wrap",
  },
  statusBadge: {
    padding: "3px 10px",
    borderRadius: 3,
    fontSize: 12,
    background: "#ecf5ff",
    color: "#409eff",
    border: "1px solid #d9ecff",
  },
  statusSuccess: { background: "#f0f9eb", color: "#67c23a", borderColor: "#e1f3d8" },
  statusDanger: { background: "#fef0f0", color: "#f56c6c", borderColor: "#fbc4c4" },
  statusAmber: { background: "#fdf6ec", color: "#e6a23c", borderColor: "#faecd8" },
  tableSection: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    margin: "10px 16px 12px",
    background: "#fff",
    border: "1px solid #e4e7ed",
    borderRadius: 6,
    overflow: "hidden",
  },
  tableHeader: {
    flex: "0 0 auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 14px",
    background: "#f5f7fa",
    borderBottom: "1px solid #e4e7ed",
    fontSize: 14,
    fontWeight: 600,
    color: "#303133",
  },
  tableCount: {
    fontSize: 12,
    fontWeight: 400,
    color: "#909399",
  },
  tableBody: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    padding: 0,
  },
  tableScrollWrapper: {
    width: "100%",
    height: "100%",
    overflow: "auto",
    minWidth: 0,
  },
  tableFooter: {
    flex: "0 0 auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 14px",
    borderTop: "1px solid #e4e7ed",
    background: "#f5f7fa",
  },
  paginationInfo: {
    fontSize: 12,
    color: "#606266",
  },
  pagination: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  paginationButton: {
    padding: "5px 14px",
    border: "1px solid #dcdfe6",
    borderRadius: 4,
    background: "#fff",
    color: "#606266",
    fontSize: 12,
    cursor: "pointer",
  },
  paginationButtonDisabled: {
    padding: "5px 14px",
    border: "1px solid #ebeef5",
    borderRadius: 4,
    background: "#f5f7fa",
    color: "#c0c4cc",
    fontSize: 12,
    cursor: "not-allowed",
  },
  paginationText: {
    fontSize: 12,
    color: "#606266",
    minWidth: 80,
    textAlign: "center",
  },
  empty: {
    color: "#909399",
    padding: 40,
    textAlign: "center",
    fontSize: 14,
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    width: "1000px",
    maxWidth: "94vw",
    maxHeight: "88vh",
    background: "#fff",
    borderRadius: 6,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  modalHeader: {
    flex: "0 0 auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    background: "#67c23a",
    borderBottom: "1px solid #529b2e",
  },
  modalTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 600,
    color: "#fff",
  },
  modalClose: {
    width: 28,
    height: 28,
    border: "1px solid rgba(255,255,255,0.5)",
    borderRadius: 50,
    background: "transparent",
    color: "#fff",
    fontSize: 18,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBody: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  modalFooter: {
    flex: "0 0 auto",
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
    padding: "12px 16px",
    borderTop: "1px solid #e4e7ed",
    background: "#fff",
  },
  modalButton: {
    padding: "7px 20px",
    border: "1px solid #dcdfe6",
    borderRadius: 4,
    background: "#fff",
    color: "#606266",
    fontSize: 12,
    cursor: "pointer",
  },
  modalGreenButton: {
    padding: "7px 20px",
    border: "none",
    borderRadius: 4,
    background: "#67c23a",
    color: "#fff",
    fontSize: 12,
    cursor: "pointer",
    fontWeight: 600,
  },
  modalOrangeButton: {
    padding: "7px 20px",
    border: "none",
    borderRadius: 4,
    background: "#e6a23c",
    color: "#fff",
    fontSize: 12,
    cursor: "pointer",
    fontWeight: 600,
  },
  modalDisabledButton: {
    padding: "7px 20px",
    border: "none",
    borderRadius: 4,
    background: "#c0c4cc",
    color: "#fff",
    fontSize: 12,
    cursor: "not-allowed",
  },
  importDrop: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 30,
    border: "1px dashed #67c23a",
    borderRadius: 6,
    background: "#f0f9eb",
    color: "#67c23a",
    cursor: "pointer",
  },
  importSteps: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
  },
  importStep: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 6,
    background: "#f5f7fa",
    border: "1px solid #e4e7ed",
    color: "#909399",
    fontSize: 12,
  },
  importStepActive: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 6,
    background: "#f0f9eb",
    border: "1px solid #b3e19d",
    color: "#529b2e",
    fontSize: 12,
  },
  importSummary: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(110px, 1fr))",
    gap: 10,
    padding: 12,
    border: "1px solid #e4e7ed",
    borderRadius: 6,
    background: "#f8fafc",
  },
  importSummarySuccess: {
    color: "#529b2e",
  },
  importSummaryDanger: {
    color: "#f56c6c",
  },
  importComplete: {
    minHeight: 280,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
    border: "1px solid #b3e19d",
    borderRadius: 8,
    background: "#f0f9eb",
    color: "#529b2e",
    textAlign: "center",
  },
  importTabs: {
    display: "flex",
    gap: 0,
    borderBottom: "1px solid #e4e7ed",
  },
  importTab: {
    padding: "8px 20px",
    background: "#f5f7fa",
    border: "1px solid #e4e7ed",
    borderBottom: "none",
    borderRight: "none",
    borderRadius: "4px 4px 0 0",
    color: "#606266",
    fontSize: 12,
    cursor: "pointer",
  },
  importTabActive: {
    padding: "8px 20px",
    background: "#fff",
    border: "1px solid #67c23a",
    borderBottom: "none",
    borderRight: "none",
    borderRadius: "4px 4px 0 0",
    color: "#67c23a",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  importPreview: {
    border: "1px solid #e4e7ed",
    borderRadius: "0 4px 4px 4px",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
  },
  importPreviewHeader: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 12px",
    background: "#f5f7fa",
    borderBottom: "1px solid #e4e7ed",
    fontSize: 12,
    fontWeight: 600,
    color: "#606266",
  },
  importPreviewBody: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    padding: 0,
  },
  importPreviewFooter: {
    padding: "8px 12px",
    background: "#f5f7fa",
    borderTop: "1px solid #e4e7ed",
    fontSize: 12,
    color: "#909399",
    textAlign: "right",
  },
};
