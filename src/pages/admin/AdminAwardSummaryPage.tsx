import { useMemo, useState, useEffect, type ReactNode } from "react";
import {
  exportAwardAdminRecords,
  getAwardAcademicYearOptions,
  getAwardAdminRecords,
  getAwardSubmissions,
  getCurrentAcademicYear,
} from "../../services/awardProcessor";
import { awardTypeLabels } from "../../services/awardConfig";
import { normalizeHeaderName } from "../../services/awardFieldResolver";
import type { AwardAdminRecord, AwardType } from "../../types/award";
import PageHeader from "../../components/ui/PageHeader";
import Toolbar from "../../components/ui/Toolbar";
import "../awards/awards.css";

type AdminAwardSummaryPageProps = {
  awardType: AwardType;
};

const findTemplateField = (fields: string[], aliases: string[]) => {
  const normalizedAliases = aliases.map(normalizeHeaderName);
  return fields.find((field) => {
    const normalizedField = normalizeHeaderName(field);
    return normalizedAliases.some(
      (alias) => normalizedField === alias || normalizedField.includes(alias) || alias.includes(normalizedField)
    );
  });
};

const rawValue = (record: AwardAdminRecord, field?: string) =>
  String(field ? record.rawData[field] ?? "" : "");

const isFailedRecord = (record: AwardAdminRecord) => /(不通过|退回|驳回|异常)/.test(record.status);

