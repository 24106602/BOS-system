import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import * as XLSX from "xlsx-js-style";
import type { CollegeProcessedBatch } from "../../types/merge";
import { getMergeBatches } from "../../db/localMergeDb";
import { ACADEMIC_YEAR_OPTIONS, getBatchAcademicYear, getCurrentAcademicYear } from "../../utils/academicYear";
import { getCurrentCollegeAccount, isSameSubmissionCollege } from "../../utils/collegeDetector";

export default function CollegeRecordsPage() {
  const [rows, setRows] = useState<CollegeProcessedBatch[]>([]);
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const loadRows = useCallback(async () => {
    const currentAccount = getCurrentCollegeAccount();
    const batches = await getMergeBatches();
    setRows(
      currentAccount
        ? batches.filter((batch) => isSameSubmissionCollege(batch.collegeName, currentAccount.college_name))
        : batches
    );
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRows();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const text = keyword.trim();
    return rows.filter((item) => {
      if (academicYear && getBatchAcademicYear(item) !== academicYear) return false;
      if (text && !`${item.collegeName} ${item.dataType}`.includes(text)) return false;
      if (statusFilter && statusFilter !== "已上载学校端") return false;
      return true;
    });
  }, [academicYear, keyword, rows, statusFilter]);

  const resetFilters = () => {
    setKeyword("");
    setStatusFilter("");
  };

  const exportCurrentRows = () => {
    if (filteredRows.length === 0) {
      alert("当前筛选条件下暂无可导出的提交记录");
      return;
    }
    const exportRows = filteredRows.map((item) => ({
      提交单位: item.collegeName,
      学年: getBatchAcademicYear(item),
      数据类型: item.dataType === "student" ? "本专科信息" : "家庭成员信息",
      通过人数: item.rowCount,
      不通过人数: 0,
      提交状态: "已上载学校端",
      最近提交时间: new Date(item.createdAt).toLocaleString(),
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet["!cols"] = Object.keys(exportRows[0]).map(() => ({ wch: 18 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "学院提交记录");
    XLSX.writeFile(workbook, `${academicYear}_学院提交记录.xlsx`);
  };

  return (
    <section className="bos-table-page difficulty-workspace">
      <header className="bos-page-title-row">
        <div>
          <div className="bos-breadcrumb">困难生业务 / 提交记录</div>
          <h1>学院提交记录</h1>
          <p>提交记录按学年归档展示，当前数据来源为学院端上载到学校端的通过批次。</p>
        </div>
        <label className="bos-current-year">
          当前学年
          <select value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}>
            {ACADEMIC_YEAR_OPTIONS.map((year) => <option key={year}>{year}</option>)}
          </select>
        </label>
      </header>

      <section className="bos-filter-card">
        <div className="difficulty-summary-filter">
          <label className="bos-filter-field">
            搜索
            <input value={keyword} placeholder="提交单位 / 数据类型" onChange={(event) => setKeyword(event.target.value)} />
          </label>
          <label className="bos-filter-field">
            状态
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">全部状态</option>
              <option value="未处理">未处理</option>
              <option value="已处理待确认">已处理待确认</option>
              <option value="学院已确认">学院已确认</option>
              <option value="已上载学校端">已上载学校端</option>
              <option value="存在不通过">存在不通过</option>
            </select>
          </label>
          <button className="is-primary" onClick={() => void loadRows()}>查询</button>
          <button onClick={resetFilters}>重置</button>
        </div>
      </section>

      <div className="bos-action-toolbar">
        <button className="is-primary" onClick={() => void loadRows()}>刷新</button>
        <button className="is-purple" onClick={exportCurrentRows}>导出当前记录</button>
      </div>

      <section className="bos-table-card">
        <div className="bos-table-card-head">
          <h2>{academicYear} 学年提交记录</h2>
          <span>{filteredRows.length} 个批次</span>
        </div>
        <div className="bos-table-card-body">
          <div>
          <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>提交单位</th>
              <th style={styles.th}>学年</th>
              <th style={styles.th}>数据类型</th>
              <th style={styles.th}>通过人数</th>
              <th style={styles.th}>不通过人数</th>
              <th style={styles.th}>提交状态</th>
              <th style={styles.th}>最近提交时间</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td style={styles.td} colSpan={7}>暂无记录</td>
              </tr>
            ) : (
              filteredRows.map((item) => (
                <tr key={item.id}>
                  <td style={styles.td}>{item.collegeName}</td>
                  <td style={styles.td}>{getBatchAcademicYear(item)}</td>
                  <td style={styles.td}>{item.dataType === "student" ? "本专科信息" : "家庭成员信息"}</td>
                  <td style={styles.td}>{item.rowCount}</td>
                  <td style={styles.td}>0</td>
                  <td style={styles.td}><span style={styles.uploadedTag}>已上载学校端</span></td>
                  <td style={styles.td}>{new Date(item.createdAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
          </div>
        </div>
        <div className="bos-table-card-foot">
          <span>数据来源：本学院上载记录</span>
          <span>共 {filteredRows.length} 条</span>
        </div>
      </section>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { height: "calc(100vh - 104px)", minHeight: 560, display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: 12, overflow: "hidden", background: "#fff", borderRadius: 8, padding: 14, border: "1px solid #d7e1ed", boxShadow: "0 4px 14px rgba(15,35,64,0.05)" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "end", gap: 14 },
  title: { margin: "0 0 8px 0", color: "#172033", fontSize: 22 },
  description: { color: "#63738a", fontSize: 13, margin: "0 0 12px", lineHeight: 1.7 },
  toolbar: { display: "grid", gridTemplateColumns: "130px minmax(180px, 1fr) 150px", gap: 8, alignItems: "end", minWidth: 520 },
  fieldLabel: { display: "grid", gap: 5, color: "#40526a", fontSize: 12, fontWeight: 800 },
  select: { border: "1px solid #cfdbe7", borderRadius: 6, padding: "8px 9px", color: "#15304f", background: "#fff", fontSize: 13 },
  input: { border: "1px solid #cfdbe7", borderRadius: 6, padding: "8px 9px", color: "#15304f", background: "#fff", fontSize: 13 },
  tableWrap: { height: "100%", minHeight: 320, overflow: "auto", border: "1px solid #d7e1ed", borderRadius: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { position: "sticky", top: 0, zIndex: 1, border: "1px solid #d7e1ed", background: "#edf4fa", padding: 8, whiteSpace: "nowrap" },
  td: { border: "1px solid #cbd5e1", padding: 8, textAlign: "center", whiteSpace: "nowrap" },
  uploadedTag: { display: "inline-flex", padding: "3px 7px", borderRadius: 999, background: "#e8f7f1", color: "#087b5b", fontWeight: 800, fontSize: 12 },
};
