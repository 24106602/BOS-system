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
    <div style={pageStyles.workspace}>
      <div style={pageStyles.topPanel}>
        <div style={pageStyles.topHeader}>
          <div>
            <div style={pageStyles.breadcrumb}>困难生业务 / 本专科信息</div>
            <h2 style={pageStyles.pageTitle}>本专科信息处理</h2>
          </div>
          <div style={pageStyles.topActions}>
            <span style={pageStyles.collegeBadge}>{studentCollegeName}</span>
            {onBackToDifficulty && <button style={pageStyles.backButton} onClick={onBackToDifficulty}>返回业务首页</button>}
          </div>
        </div>

        <div style={pageStyles.statsRow}>
          <div style={pageStyles.statItem}>
            <span>上传总数</span>
            <strong>{importTotalCount}</strong>
          </div>
          <div style={{ ...pageStyles.statItem, ...pageStyles.statGreen }}>
            <span>成功人数</span>
            <strong>{importSuccessCount}</strong>
          </div>
          <div style={{ ...pageStyles.statItem, ...pageStyles.statRed }}>
            <span>失败人数</span>
            <strong>{importFailedCount}</strong>
          </div>
          <div style={{ ...pageStyles.statItem, ...pageStyles.statAmber }}>
            <span>自动修复数</span>
            <strong>{stats.repaired}</strong>
          </div>
        </div>

        <div style={pageStyles.statusRow}>
          <span style={pageStyles.statusBadge}>当前状态：{status}</span>
          <span style={hasBlockingRows ? { ...pageStyles.statusBadge, ...pageStyles.statusDanger } : { ...pageStyles.statusBadge, ...pageStyles.statusSuccess }}>
            学院确认：{reviewStatus}
          </span>
        </div>

        <div style={pageStyles.filterPanel}>
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
            <div style={pageStyles.filterButtons}>
              <button style={pageStyles.queryButton} onClick={() => setFilters({ ...filters })}>查询</button>
              <button style={pageStyles.resetButton} onClick={resetFilters}>重置</button>
            </div>
          </div>
        </div>

        <div style={pageStyles.toolbar}>
          <button style={pageStyles.primaryButton} onClick={() => setActiveModal("import")}>数据导入</button>
          <button style={pageStyles.exportButton} disabled={!hasProcessedRows} onClick={exportExcel}>导出通过名单</button>
          <button style={pageStyles.exportButton} disabled={!hasProcessedRows} onClick={exportStudentErrorReport}>导出不通过名单</button>
          {!hideSubmitAction && (
            <>
              <button style={reviewConfirmed ? pageStyles.successButton : pageStyles.warningButton} disabled={!canConfirm} onClick={confirmCollegeReview}>
                {reviewConfirmed ? "学院已确认" : "学院确认审核"}
              </button>
              <button
                style={hasProcessedRows && reviewConfirmed && !hasBlockingRows && !uploadedToSchool ? pageStyles.successButton : pageStyles.warningButton}
                disabled={!hasProcessedRows || !reviewConfirmed || hasBlockingRows || uploadedToSchool}
                onClick={addStudentResultToMergePool}
              >
                {uploadedToSchool ? "已上载学校端" : "上载到学校端"}
              </button>
            </>
          )}
          {onViewDifficultyStudents && <button style={pageStyles.defaultButton} onClick={onViewDifficultyStudents}>查看困难生明细</button>}
        </div>
      </div>

      <div style={pageStyles.bottomPanel}>
        <div style={pageStyles.tableHeader}>
          <span>本专科困难生数据表</span>
          <span style={pageStyles.tableCount}>显示 {filteredRows.length} / {processedData.length} 条</span>
        </div>
        <div style={pageStyles.tableBody}>
          {filteredRows.length === 0 ? (
            <div style={pageStyles.empty}>暂无处理数据，请点击"数据导入"上传 Excel。</div>
          ) : (
            renderTable(filteredRows)
          )}
        </div>
      </div>

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

