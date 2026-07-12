import { useEffect, useState, useMemo, type CSSProperties } from "react";
import * as XLSX from "xlsx-js-style";
import { getMergeBatches } from "../../db/localMergeDb";
import type { CollegeProcessedBatch } from "../../types/merge";
import { getBatchAcademicYear } from "../../utils/academicYear";
import PageHeader from "../../components/ui/PageHeader";
import AdminCard from "../../components/ui/AdminCard";

type AdminFamilyInfoPageProps = {
  onNavigate?: (to: string) => void;
};

const getText = (row: Record<string, unknown>, aliases: string[]) => {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  const normalizedAliases = aliases.map((item) => item.replace(/\s|\*|（.*?）|\(.*?\)/g, ""));
  const matchedKey = Object.keys(row).find((key) => {
    const normalizedKey = key.replace(/\s|\*|（.*?）|\(.*?\)/g, "");
    return normalizedAliases.some((alias) => normalizedKey.includes(alias));
  });
  return matchedKey ? String(row[matchedKey] ?? "").trim() : "";
};

const familyColumns = [
  { key: "studentIdCard", label: "学生身份证号", aliases: ["student_id_card", "学生身份证号", "身份证件号"] },
  { key: "memberName", label: "家庭成员姓名", aliases: ["member_name", "家庭成员姓名", "成员姓名"] },
  { key: "relationship", label: "与学生关系", aliases: ["relationship", "与学生关系", "关系"] },
  { key: "age", label: "年龄", aliases: ["age", "年龄"] },
  { key: "occupation", label: "职业", aliases: ["occupation", "职业"] },
  { key: "income", label: "年收入", aliases: ["income", "年收入", "收入"] },
];

