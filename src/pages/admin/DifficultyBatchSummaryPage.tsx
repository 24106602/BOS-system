import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx-js-style";
import { getMergeBatches } from "../../db/localMergeDb";
import type { CollegeProcessedBatch } from "../../types/merge";
import {
  ACADEMIC_YEAR_OPTIONS,
  getBatchAcademicYear,
  getCurrentAcademicYear,
  isBatchInAcademicYear,
} from "../../utils/academicYear";
import { normalizeSubmissionCollegeName } from "../../utils/collegeDetector";
import {
  DIFFICULTY_STUDENT_TEMPLATE_FIELDS,
  getDifficultyTemplateValue,
} from "../../constants/difficultyStudentTemplate";

type DifficultyBatchSummaryPageProps = {
  dataType: "student" | "family";
  title: string;
  description: string;
};

type SummaryRow = {
  id: string;
  academicYear: string;
  collegeName: string;
  submittedAt: string;
  values: Record<string, unknown>;
};

export default function DifficultyBatchSummaryPage({
  dataType,
  title,
  description,
}: DifficultyBatchSummaryPageProps) {
  const [batches, setBatches] = useState<CollegeProcessedBatch[]>([]);
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());
  const [collegeFilter, setCollegeFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    try {
      setBatches(await getMergeBatches());
      setSelectedKeys(new Set());
      setHiddenKeys(new Set());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRows();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRows]);

  const yearBatches = useMemo(
    () =>
      batches.filter(
        (batch) => batch.dataType === dataType && isBatchInAcademicYear(batch, academicYear)
      ),
    [academicYear, batches, dataType]
  );
  const colleges = useMemo(
    () =>
      [...new Set(yearBatches.map((batch) => normalizeSubmissionCollegeName(batch.collegeName)).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, "zh-CN")),
    [yearBatches]
  );
  const rows = useMemo<SummaryRow[]>(
    () =>
      yearBatches.flatMap((batch) =>
        batch.rows.map((values, index) => ({
          id: `${batch.id}_${index}`,
          academicYear: getBatchAcademicYear(batch),
          collegeName: normalizeSubmissionCollegeName(batch.collegeName),
          submittedAt: batch.createdAt,
          values,
        }))
      ),
    [yearBatches]
  );
  const filteredRows = useMemo(() => {
    const normalizedKeyword = appliedKeyword.trim().toLowerCase();
    return rows.filter((row) => {
      if (hiddenKeys.has(row.id)) return false;
      if (collegeFilter && row.collegeName !== collegeFilter) return false;
      if (!normalizedKeyword) return true;
      return Object.values(row.values).some((value) =>
        String(value ?? "").toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [appliedKeyword, collegeFilter, hiddenKeys, rows]);
  const dataColumns = useMemo(
    () =>
      dataType === "student"
        ? [...DIFFICULTY_STUDENT_TEMPLATE_FIELDS]
        : [...new Set(filteredRows.flatMap((row) => Object.keys(row.values)))],
    [dataType, filteredRows]
  );
  const latestAt = yearBatches.map((batch) => batch.createdAt).sort().at(-1) || "";
  const allVisibleSelected =
    filteredRows.length > 0 && filteredRows.every((row) => selectedKeys.has(row.id));

  const toggleAllRows = () => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (allVisibleSelected) filteredRows.forEach((row) => next.delete(row.id));
      else filteredRows.forEach((row) => next.add(row.id));
      return next;
    });
  };

  const toggleRow = (id: string) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelectedRows = () => {
    if (selectedKeys.size === 0) return;
    if (!confirm(`确认从当前页面移除已选中的 ${selectedKeys.size} 条记录？此操作不会删除 Supabase 数据。`)) return;
    setHiddenKeys((current) => new Set([...current, ...selectedKeys]));
    setSelectedKeys(new Set());
  };

  const resetFilters = () => {
    setCollegeFilter("");
    setKeyword("");
    setAppliedKeyword("");
  };

  const exportCurrentRows = () => {
    if (filteredRows.length === 0) {
      alert("当前筛选条件下暂无可导出数据");
      return;
    }
    const exportRows = filteredRows.map((row) => ({
      学年: row.academicYear,
      学院: row.collegeName,
      上载时间: new Date(row.submittedAt).toLocaleString(),
      ...row.values,
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet["!cols"] = Object.keys(exportRows[0]).map(() => ({ wch: 18 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, title.slice(0, 31));
    XLSX.writeFile(workbook, `${academicYear}_${title}.xlsx`);
  };

  return (
    <section className="bos-table-page difficulty-workspace">
      <header className="bos-page-title-row">
        <div>
          <div className="bos-breadcrumb">困难生业务 / 学校端汇总</div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <label className="bos-current-year">
          当前学年
          <select value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}>
            {ACADEMIC_YEAR_OPTIONS.map((year) => <option key={year}>{year}</option>)}
          </select>
        </label>
      </header>

      <div className="difficulty-stat-grid">
        <Stat label="当前数据量" value={rows.length} />
        <Stat label="筛选结果" value={filteredRows.length} />
        <Stat label="提交学院数" value={new Set(rows.map((row) => row.collegeName)).size} />
        <Stat label="提交批次数" value={yearBatches.length} />
        <Stat label="当前选中" value={selectedKeys.size} />
      </div>

      <section className="bos-filter-card">
        <div className="difficulty-summary-filter">
          <label className="bos-filter-field">
            学院/学部
            <select value={collegeFilter} onChange={(event) => setCollegeFilter(event.target.value)}>
              <option value="">全部学院</option>
              {colleges.map((college) => <option key={college}>{college}</option>)}
            </select>
          </label>
          <label className="bos-filter-field">
            关键词
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="姓名 / 学号 / 身份证号等"
            />
          </label>
          <button className="is-primary" onClick={() => setAppliedKeyword(keyword)}>查询</button>
          <button onClick={resetFilters}>重置</button>
        </div>
      </section>

      <div className="bos-action-toolbar">
        <button className="is-primary" onClick={() => void loadRows()} disabled={isLoading}>
          {isLoading ? "刷新中..." : "刷新"}
        </button>
        <button className="is-purple" onClick={exportCurrentRows}>导出当前名单</button>
        <button className="is-danger" disabled={selectedKeys.size === 0} onClick={deleteSelectedRows}>
          删除选中（{selectedKeys.size}）
        </button>
      </div>

      <section className="bos-table-card">
        <div className="bos-table-card-head">
          <h2>{academicYear} 学年{title}</h2>
          <span>最近上载：{latestAt ? new Date(latestAt).toLocaleString() : "暂无"}</span>
        </div>
        <div className="bos-table-card-body">
          <div>
            <table className="difficulty-data-table">
              <thead>
                <tr>
                  <th className="difficulty-checkbox-column">
                    <input
                      type="checkbox"
                      aria-label="选择当前全部数据"
                      checked={allVisibleSelected}
                      onChange={toggleAllRows}
                    />
                  </th>
                  {dataColumns.map((column) => <th key={column}>{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr><td className="difficulty-empty-cell" colSpan={dataColumns.length + 1}>当前学年暂无数据</td></tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id} className={selectedKeys.has(row.id) ? "difficulty-row-selected" : ""}>
                      <td className="difficulty-checkbox-column">
                        <input
                          type="checkbox"
                          aria-label="选择该行"
                          checked={selectedKeys.has(row.id)}
                          onChange={() => toggleRow(row.id)}
                        />
                      </td>
                      {dataColumns.map((column) => (
                        <td key={column}>
                          {dataType === "student"
                            ? getDifficultyTemplateValue(
                                row.values,
                                column as (typeof DIFFICULTY_STUDENT_TEMPLATE_FIELDS)[number]
                              ) || "-"
                            : String(row.values[column] ?? "") || "-"}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="bos-table-card-foot">
          <span>真实数据来源：学院已上载批次</span>
          <span>共 {filteredRows.length} 条</span>
        </div>
      </section>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="difficulty-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