export default function AdminAwardSummaryPage({ awardType }: AdminAwardSummaryPageProps) {
  const awardName = awardTypeLabels[awardType];
  const [records, setRecords] = useState<AwardAdminRecord[]>([]);
  const [submissions, setSubmissions] = useState<AwardAdminRecord[]>([]);
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());
  const [collegeFilter, setCollegeFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [studentIdFilter, setStudentIdFilter] = useState("");
  const [idCardFilter, setIdCardFilter] = useState("");
  const [majorFilter, setMajorFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRecord, setSelectedRecord] = useState<AwardAdminRecord | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    refreshRecords();
  }, []);

  useEffect(() => {
    setSelectedKeys(new Set());
  }, [academicYear, collegeFilter, nameFilter, studentIdFilter, idCardFilter, majorFilter, classFilter, statusFilter]);

  const templateFields = useMemo(() => {
    const orderedFields: string[] = [];
    records.forEach((record) => {
      Object.keys(record.rawData).forEach((field) => {
        if (!orderedFields.includes(field)) orderedFields.push(field);
      });
    });
    return orderedFields;
  }, [records]);
  const nameField = useMemo(() => findTemplateField(templateFields, ["学生姓名", "姓名"]), [templateFields]);
  const classField = useMemo(
    () => findTemplateField(templateFields, ["班级名称", "所在班级", "行政班", "班级"]),
    [templateFields]
  );
  const displayTemplateFields = useMemo(
    () => templateFields.filter((field) => field !== nameField),
    [nameField, templateFields]
  );

  const colleges = useMemo(
    () => [...new Set(records.map((record) => record.collegeName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [records]
  );
  const majors = useMemo(
    () => [...new Set(records.map((record) => record.major).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [records]
  );
  const classes = useMemo(
    () => [...new Set(records.map((record) => rawValue(record, classField)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [classField, records]
  );
  const filteredRecords = useMemo(
    () =>
      records.filter((record) => {
        if (hiddenKeys.has(record.id)) return false;
        if (academicYear && record.academicYear !== academicYear) return false;
        if (collegeFilter && record.collegeName !== collegeFilter) return false;
        if (nameFilter && !record.name.toLowerCase().includes(nameFilter.trim().toLowerCase())) return false;
        if (studentIdFilter && !record.studentId.toLowerCase().includes(studentIdFilter.trim().toLowerCase())) return false;
        if (idCardFilter && !record.idCard.toLowerCase().includes(idCardFilter.trim().toLowerCase())) return false;
        if (majorFilter && record.major !== majorFilter) return false;
        if (classFilter && rawValue(record, classField) !== classFilter) return false;
        if (statusFilter === "passed" && isFailedRecord(record)) return false;
        if (statusFilter === "failed" && !isFailedRecord(record)) return false;
        if (statusFilter === "confirmed" && record.reviewStatus !== "confirmed") return false;
        if (statusFilter === "submitted" && record.submitStatus !== "submitted") return false;
        return true;
      }),
    [
      academicYear,
      classField,
      classFilter,
      collegeFilter,
      hiddenKeys,
      idCardFilter,
      majorFilter,
      nameFilter,
      records,
      statusFilter,
      studentIdFilter,
    ]
  );

  const failedRecords = useMemo(() => filteredRecords.filter(isFailedRecord), [filteredRecords]);
  const passedRecords = useMemo(() => filteredRecords.filter((record) => !isFailedRecord(record)), [filteredRecords]);

  const exportRecords = (rows: AwardAdminRecord[], suffix: string) => {
    try {
      exportAwardAdminRecords(rows, `${academicYear}学年${awardName}${suffix}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "当前名单导出失败");
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

  const refreshRecords = async () => {
    const [recs, subs] = await Promise.all([getAwardAdminRecords(awardType), getAwardSubmissions(awardType)]);
    setRecords(recs);
    setSubmissions(subs);
    setHiddenKeys(new Set());
    setSelectedKeys(new Set());
  };

  const deleteSelectedFromView = () => {
    if (selectedKeys.size === 0) return;
    if (!window.confirm(`确定从当前页面隐藏选中的 ${selectedKeys.size} 条数据吗？此操作不会删除数据库数据。`)) {
      return;
    }
    setHiddenKeys((current) => new Set([...current, ...selectedKeys]));
    setSelectedKeys(new Set());
  };

  return (
    <section className="bos-table-page award-workspace">
      <PageHeader
        breadcrumb="三大奖业务 / 学校端汇总"
        title={`${awardName}汇总`}
        description="按学年读取学院已确认并上载的数据，动态展示当前奖项模板字段。"
        actions={<span className="bos-status-badge">{awardName}</span>}
      />

      <section className="bos-filter-card">
        <div className="award-advanced-filter-grid">
          <label className="bos-filter-field">
            学年
            <select value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}>
              {getAwardAcademicYearOptions(submissions).map((year) => <option key={year}>{year}</option>)}
            </select>
          </label>
          <label className="bos-filter-field">
            学院
            <select value={collegeFilter} onChange={(event) => setCollegeFilter(event.target.value)}>
              <option value="">全部学院</option>
              {colleges.map((college) => <option key={college}>{college}</option>)}
            </select>
          </label>
          <label className="bos-filter-field">
            姓名
            <input value={nameFilter} onChange={(event) => setNameFilter(event.target.value)} placeholder="学生姓名" />
          </label>
          <label className="bos-filter-field">
            学号
            <input value={studentIdFilter} onChange={(event) => setStudentIdFilter(event.target.value)} placeholder="学生学号" />
          </label>
          <label className="bos-filter-field">
            身份证号
            <input value={idCardFilter} onChange={(event) => setIdCardFilter(event.target.value)} placeholder="身份证号" />
          </label>
          <label className="bos-filter-field">
            专业
            <select value={majorFilter} onChange={(event) => setMajorFilter(event.target.value)}>
              <option value="">全部专业</option>
              {majors.map((major) => <option key={major}>{major}</option>)}
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
              <option value="confirmed">学院已确认</option>
              <option value="submitted">已上载学校端</option>
            </select>
          </label>
          <button onClick={resetFilters}>重置筛选</button>
        </div>
      </section>

      <Toolbar className="award-toolbar">
        <button onClick={refreshRecords}>刷新</button>
        <button className="is-purple" disabled={passedRecords.length === 0} onClick={() => exportRecords(passedRecords, "通过名单")}>导出通过名单</button>
        <button className="is-purple" disabled={failedRecords.length === 0} onClick={() => exportRecords(failedRecords, "不通过名单")}>导出不通过名单</button>
        <button className="is-danger" disabled={selectedKeys.size === 0} onClick={deleteSelectedFromView}>
          删除{selectedKeys.size > 0 ? `（${selectedKeys.size}）` : ""}
        </button>
      </Toolbar>

      <section className="bos-table-card">
        <div className="bos-table-card-head">
          <h2>{academicYear} 学年 {awardName}</h2>
          <span>共 {filteredRecords.length} 条 · 点击姓名查看详情</span>
        </div>
        <div className="bos-table-card-body">
          <AdminAwardRecordTable
            records={filteredRecords}
            templateFields={displayTemplateFields}
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
            onDetail={setSelectedRecord}
          />
        </div>
        <div className="bos-table-card-foot">
          <span>模板字段 {templateFields.length} 列</span>
          <span>数据源：后端数据库</span>
        </div>
      </section>

      {selectedRecord && (
        <AdminAwardModal title={`${selectedRecord.name || "学生"}详情`} onClose={() => setSelectedRecord(null)}>
          <div className="award-detail-grid">
            <DetailItem label="学年" value={selectedRecord.academicYear} />
            <DetailItem label="奖项" value={awardName} />
            <DetailItem label="学院" value={selectedRecord.collegeName} />
            <DetailItem label="上载时间" value={new Date(selectedRecord.submittedAt).toLocaleString()} />
            {Object.entries(selectedRecord.rawData).map(([field, value]) => <DetailItem key={field} label={field} value={value} />)}
          </div>
        </AdminAwardModal>
      )}
    </section>
  );
}

function AdminAwardRecordTable({
  records,
  templateFields,
  selectedKeys,
  onSelectionChange,
  onDetail,
}: {
  records: AwardAdminRecord[];
  templateFields: string[];
  selectedKeys: Set<string>;
  onSelectionChange: (keys: Set<string>) => void;
  onDetail: (record: AwardAdminRecord) => void;
}) {
  if (records.length === 0) return <div className="award-empty">当前筛选条件下暂无数据</div>;
  const recordKeys = records.map((record) => record.id);
  const allSelected = recordKeys.every((key) => selectedKeys.has(key));
  const toggleAll = () => {
    const next = new Set(selectedKeys);
    if (allSelected) recordKeys.forEach((key) => next.delete(key));
    else recordKeys.forEach((key) => next.add(key));
    onSelectionChange(next);
  };
  const toggleRow = (key: string) => {
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
              <input type="checkbox" checked={allSelected} aria-label="全选当前名单" onChange={toggleAll} />
            </th>
            <th>学年</th>
            <th>学院</th>
            <th>姓名</th>
            {templateFields.map((field) => <th key={field}>{field}</th>)}
            <th>学院审核</th>
            <th>上载状态</th>
            <th>上载时间</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const selected = selectedKeys.has(record.id);
            return (
              <tr key={record.id} className={selected ? "is-selected" : ""}>
                <td className="award-checkbox-column">
                  <input type="checkbox" checked={selected} aria-label={`选择 ${record.name || "学生"}`} onChange={() => toggleRow(record.id)} />
                </td>
                <td>{record.academicYear}</td>
                <td>{record.collegeName || "-"}</td>
                <td className="award-name-cell"><button onClick={() => onDetail(record)}>{record.name || "查看详情"}</button></td>
                {templateFields.map((field) => <td key={field}>{String(record.rawData[field] ?? "")}</td>)}
                <td><span className="award-row-status is-passed">{record.reviewStatus === "confirmed" ? "已确认" : "待确认"}</span></td>
                <td><span className="award-row-status is-passed">{record.submitStatus === "submitted" ? "已上载" : "待上载"}</span></td>
                <td>{new Date(record.submittedAt).toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AdminAwardModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="bos-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="bos-modal bos-modal--compact" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="bos-modal-header">
          <h2>{title}</h2>
          <button onClick={onClose}>关闭</button>
        </header>
        <div className="bos-modal-body">{children}</div>
      </section>
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