export default function AdminFamilyInfoPage({ onNavigate }: AdminFamilyInfoPageProps) {
  const [batches, setBatches] = useState<CollegeProcessedBatch[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");

  useEffect(() => {
    getMergeBatches().then(setBatches);
  }, []);

  const familyBatches = batches.filter((b) => b.dataType === "family");

  const allRows = useMemo(() => {
    return familyBatches.flatMap((batch) =>
      batch.rows.map((row) => ({
        ...row,
        _batch: batch,
        _studentIdCard: getText(row, ["student_id_card", "学生身份证号"]),
        _memberName: getText(row, ["member_name", "家庭成员姓名"]),
        _college: batch.collegeName,
      }))
    );
  }, [familyBatches]);

  const filteredRows = useMemo(() => {
    if (!searchKeyword.trim()) return allRows;
    const keyword = searchKeyword.toLowerCase().trim();
    return allRows.filter((row) =>
      row._memberName.toLowerCase().includes(keyword) ||
      row._studentIdCard.toLowerCase().includes(keyword) ||
      row._college.toLowerCase().includes(keyword)
    );
  }, [allRows, searchKeyword]);

  const collegeStats = useMemo(() => {
    const stats: Record<string, { count: number; year: string }> = {};
    familyBatches.forEach((batch) => {
      const key = batch.collegeName;
      if (!stats[key]) {
        stats[key] = { count: 0, year: getBatchAcademicYear(batch) };
      }
      stats[key].count += batch.rowCount;
    });
    return stats;
  }, [familyBatches]);

  const exportData = () => {
    if (filteredRows.length === 0) {
      alert("暂无数据可导出");
      return;
    }
    const rows = filteredRows.map((row) => {
      const obj: Record<string, string> = {};
      familyColumns.forEach((col) => {
        obj[col.label] = getText(row, col.aliases);
      });
      obj["来源学院"] = row._college;
      obj["学年"] = getBatchAcademicYear(row._batch);
      obj["提交时间"] = row._batch.createdAt ? new Date(row._batch.createdAt).toLocaleString() : "";
      return obj;
    });
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = familyColumns.map(() => ({ wch: 16 })).concat([{ wch: 18 }, { wch: 12 }, { wch: 22 }]);
    XLSX.utils.book_append_sheet(workbook, sheet, "家庭成员信息");
    XLSX.writeFile(workbook, `家庭成员信息_${Date.now()}.xlsx`);
  };

  return (
    <section className="bos-page-stack">
      <PageHeader
        breadcrumb="困难生业务 / 家庭成员信息"
        title="家庭成员信息管理"
        description="查看各学院上传的家庭成员信息，支持筛选、导出"
        actions={<span className="bos-status-badge">数据管理</span>}
      />

      <AdminCard>
        <div style={styles.statsBar}>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>总条数</span>
            <strong style={styles.statValue}>{allRows.length}</strong>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>筛选结果</span>
            <strong style={styles.statValue}>{filteredRows.length}</strong>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>提交学院</span>
            <strong style={styles.statValue}>{Object.keys(collegeStats).length}</strong>
          </div>
        </div>

        <div style={styles.toolbar}>
          <input
            style={styles.searchInput}
            placeholder="搜索家庭成员姓名、学生身份证号、学院"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
          />
          <button style={styles.exportButton} onClick={exportData}>导出数据</button>
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {familyColumns.map((col) => (
                  <th key={col.key} style={styles.th}>{col.label}</th>
                ))}
                <th style={styles.th}>来源学院</th>
                <th style={styles.th}>学年</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={familyColumns.length + 2} style={styles.empty}>暂无家庭成员信息数据</td>
                </tr>
              ) : (
                filteredRows.map((row, index) => (
                  <tr key={`${row._studentIdCard}-${row._memberName}-${index}`}>
                    {familyColumns.map((col) => (
                      <td key={col.key} style={styles.td}>
                        {getText(row, col.aliases) || "-"}
                      </td>
                    ))}
                    <td style={styles.td}>{row._college}</td>
                    <td style={styles.td}>{getBatchAcademicYear(row._batch)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {Object.keys(collegeStats).length > 0 && (
          <div style={styles.collegeSummary}>
            <h3 style={styles.summaryTitle}>学院提交统计</h3>
            <div style={styles.summaryGrid}>
              {Object.entries(collegeStats).map(([college, stat]) => (
                <div key={college} style={styles.summaryItem}>
                  <span style={styles.summaryName}>{college}</span>
                  <span style={styles.summaryCount}>{stat.count} 条</span>
                  <span style={styles.summaryYear}>{stat.year}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </AdminCard>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  statsBar: {
    display: "flex",
    gap: 24,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: "1px solid #e4e7ed",
  },
  statItem: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  statLabel: {
    color: "#63738a",
    fontSize: 13,
  },
  statValue: {
    color: "#172033",
    fontSize: 20,
    fontWeight: 600,
  },
  toolbar: {
    display: "flex",
    gap: 12,
    marginBottom: 16,
    alignItems: "center",
  },
  searchInput: {
    flex: 1,
    minWidth: 200,
    padding: "8px 12px",
    border: "1px solid #dcdfe6",
    borderRadius: 4,
    fontSize: 14,
  },
  exportButton: {
    padding: "8px 16px",
    border: "none",
    borderRadius: 4,
    background: "#0077d4",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  tableWrap: {
    overflow: "auto",
    maxHeight: 450,
    border: "1px solid #e4e7ed",
    borderRadius: 6,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    border: "1px solid #cbd5e1",
    padding: "10px 12px",
    background: "#edf4fa",
    textAlign: "center",
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    zIndex: 1,
    fontWeight: 600,
    color: "#40526a",
  },
  td: {
    border: "1px solid #cbd5e1",
    padding: "8px 12px",
    textAlign: "center",
    whiteSpace: "nowrap",
    color: "#52647b",
  },
  empty: {
    padding: 40,
    textAlign: "center",
    color: "#909399",
  },
  collegeSummary: {
    marginTop: 16,
    paddingTop: 16,
    borderTop: "1px solid #e4e7ed",
  },
  summaryTitle: {
    margin: "0 0 12px",
    color: "#374151",
    fontSize: 14,
    fontWeight: 600,
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 8,
  },
  summaryItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    background: "#f8fafc",
    borderRadius: 4,
  },
  summaryName: {
    flex: 1,
    color: "#52647b",
    fontSize: 13,
  },
  summaryCount: {
    fontWeight: 600,
    color: "#172033",
  },
  summaryYear: {
    color: "#909399",
    fontSize: 12,
  },
};
