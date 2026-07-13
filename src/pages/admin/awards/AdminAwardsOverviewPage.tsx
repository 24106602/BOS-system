import { useMemo, useState, useEffect } from "react";
import * as XLSX from "xlsx-js-style";
import {
  getAwardAcademicYearOptions,
  getAwardAdminRecords,
  getCurrentAcademicYear,
} from "../../../services/awardProcessor";
import { awardTypeLabels } from "../../../services/awardConfig";
import type { AwardAdminRecord } from "../../../types/award";
import PageHeader from "../../../components/ui/PageHeader";
import "../../awards/awards.css";

export default function AdminAwardsOverviewPage() {
  const [records, setRecords] = useState<AwardAdminRecord[]>([]);
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());
  const [collegeFilter, setCollegeFilter] = useState("");

  useEffect(() => {
    refreshRecords();
  }, []);

  const colleges = useMemo(
    () => [...new Set(records.map((item) => item.collegeName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [records]
  );

  const yearOptions = useMemo(() => getAwardAcademicYearOptions(records), [records]);

  const filteredRecords = useMemo(
    () =>
      records.filter((record) => {
        if (academicYear && record.academicYear !== academicYear) return false;
        if (collegeFilter && record.collegeName !== collegeFilter) return false;
        return true;
      }),
    [academicYear, collegeFilter, records]
  );

  const collegeStats = useMemo(() => {
    const statsMap = new Map<string, {
      collegeName: string;
      national: number;
      inspirational: number;
      shanghai: number;
      total: number;
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
        });
      }
      const stat = statsMap.get(key)!;
      stat.total++;
      if (record.awardType === "national") stat.national++;
      if (record.awardType === "inspirational") stat.inspirational++;
      if (record.awardType === "shanghai") stat.shanghai++;
    });

    return Array.from(statsMap.values()).sort((a, b) => b.total - a.total);
  }, [filteredRecords]);

  const totalStats = useMemo(() => ({
    national: collegeStats.reduce((sum, s) => sum + s.national, 0),
    inspirational: collegeStats.reduce((sum, s) => sum + s.inspirational, 0),
    shanghai: collegeStats.reduce((sum, s) => sum + s.shanghai, 0),
    total: collegeStats.reduce((sum, s) => sum + s.total, 0),
  }), [collegeStats]);

  const refreshRecords = async () => {
    const recs = await getAwardAdminRecords();
    setRecords(recs);
  };

  const resetFilters = () => {
    setCollegeFilter("");
  };

  const exportStats = () => {
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
  };

  return (
    <section className="bos-table-page award-workspace">
      <PageHeader
        breadcrumb="三大奖业务 / 学校端总览"
        title="三奖提交总览"
        description="查看各学院三类奖学金提交人数汇总。"
      />

      <section className="bos-filter-card">
        <div className="award-advanced-filter-grid">
          <label className="bos-filter-field">
            学年
            <select value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}>
              {yearOptions.map((year) => <option key={year}>{year}</option>)}
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
          <button className="is-purple" disabled={collegeStats.length === 0} onClick={exportStats}>导出统计</button>
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