import { useMemo, useState, useEffect, type ReactNode } from "react";
import {
  exportAwardAdminRecords,
  getAllAwardSubmissions,
  getAwardAcademicYearOptions,
  getAwardAdminRecords,
  getCurrentAcademicYear,
} from "../../../services/awardProcessor";
import { awardTypeLabels, awardTypes } from "../../../services/awardConfig";
import { normalizeHeaderName } from "../../../services/awardFieldResolver";
import type { AwardAdminRecord, AwardType } from "../../../types/award";
import PageHeader from "../../../components/ui/PageHeader";
import StatCard from "../../../components/ui/StatCard";
import Toolbar from "../../../components/ui/Toolbar";
import "../../awards/awards.css";

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

export default function AdminAwardsOverviewPage() {
  const [submissions, setSubmissions] = useState<AwardAdminRecord["awardType"][]>([]);
  const [records, setRecords] = useState<AwardAdminRecord[]>([]);
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());
  const [awardTypeFilter, setAwardTypeFilter] = useState<"all" | AwardType>("all");
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
  }, [academicYear, awardTypeFilter, collegeFilter, nameFilter, studentIdFilter, idCardFilter, majorFilter, classFilter, statusFilter]);

  const templateFields = useMemo(() => {
    const orderedFields: string[] = [];
    records
      .filter((record) => awardTypeFilter === "all" || record.awardType === awardTypeFilter)
      .forEach((record) => {
        Object.keys(record.rawData).forEach((field) => {
          if (!orderedFields.includes(field)) orderedFields.push(field);
        });
      });
    return orderedFields;
  }, [awardTypeFilter, records]);
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
    () => [...new Set(records.map((item) => item.collegeName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN")),
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
        if (awardTypeFilter !== "all" && record.awardType !== awardTypeFilter) return false;
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
      awardTypeFilter,
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
  const filteredSubmissions = useMemo(
    () =>
      submissions.filter((submission) => {
        if (academicYear && submission.academicYear !== academicYear) return false;
        if (awardTypeFilter !== "all" && submission.awardType !== awardTypeFilter) return false;
        if (collegeFilter && submission.collegeName !== collegeFilter) return false;
        return true;
      }),
    [academicYear, awardTypeFilter, collegeFilter, submissions]
  );

  // 学院提交统计数据
  const collegeStats = useMemo(() => {
    const statsMap = new Map<string, {
      collegeName: string;
      national: number;
      inspirational: number;
      shanghai: number;
      total: number;
      passed: number;
      failed: number;
    }>();

    filteredRecords.forEach((record) => {
      const key = record.collegeName || "未知学院";
      if (!statsMap.has(key)) {
        statsMap.set(key, {
          collegeName: key,
          national: 0,
          inspirational: 0,
          shanghai: 0,
          total: 0,
          passed: 0,
          failed: 0,
        });
      }
      const stat = statsMap.get(key)!;
      stat.total++;
      if (record.awardType === "national") stat.national++;
      if (record.awardType === "inspirational") stat.inspirational++;
      if (record.awardType === "shanghai") stat.shanghai++;
      if (isFailedRecord(record)) stat.failed++;
      else stat.passed++;
    });

    return Array.from(statsMap.values()).sort((a, b) => b.total - a.total);
  }, [filteredRecords]);

  const totalStats = useMemo(() => ({
    national: collegeStats.reduce((sum, s) => sum + s.national, 0),
    inspirational: collegeStats.reduce((sum, s) => sum + s.inspirational, 0),
    shanghai: collegeStats.reduce((sum, s) => sum + s.shanghai, 0),
    total: collegeStats.reduce((sum, s) => sum + s.total, 0),
    passed: collegeStats.reduce((sum, s) => sum + s.passed, 0),
    failed: collegeStats.reduce((sum, s) => sum + s.failed, 0),
  }), [collegeStats]);

  const failedRecords = useMemo(() => filteredRecords.filter(isFailedRecord), [filteredRecords]);
  const passedRecords = useMemo(() => filteredRecords.filter((record) => !isFailedRecord(record)), [filteredRecords]);
  const currentAwardLabel = awardTypeFilter === "all" ? "全部三奖" : awardTypeLabels[awardTypeFilter];

  const exportRecords = (rows: AwardAdminRecord[], suffix: string) => {
    try {
      exportAwardAdminRecords(rows, `${academicYear}学年${currentAwardLabel}${suffix}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "当前名单导出失败");
    }
  };

  const resetFilters = () => {
    setAwardTypeFilter("all");
    setCollegeFilter("");
    setNameFilter("");
    setStudentIdFilter("");
    setIdCardFilter("");
    setMajorFilter("");
    setClassFilter("");
    setStatusFilter("all");
  };

  const refreshRecords = async () => {
    const [subs, recs] = await Promise.all([getAllAwardSubmissions(), getAwardAdminRecords()]);
    setSubmissions(subs);
    setRecords(recs);
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
        breadcrumb="三大奖业务 / 学校端总览"
        title="三奖提交总览"
        description="查看各学院三类奖学金提交人数汇总。"
        actions={<span className="bos-status-badge">{currentAwardLabel}</span>}
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
            奖项类型
            <select value={awardTypeFilter} onChange={(event) => setAwardTypeFilter(event.target.value as "all" | AwardType)}>
              <option value="all">全部三奖</option>
              {awardTypes.map((type) => <option key={type} value={type}>{awardTypeLabels[type]}</option>)}
            </select>
          </label>
          <label className="bos-filter-field">
            学院
            <select value={collegeFilter} onChange={(event) => setCollegeFilter(event.target.value)}>
              <option value="">全部学院</option>
              {colleges.map((college) => <option key={college}>{college}</option>)}
            </select>
          </label>
          <button onClick={resetFilters}>重置筛选</button>
          <button className="is-purple" disabled={collegeStats.length === 0} onClick={() => {
            const rows = collegeStats.map((s) => ({
              学院名称: s.collegeName,
              [awardTypeLabels.national]: s.national,
              [awardTypeLabels.inspirational]: s.inspirational,
              [awardTypeLabels.shanghai]: s.shanghai,
              合计: s.total,
            }));
            rows.push({
              学院名称: "总计",
              [awardTypeLabels.national]: totalStats.national,
              [awardTypeLabels.inspirational]: totalStats.inspirational,
              [awardTypeLabels.shanghai]: totalStats.shanghai,
              合计: totalStats.total,
            });
            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "学院提交统计");
            XLSX.writeFile(wb, `${academicYear}_学院提交统计.xlsx`);
          }}>导出统计</button>
        </div>
      </section>

      <section className="bos-table-card">
        <div className="bos-table-card-head">
          <h2>学院提交统计</h2>
          <span>{collegeStats.length} 个学院提交 · {totalStats.total} 名学生</span>
        </div>
        <div className="bos-table-card-body">
          <div className="award-table-scroll">
            <table className="award-data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 160 }}>学院名称</th>
                  <th style={{ minWidth: 110, background: "#e8f1fb", color: "#0077d4" }}>
                    {awardTypeLabels.national}
                  </th>
                  <th style={{ minWidth: 110, background: "#e8f7ee", color: "#0a8a4a" }}>
                    {awardTypeLabels.inspirational}
                  </th>
                  <th style={{ minWidth: 110, background: "#fdf2e8", color: "#d97706" }}>
                    {awardTypeLabels.shanghai}
                  </th>
                  <th style={{ minWidth: 100, background: "#eef2ff", color: "#4f46e5" }}>
                    合计
                  </th>
                </tr>
              </thead>
              <tbody>
                {collegeStats.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "40px 20px", color: "#909399" }}>
                      当前筛选条件下暂无学院提交数据
                    </td>
                  </tr>
                ) : (
                  collegeStats.map((stat) => (
                    <tr key={stat.collegeName}>
                      <td style={{ fontWeight: 500, textAlign: "left" }}>{stat.collegeName}</td>
                      <td style={{ color: "#0077d4", fontWeight: 600 }}>{stat.national}</td>
                      <td style={{ color: "#0a8a4a", fontWeight: 600 }}>{stat.inspirational}</td>
                      <td style={{ color: "#d97706", fontWeight: 600 }}>{stat.shanghai}</td>
                      <td style={{ color: "#4f46e5", fontWeight: 700 }}>{stat.total}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {collegeStats.length > 0 && (
                <tfoot>
                  <tr style={{ background: "#f1f5f9", fontWeight: 700 }}>
                    <td style={{ textAlign: "left" }}>总计</td>
                    <td style={{ color: "#0077d4" }}>{totalStats.national}</td>
                    <td style={{ color: "#0a8a4a" }}>{totalStats.inspirational}</td>
                    <td style={{ color: "#d97706" }}>{totalStats.shanghai}</td>
                    <td style={{ color: "#4f46e5" }}>{totalStats.total}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </section>
    </section>
  );
}

function OverviewRecordTable({
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
  if (records.length === 0) return <div className="award-empty">当前筛选条件下暂无学院上载三奖数据</div>;
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
            <th>奖项类型</th>
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
                <td>{awardTypeLabels[record.awardType]}</td>
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
