import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { readWorkbook } from "../../services/templateParser";
import {
  exportAwardExcel,
  exportAwardIssues,
  getAwardAcademicYearOptions,
  getAwardImportDiagnostics,
  getCurrentAcademicYear,
  makeAwardSubmission,
  parseAwardWorkbook,
  processAwardWorkbook,
  saveAwardSubmission,
} from "../../services/awardProcessor";
import { awardTypeLabels, awardTypes, getAwardTemplateValidationError } from "../../services/awardConfig";
import { normalizeHeaderName } from "../../services/awardFieldResolver";
import { resolveCollegeUpload } from "../../utils/collegeDetector";
import type {
  AwardIssue,
  AwardProcessResult,
  AwardProcessedRow,
  AwardTemplate,
  AwardType,
} from "../../types/award";
import PageHeader from "../../components/ui/PageHeader";
import StatCard from "../../components/ui/StatCard";
import Toolbar from "../../components/ui/Toolbar";
import "./awards.css";

type ModalName = "import" | "passed" | "failed" | "issues" | "detail" | null;
type ImportLog = { tone: "info" | "success" | "error"; message: string };

type AwardProcessPageProps = {
  awardType: AwardType;
};

const awardPaths: Record<AwardType, string> = {
  national: "/college/awards/national",
  inspirational: "/college/awards/inspirational",
  shanghai: "/college/awards/shanghai",
};

const findField = (fields: string[], aliases: string[]) => {
  const normalizedAliases = aliases.map(normalizeHeaderName);
  return fields.find((field) => {
    const normalizedField = normalizeHeaderName(field);
    return normalizedAliases.some(
      (alias) => normalizedField === alias || normalizedField.includes(alias) || alias.includes(normalizedField)
    );
  });
};

const rowValue = (row: AwardProcessedRow, field?: string) => String(field ? row.values[field] ?? "" : "");