function Modal({ title, width = "80vw", headerTone, children, onClose }: { title: string; width?: string; headerTone?: "green"; children: ReactNode; onClose: () => void }) {
  return (
    <div style={pageStyles.modalBackdrop}>
      <section style={{ ...pageStyles.modal, width, maxWidth: "96vw", maxHeight: "90vh" }}>
        <div style={headerTone === "green" ? pageStyles.modalHeaderGreen : pageStyles.modalHeader}>
          <h2 style={headerTone === "green" ? pageStyles.modalTitleWhite : pageStyles.modalTitle}>{title}</h2>
          <button style={headerTone === "green" ? pageStyles.modalCloseWhite : undefined} onClick={onClose}>关闭</button>
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
  border: "1px solid transparent",
  borderRadius: 6,
  minHeight: 32,
  padding: "6px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
});

const pageStyles: Record<string, CSSProperties> = {
  workspace: {
    width: "100%",
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: "#f0f2f5",
  },
  topPanel: {
    flex: "0 0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "10px 12px 8px",
    background: "#fff",
    borderBottom: "1px solid #e4e7ed",
  },
  topHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  breadcrumb: {
    color: "#909399",
    fontSize: 11,
    marginBottom: 2,
  },
  pageTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 600,
    color: "#303133",
  },
  topActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  collegeBadge: {
    padding: "4px 10px",
    borderRadius: 4,
    background: "#ecf5ff",
    color: "#409eff",
    fontSize: 12,
    fontWeight: 600,
  },
  backButton: {
    padding: "5px 12px",
    border: "1px solid #dcdfe6",
    borderRadius: 4,
    background: "#fff",
    color: "#606266",
    fontSize: 12,
    cursor: "pointer",
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 8,
  },
  statItem: {
    padding: "10px 12px",
    borderRadius: 6,
    background: "#f5f7fa",
    border: "1px solid #e4e7ed",
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },
  statGreen: { background: "#f0f9eb", borderColor: "#e1f3d8", color: "#67c23a" },
  statRed: { background: "#fef0f0", borderColor: "#fbc4c4", color: "#f56c6c" },
  statAmber: { background: "#fdf6ec", borderColor: "#faecd8", color: "#e6a23c" },
  statusRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  statusBadge: {
    padding: "3px 8px",
    borderRadius: 3,
    fontSize: 11,
    background: "#ecf5ff",
    color: "#409eff",
    border: "1px solid #d9ecff",
  },
  statusSuccess: { background: "#f0f9eb", color: "#67c23a", borderColor: "#e1f3d8" },
  statusDanger: { background: "#fef0f0", color: "#f56c6c", borderColor: "#fbc4c4" },
  filterPanel: {
    padding: "8px 10px",
    border: "1px solid #e4e7ed",
    borderRadius: 6,
    background: "#fafafa",
  },
  filterRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: 8,
    alignItems: "end",
  },
  filterField: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  },
  filterButtons: {
    display: "flex",
    gap: 6,
  },
  queryButton: {
    padding: "6px 15px",
    border: "none",
    borderRadius: 4,
    background: "#409eff",
    color: "#fff",
    fontSize: 12,
    cursor: "pointer",
  },
  resetButton: {
    padding: "6px 15px",
    border: "1px solid #dcdfe6",
    borderRadius: 4,
    background: "#fff",
    color: "#606266",
    fontSize: 12,
    cursor: "pointer",
  },
  toolbar: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    paddingTop: 2,
  },
  primaryButton: { ...button("#409eff"), borderColor: "#409eff" },
  exportButton: { ...button("#67c23a"), borderColor: "#67c23a" },
  successButton: { ...button("#67c23a"), borderColor: "#67c23a" },
  warningButton: { ...button("#e6a23c"), borderColor: "#e6a23c" },
  defaultButton: {
    ...button("#fff"),
    color: "#606266",
    border: "1px solid #dcdfe6",
  },
  bottomPanel: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    margin: "8px 12px 12px",
    border: "1px solid #e4e7ed",
    borderRadius: 6,
    background: "#fff",
    overflow: "hidden",
  },
  tableHeader: {
    flex: "0 0 auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 14px",
    borderBottom: "1px solid #e4e7ed",
    background: "#fafafa",
    fontSize: 13,
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
    padding: 8,
  },
  empty: { color: "#909399", padding: 30, textAlign: "center", width: "100%" },
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
    background: "#fff",
    borderRadius: 8,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  modalHeader: { flex: "0 0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid #ebeef5", background: "#fafafa" },
  modalTitle: { margin: 0, color: "#303133", fontSize: 16, fontWeight: 600 },
  modalBody: { flex: 1, minHeight: 0, overflow: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 },
  modalFooter: { flex: "0 0 auto", display: "flex", justifyContent: "flex-end", gap: 8, padding: "10px 0 0", borderTop: "1px solid #ebeef5", background: "#fff" },
  modalTableScroll: { flex: 1, minHeight: 240, display: "flex", overflow: "auto", border: "1px solid #ebeef5", borderRadius: 4 },
  importHint: { display: "grid", gap: 4, padding: 10, borderRadius: 6, background: "#f0f9eb", border: "1px solid #e1f3d8", color: "#529b2e", fontSize: 12, lineHeight: 1.6 },
  importDrop: { display: "grid", gap: 6, placeItems: "center", textAlign: "center", border: "1px dashed #409eff", borderRadius: 6, background: "#ecf5ff", padding: 20, cursor: "pointer", color: "#409eff" },
  modalHeaderGreen: { flex: "0 0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid #67c23a", background: "#67c23a" },
  modalTitleWhite: { margin: 0, color: "#fff", fontSize: 16, fontWeight: 600 },
  modalCloseWhite: { border: "1px solid rgba(255,255,255,0.5)", borderRadius: 4, padding: "5px 10px", background: "transparent", color: "#fff", fontSize: 12, cursor: "pointer" },
  templateButton: { border: "1px solid #dcdfe6", borderRadius: 4, padding: "6px 14px", background: "#fff", color: "#606266", fontSize: 12, cursor: "pointer" },
  modalInfoGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 6 },
  infoItem: { display: "grid", gap: 3, padding: 8, border: "1px solid #ebeef5", borderRadius: 4, background: "#fafafa", color: "#909399", fontSize: 11 },
  modalLogBox: { minHeight: 60, maxHeight: 100, overflow: "auto", padding: 8, borderRadius: 4, background: "#303133", color: "#c0c4cc", fontFamily: "Consolas, monospace", fontSize: 11, lineHeight: 1.5 },
  purpleButton: button("#8e44ad"),
  greenButton: button("#67c23a"),
  orangeButton: button("#e6a23c"),
  disabledButton: { ...button("#c0c4cc"), cursor: "not-allowed" },
  secondaryButton: { border: "1px solid #dcdfe6", borderRadius: 4, padding: "6px 14px", background: "#fff", color: "#606266", fontSize: 12, cursor: "pointer" },
  importTabs: { display: "flex", gap: 4, borderBottom: "1px solid #e4e7ed" },
  importTab: { padding: "8px 16px", background: "#f5f7fa", border: "1px solid #e4e7ed", borderBottom: "none", borderRadius: "4px 4px 0 0", color: "#606266", fontSize: 12, cursor: "pointer" },
  importTabActive: { padding: "8px 16px", background: "#fff", border: "1px solid #67c23a", borderBottom: "none", borderRadius: "4px 4px 0 0", color: "#67c23a", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  importPreview: { border: "1px solid #e4e7ed", borderRadius: "0 4px 4px 4px", overflow: "hidden" },
  importPreviewHeader: { display: "flex", justifyContent: "space-between", padding: "8px 10px", background: "#f5f7fa", borderBottom: "1px solid #e4e7ed", fontSize: 12, fontWeight: 600, color: "#606266" },
  importPreviewBody: { maxHeight: 240, overflow: "auto", padding: 8 },
};