export default function AwardProcessPage({ awardType }: AwardProcessPageProps) {
  const awardName = awardTypeLabels[awardType];
  const fileRef = useRef<HTMLInputElement>(null);
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear);
  const [template, setTemplate] = useState<AwardTemplate | null>(null);
  const [result, setResult] = useState<AwardProcessResult | null>(null);
  const [collegeName, setCollegeName] = useState("待识别学院");
  const [collegeError, setCollegeError] = useState("");
  const [fileName, setFileName] = useState("");
  const [statusMessage, setStatusMessage] = useState("请先导入 Excel，系统将自动识别模板、Sheet 并治理数据。");
  const [importLogs, setImportLogs] = useState<ImportLog[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [modal, setModal] = useState<ModalName>(null);
  const [selectedRow, setSelectedRow] = useState<AwardProcessedRow | null>(null);
  const [collegeFilter, setCollegeFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [studentIdFilter, setStudentIdFilter] = useState("");
  const [idCardFilter, setIdCardFilter] = useState("");
  const [majorFilter, setMajorFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedKeys, setSelectedKeys] = useState<Set<number>>(new Set());
  const [hiddenKeys, setHiddenKeys] = useState<Set<number>>(new Set());

  const fields = useMemo(() => template?.fields || [], [template]);
  const nameField = useMemo(() => findField(fields, ["学生姓名", "姓名"]), [fields]);
  const studentIdField = useMemo(() => findField(fields, ["学生学号", "学号"]), [fields]);
  const idCardField = useMemo(() => findField(fields, ["身份证号", "身份证件号", "证件号"]), [fields]);
  const majorField = useMemo(() => findField(fields, ["专业名称", "所在专业", "专业"]), [fields]);
  const classField = useMemo(() => findField(fields, ["班级名称", "所在班级", "行政班", "班级"]), [fields]);

  const failedRowIndexes = useMemo(
    () => new Set((result?.failedRows || []).map((row) => row.sourceRowIndex)),
    [result]
  );
  const allProcessedRows = useMemo(
    () =>
      result
        ? [...result.passedRows, ...result.failedRows].sort((left, right) => left.sourceRowIndex - right.sourceRowIndex)
        : [],
    [result]
  );
  const visibleProcessedRows = useMemo(
    () => allProcessedRows.filter((row) => !hiddenKeys.has(row.sourceRowIndex)),
    [allProcessedRows, hiddenKeys]
  );
  const majors = useMemo(
    () =>
      [...new Set(visibleProcessedRows.map((row) => rowValue(row, majorField)).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "zh-CN")
      ),
    [majorField, visibleProcessedRows]
  );
  const classes = useMemo(
    () =>
      [...new Set(visibleProcessedRows.map((row) => rowValue(row, classField)).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "zh-CN")
      ),
    [classField, visibleProcessedRows]
  );
  const filteredRows = useMemo(() => {
    const matches = (value: string, filter: string) =>
      !filter.trim() || value.toLowerCase().includes(filter.trim().toLowerCase());
    return visibleProcessedRows.filter((row) => {
      const failed = failedRowIndexes.has(row.sourceRowIndex);
      if (statusFilter === "passed" && failed) return false;
      if (statusFilter === "failed" && !failed) return false;
      if (collegeFilter && collegeName !== collegeFilter) return false;
      if (!matches(rowValue(row, nameField), nameFilter)) return false;
      if (!matches(rowValue(row, studentIdField), studentIdFilter)) return false;
      if (!matches(rowValue(row, idCardField), idCardFilter)) return false;
      if (majorFilter && rowValue(row, majorField) !== majorFilter) return false;
      if (classFilter && rowValue(row, classField) !== classFilter) return false;
      return true;
    });
  }, [
    classField,
    classFilter,
    collegeFilter,
    collegeName,
    failedRowIndexes,
    idCardField,
    idCardFilter,
    majorField,
    majorFilter,
    nameField,
    nameFilter,
    statusFilter,
    studentIdField,
    studentIdFilter,
    visibleProcessedRows,
  ]);
  const visiblePassedRows = useMemo(
    () => (result?.passedRows || []).filter((row) => !hiddenKeys.has(row.sourceRowIndex)),
    [hiddenKeys, result]
  );
  const visibleFailedRows = useMemo(
    () => (result?.failedRows || []).filter((row) => !hiddenKeys.has(row.sourceRowIndex)),
    [hiddenKeys, result]
  );
  const visibleIssues = useMemo(
    () => (result?.issues || []).filter((issue) => !hiddenKeys.has(issue.rowIndex)),
    [hiddenKeys, result]
  );

  const issuesByRow = useMemo(() => {
    const map = new Map<number, AwardIssue[]>();
    (result?.issues || []).forEach((issue) => {
      map.set(issue.rowIndex, [...(map.get(issue.rowIndex) || []), issue]);
    });
    return map;
  }, [result]);

  const openImport = () => {
    if (!fileName) {
      setImportLogs([]);
      setStatusMessage("请选择 Excel 文件，系统将自动读取并执行治理。");
    }
    setModal("import");
  };

  const chooseFile = () => {
    if (!fileRef.current) return;
    fileRef.current.value = "";
    fileRef.current.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setTemplate(null);
    setResult(null);
    setCollegeName("待识别学院");
    setCollegeError("");
    setIsProcessing(true);
    setFileName(file.name);
    setConfirmed(false);
    setSubmitted(false);
    setSelectedKeys(new Set());
    setHiddenKeys(new Set());
    setImportLogs([{ tone: "info", message: `正在读取 ${file.name}` }]);

    let workbookData: Awaited<ReturnType<typeof readWorkbook>> | null = null;
    let nextTemplate: AwardTemplate | null = null;
    try {
      workbookData = await readWorkbook(file);
      nextTemplate = parseAwardWorkbook(workbookData);
      const templateError = getAwardTemplateValidationError(awardType, file.name, nextTemplate);
      if (templateError) throw new Error(templateError);

      const detection = resolveCollegeUpload(file.name);
      const nextResult = processAwardWorkbook(nextTemplate, awardType);
      const diagnostics = getAwardImportDiagnostics({
        fileName: file.name,
        workbookData,
        template: nextTemplate,
        awardType,
      });

      setTemplate(nextTemplate);
      setResult(nextResult);
      setCollegeName(detection.collegeName);
      setCollegeError(detection.error);
      setImportLogs([
        { tone: "success", message: `已识别官方/有效 Sheet：${nextTemplate.outputSheet}` },
        ...diagnostics.map((message) => ({ tone: "info" as const, message })),
        {
          tone: detection.error ? "error" : "success",
          message: detection.error || `已识别学院：${detection.collegeName}`,
        },
        {
          tone: nextResult.failedRows.length > 0 ? "error" : "success",
          message: `治理完成：通过 ${nextResult.passedRows.length} 条，不通过 ${nextResult.failedRows.length} 条，自动修复 ${nextResult.logs.length} 项。`,
        },
      ]);
      setStatusMessage(
        nextResult.failedRows.length > 0
          ? `治理完成，存在 ${nextResult.failedRows.length} 条不通过数据，请查看问题分析并修正后重新导入。`
          : `治理完成，${nextResult.passedRows.length} 条数据全部通过，可以进行学院确认审核。`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Excel 读取或治理失败";
      setTemplate(null);
      setResult(null);
      setCollegeName("待识别学院");
      setCollegeError("");
      setImportLogs([
        { tone: "error", message },
        ...getAwardImportDiagnostics({
          fileName: file.name,
          workbookData,
          template: nextTemplate,
          awardType,
        }).map((item) => ({ tone: "info" as const, message: item })),
      ]);
      setStatusMessage(message);
    } finally {
      setIsProcessing(false);
      input.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const exportPassed = () => {
    if (!template || !result || result.passedRows.length === 0) return;
    exportAwardExcel({ awardType, template, result, exportMode: "passed" });
  };

  const exportFailed = () => {
    if (!template || !result || result.failedRows.length === 0) return;
    exportAwardExcel({ awardType, template, result, exportMode: "failed" });
  };

  const exportIssues = () => {
    if (!result) return;
    try {
      exportAwardIssues(result, awardName);
    } catch (error) {
      alert(error instanceof Error ? error.message : "问题说明导出失败");
    }
  };

  const confirmReview = () => {
    if (!result || result.passedRows.length === 0) {
      alert("请先完成数据导入与治理");
      return;
    }
    if (collegeError) {
      alert(collegeError);
      return;
    }
    if (result.failedRows.length > 0) {
      alert("存在不通过数据，不能确认审核");
      return;
    }
    setConfirmed(true);
    setSubmitted(false);
    setStatusMessage(`学院确认审核完成：${academicYear} 学年 ${awardName} 共 ${result.passedRows.length} 条。`);
  };

  const uploadToSchool = () => {
    if (!template || !result || !confirmed) {
      alert("请先完成学院确认审核");
      return;
    }
    if (result.failedRows.length > 0 || collegeError) {
      alert(collegeError || "存在不通过数据，不能上载学校端");
      return;
    }
    saveAwardSubmission(
      awardType,
      makeAwardSubmission({
        awardType,
        academicYear,
        collegeName,
        fields: template.fields,
        result,
      })
    );
    setSubmitted(true);
    setStatusMessage(`${academicYear} 学年 ${awardName} 已上载学校端，管理员汇总页面可查看。`);
  };

  const changeAcademicYear = (value: string) => {
    setAcademicYear(value);
    if (result) {
      setConfirmed(false);
      setSubmitted(false);
      setStatusMessage("学年已变更，请重新完成学院确认审核。");
    }
  };

  const resetFilters = () => {
    setCollegeFilter("");
    setNameFilter("");
    setStudentIdFilter("");
    setIdCardFilter("");
    setMajorFilter("");
    setClassFilter("");
    setStatusFilter("all");
  };

  const refreshCurrentView = () => {
    resetFilters();
    setSelectedKeys(new Set());
    setStatusMessage(result ? "当前三奖治理结果视图已刷新。" : "请先导入 Excel，系统将自动识别模板、Sheet 并治理数据。");
  };

  const deleteSelectedFromView = () => {
    if (selectedKeys.size === 0) return;
    if (!window.confirm(`确定从当前页面隐藏选中的 ${selectedKeys.size} 条数据吗？此操作不会删除 localStorage 或 Supabase 数据。`)) {
      return;
    }
    setHiddenKeys((current) => new Set([...current, ...selectedKeys]));
    setStatusMessage(`已从当前页面隐藏 ${selectedKeys.size} 条数据，底层三奖数据未删除。`);
    setSelectedKeys(new Set());
  };

  const openDetail = (row: AwardProcessedRow) => {
    setSelectedRow(row);
    setModal("detail");
  };

  const canConfirm =
    Boolean(result?.passedRows.length) &&
    result?.failedRows.length === 0 &&
    !collegeError &&
    !isProcessing &&
    !confirmed;
  const canSubmit = canConfirm === false && Boolean(result?.passedRows.length) && confirmed && !submitted;
  const availableColleges =
    collegeName && collegeName !== "待识别学院" && !collegeError ? [collegeName] : [];

  return (
    <section className="bos-processing-frame award-workspace">
      <PageHeader
        breadcrumb="三大奖业务 / 学院端数据治理"
        title={`${awardName}数据处理`}
        description="识别官方模板与 Sheet，完成数据治理、学院确认和学校端上载。"
        actions={<span className="bos-status-badge">{awardName}</span>}
      />

      <div className="award-switcher" aria-label="三大奖类型选择">
        {awardTypes.map((type) => (
          <a key={type} className={type === awardType ? "is-active" : ""} href={awardPaths[type]}>
            {awardTypeLabels[type]}
          </a>
        ))}
      </div>

      <div className="bos-stat-grid">
        <StatCard label="申报人数" value={visibleProcessedRows.length} />
        <StatCard label="通过人数" value={visiblePassedRows.length} tone="green" />
        <StatCard label="不通过人数" value={visibleFailedRows.length} tone="red" />
        <StatCard label="异常问题数" value={visibleIssues.length} tone="amber" />
      </div>

      <section className="bos-filter-card">
        <div className="award-advanced-filter-grid">
          <label className="bos-filter-field">
            学年
            <select value={academicYear} onChange={(event) => changeAcademicYear(event.target.value)}>
              {getAwardAcademicYearOptions().map((year) => <option key={year}>{year}</option>)}
            </select>
          </label>
          <label className="bos-filter-field">
            学院
            <select value={collegeFilter} onChange={(event) => setCollegeFilter(event.target.value)}>
              <option value="">全部学院</option>
              {availableColleges.map((college) => <option key={college}>{college}</option>)}
            </select>
          </label>
          <label className="bos-filter-field">
            姓名
            <input
              value={nameFilter}
              onChange={(event) => setNameFilter(event.target.value)}
              placeholder="学生姓名"
            />
          </label>
          <label className="bos-filter-field">
            学号
            <input
              value={studentIdFilter}
              onChange={(event) => setStudentIdFilter(event.target.value)}
              placeholder="学生学号"
            />
          </label>
          <label className="bos-filter-field">
            身份证号
            <input
              value={idCardFilter}
              onChange={(event) => setIdCardFilter(event.target.value)}
              placeholder="身份证号"
            />
          </label>
          <label className="bos-filter-field">
            专业
            <select value={majorFilter} onChange={(event) => setMajorFilter(event.target.value)}>
              <option value="">全部专业</option>
              {majors.map((major) => (
                <option key={major}>{major}</option>
              ))}
            </select>
          </label>
          <label className="bos-filter-field">
            班级
            <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
              <option value="">全部班级</option>
              {classes.map((className) => <option key={className}>{className}</option>)}
            </select>
          </label>
          <label className="bos-filter-field">
            审核状态
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">全部状态</option>
              <option value="passed">通过</option>
              <option value="failed">不通过</option>
            </select>
          </label>
          <button onClick={resetFilters}>重置筛选</button>
        </div>
      </section>

      <Toolbar className="award-toolbar">
        <button onClick={refreshCurrentView}>刷新</button>
        <button className="is-primary" onClick={openImport}>导入</button>
        <button className="is-purple" disabled={!result?.passedRows.length} onClick={exportPassed}>导出通过名单</button>
        <button className="is-purple" disabled={!result?.failedRows.length} onClick={exportFailed}>导出不通过名单</button>
        <button className="is-success" disabled={!canSubmit} onClick={uploadToSchool}>
          {submitted ? "已上载学校端" : "上载学校端"}
        </button>
        <button className="is-danger" disabled={selectedKeys.size === 0} onClick={deleteSelectedFromView}>
          删除{selectedKeys.size > 0 ? `（${selectedKeys.size}）` : ""}
        </button>
        <button disabled={!result} onClick={() => setModal("passed")}>通过数据（{visiblePassedRows.length}）</button>
        <button disabled={!result} onClick={() => setModal("failed")}>不通过数据（{visibleFailedRows.length}）</button>
        <button disabled={!result} onClick={() => setModal("issues")}>问题分析（{visibleIssues.length}）</button>
        <button className="is-purple" disabled={!result?.issues.length} onClick={exportIssues}>导出问题说明</button>
        <button className="is-warning" disabled={!canConfirm} onClick={confirmReview}>
          {confirmed ? "学院已确认" : "学院确认审核"}
        </button>
      </Toolbar>

      <div className="bos-status-row">
        <span className={`bos-status-badge${collegeError ? " is-danger" : result ? " is-success" : ""}`}>
          学院：{collegeError || collegeName}
        </span>
        <span className={`bos-status-badge${result?.failedRows.length ? " is-danger" : result ? " is-success" : ""}`}>
          治理：{result ? (result.failedRows.length ? "存在不通过数据" : "全部通过") : "待导入"}
        </span>
        <span className={`bos-status-badge${confirmed ? " is-success" : ""}`}>审核：{confirmed ? "学院已确认" : "待确认"}</span>
        <span className={`bos-status-badge${submitted ? " is-success" : ""}`}>上载：{submitted ? "已上载" : "待上载"}</span>
        <span className="bos-status-badge">存储：localStorage 本地暂存</span>
      </div>

      <div className="award-message">{statusMessage}</div>

      <section className="bos-table-card">
        <div className="bos-table-card-head">
          <h2>{awardName}治理结果</h2>
          <span>当前显示 {filteredRows.length} 条 · 点击姓名查看学生详情</span>
        </div>
        <div className="bos-table-card-body">
          <AwardDataTable
            fields={fields}
            rows={filteredRows}
            failedRowIndexes={failedRowIndexes}
            issuesByRow={issuesByRow}
            nameField={nameField}
            onDetail={openDetail}
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
          />
        </div>
        <div className="bos-table-card-foot">
          <span>文件：{fileName || "未导入"}</span>
          <span>三大奖数据当前暂存本地，后续接入 Supabase</span>
        </div>
      </section>

      {modal === "import" && (
        <AwardModal title={`${awardName}数据导入`} compact onClose={() => setModal(null)}>
          <div className="award-import-panel">
            <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={handleFileChange} />
            <div className="award-upload-drop">
              <div>
                <strong>{fileName || `上传${awardName} Excel`}</strong>
                <p>系统优先识别官方 Sheet，并保留申请理由、排名、课程数、日期、获奖信息和院系意见等现有校验规则。</p>
              </div>
              <button className="award-primary-button" disabled={isProcessing} onClick={chooseFile}>
                {isProcessing ? "读取并治理中..." : "选择 Excel 文件"}
              </button>
            </div>
            <div className="award-import-log">
              {importLogs.length === 0 ? (
                <div className="is-info">等待选择文件</div>
              ) : (
                importLogs.map((log, index) => (
                  <div key={`${log.message}_${index}`} className={`is-${log.tone}`}>{log.message}</div>
                ))
              )}
            </div>
          </div>
        </AwardModal>
      )}

      {modal === "passed" && (
        <AwardModal title={`通过数据（${visiblePassedRows.length}）`} onClose={() => setModal(null)}>
          <AwardDataTable
            fields={fields}
            rows={visiblePassedRows}
            failedRowIndexes={new Set()}
            issuesByRow={new Map()}
            nameField={nameField}
            onDetail={openDetail}
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
          />
        </AwardModal>
      )}

      {modal === "failed" && (
        <AwardModal title={`不通过数据（${visibleFailedRows.length}）`} onClose={() => setModal(null)}>
          <AwardDataTable
            fields={fields}
            rows={visibleFailedRows}
            failedRowIndexes={failedRowIndexes}
            issuesByRow={issuesByRow}
            nameField={nameField}
            onDetail={openDetail}
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
          />
        </AwardModal>
      )}

      {modal === "issues" && (
        <AwardModal title={`问题分析（${visibleIssues.length}）`} onClose={() => setModal(null)}>
          <IssueTable issues={visibleIssues} />
        </AwardModal>
      )}

      {modal === "detail" && selectedRow && (
        <AwardModal title={`${rowValue(selectedRow, nameField) || "学生"}详情`} compact onClose={() => setModal(null)}>
          <div className="award-detail-grid">
            <DetailItem label="Excel 行号" value={selectedRow.excelRowNumber} />
            <DetailItem label="治理状态" value={failedRowIndexes.has(selectedRow.sourceRowIndex) ? "不通过" : "通过"} />
            {fields.map((field) => <DetailItem key={field} label={field} value={selectedRow.values[field]} />)}
          </div>
        </AwardModal>
      )}
    </section>
  );
}

function AwardModal({
  title,
  compact = false,
  onClose,
  children,
}: {
  title: string;
  compact?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="bos-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`bos-modal${compact ? " bos-modal--compact" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="bos-modal-header">
          <h2>{title}</h2>
          <button onClick={onClose}>关闭</button>
        </header>
        <div className="bos-modal-body award-modal-body">{children}</div>
      </section>
    </div>
  );
}

function AwardDataTable({
  fields,
  rows,
  failedRowIndexes,
  issuesByRow,
  nameField,
  onDetail,
  selectedKeys,
  onSelectionChange,
}: {
  fields: string[];
  rows: AwardProcessedRow[];
  failedRowIndexes: Set<number>;
  issuesByRow: Map<number, AwardIssue[]>;
  nameField?: string;
  onDetail: (row: AwardProcessedRow) => void;
  selectedKeys: Set<number>;
  onSelectionChange: (keys: Set<number>) => void;
}) {
  if (rows.length === 0) return <div className="award-empty">暂无数据</div>;
  const rowKeys = rows.map((row) => row.sourceRowIndex);
  const allSelected = rowKeys.length > 0 && rowKeys.every((key) => selectedKeys.has(key));
  const toggleAll = () => {
    const next = new Set(selectedKeys);
    if (allSelected) {
      rowKeys.forEach((key) => next.delete(key));
    } else {
      rowKeys.forEach((key) => next.add(key));
    }
    onSelectionChange(next);
  };
  const toggleRow = (key: number) => {
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectionChange(next);
  };
  return (
    <div className="award-table-scroll">
      <table className="award-data-table">
        <thead>
          <tr>
            <th className="award-checkbox-column">
              <input
                type="checkbox"
                checked={allSelected}
                aria-label="全选当前数据"
                onChange={toggleAll}
              />
            </th>
            <th>Excel 行号</th>
            <th>治理状态</th>
            <th>问题数</th>
            {fields.map((field) => <th key={field}>{field}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const failed = failedRowIndexes.has(row.sourceRowIndex);
            const selected = selectedKeys.has(row.sourceRowIndex);
            return (
              <tr key={row.sourceRowIndex} className={selected ? "is-selected" : ""}>
                <td className="award-checkbox-column">
                  <input
                    type="checkbox"
                    checked={selected}
                    aria-label={`选择 Excel 第 ${row.excelRowNumber} 行`}
                    onChange={() => toggleRow(row.sourceRowIndex)}
                  />
                </td>
                <td>{row.excelRowNumber}</td>
                <td><span className={`award-row-status ${failed ? "is-failed" : "is-passed"}`}>{failed ? "不通过" : "通过"}</span></td>
                <td>{issuesByRow.get(row.sourceRowIndex)?.length || 0}</td>
                {fields.map((field) => (
                  <td key={field} className={field === nameField ? "award-name-cell" : ""}>
                    {field === nameField ? (
                      <button onClick={() => onDetail(row)}>{String(row.values[field] ?? "-")}</button>
                    ) : (
                      String(row.values[field] ?? "")
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IssueTable({ issues }: { issues: AwardIssue[] }) {
  if (issues.length === 0) return <div className="award-empty">当前没有问题，数据已全部通过。</div>;
  return (
    <div className="award-table-scroll">
      <table className="award-data-table">
        <thead>
          <tr>
            <th>Excel 行号</th>
            <th>字段</th>
            <th>原值</th>
            <th>问题原因</th>
            <th>修改建议</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue, index) => (
            <tr key={`${issue.rowIndex}_${issue.columnIndex}_${index}`}>
              <td>{issue.rowNumber}</td>
              <td>{issue.field}</td>
              <td>{String(issue.originalValue ?? "")}</td>
              <td className="award-issue-reason">{issue.reason}</td>
              <td>{issue.suggestion}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="award-detail-item">
      <span>{label}</span>
      <strong>{String(value ?? "-") || "-"}</strong>
    </div>
  );
}
