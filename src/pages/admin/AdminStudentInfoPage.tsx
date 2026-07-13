import { useEffect, useState, useMemo, type CSSProperties } from "react";
import * as XLSX from "xlsx-js-style";
import { getMergeBatches } from "../../db/localMergeDb";
import type { CollegeProcessedBatch } from "../../types/merge";
import { getBatchAcademicYear } from "../../utils/academicYear";
import PageHeader from "../../components/ui/PageHeader";
import AdminCard from "../../components/ui/AdminCard";
import DataFilterPanel from "../../components/ui/DataFilterPanel";

type AdminStudentInfoPageProps = {
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

const studentColumns = [
  { key: "name", label: "姓名(*)", aliases: ["姓名(*)", "姓名", "name"] },
  { key: "nativePlace", label: "籍贯(*)", aliases: ["籍贯(*)", "籍贯", "native_place"] },
  { key: "idCard", label: "身份证号(*)", aliases: ["身份证号(*)", "身份证号", "id_card"] },
  { key: "familyCount", label: "家庭人口数(*)", aliases: ["家庭人口数(*)", "家庭人口数", "family_count"] },
  { key: "phone", label: "手机号码(*)", aliases: ["手机号码(*)", "手机号码", "phone", "联系电话"] },
  { key: "counselorName", label: "辅导员姓名", aliases: ["辅导员姓名", "counselor_name"] },
  { key: "applyDate", label: "申请日期(*)", aliases: ["申请日期(*)", "申请日期", "apply_date"] },
  { key: "homeAddress", label: "家庭地址(*)", aliases: ["家庭地址(*)", "家庭地址", "home_address"] },
  { key: "postalCode", label: "邮政编码(*)", aliases: ["邮政编码(*)", "邮政编码", "postal_code"] },
  { key: "parentPhone", label: "家长手机号码(*)", aliases: ["家长手机号码(*)", "家长手机号码", "parent_phone"] },
  { key: "specialType", label: "特殊困难类型(*)", aliases: ["特殊困难类型(*)", "特殊困难类型", "special_type", "特殊类型"] },
  { key: "perCapitaIncome", label: "家庭人均年收入(*)", aliases: ["家庭人均年收入(*)", "家庭人均年收入", "per_capita_income"] },
  { key: "naturalDisaster", label: "是否遭受自然灾害(*)", aliases: ["是否遭受自然灾害(*)", "是否遭受自然灾害", "natural_disaster"] },
  { key: "naturalDisasterDesc", label: "自然灾害描述（60字）(*)", aliases: ["自然灾害描述（60字）(*)", "自然灾害描述", "natural_disaster_desc"] },
  { key: "emergencyEvent", label: "是否遭受突发事件(*)", aliases: ["是否遭受突发事件(*)", "是否遭受突发事件", "emergency_event"] },
  { key: "emergencyEventDesc", label: "突发事件描述（60字）(*)", aliases: ["突发事件描述（60字）(*)", "突发事件描述", "emergency_event_desc"] },
  { key: "laborWeakDesc", label: "家庭成员因残疾、年迈而劳动能力弱情况（60字）(*)", aliases: ["家庭成员因残疾、 无年迈而劳动能力弱情况（60字）(*)", "家庭成员因残疾、年迈而劳动能力弱情况", "labor_weak_desc"] },
  { key: "unemploymentDesc", label: "家庭成员失业情况（60字）(*)", aliases: ["家庭成员失业情况（60字）(*)", "家庭成员失业情况", "unemployment_desc"] },
  { key: "debtAmount", label: "家庭欠债金额(*)", aliases: ["家庭欠债金额(*)", "家庭欠债金额", "debt_amount"] },
  { key: "debtDesc", label: "家庭欠债情况（60字）(*)", aliases: ["家庭欠债情况（60字）(*)", "家庭欠债情况", "debt_desc"] },
  { key: "otherInfo", label: "其他情况", aliases: ["其他情况", "other_info"] },
  { key: "recommendLevel", label: "推荐档次(*)", aliases: ["推荐档次(*)", "推荐档次", "recommend_level", "认定等级"] },
  { key: "reasonDesc", label: "陈述理由（60字）(*)", aliases: ["陈述理由（60字）(*)", "陈述理由", "reason_desc"] },
  { key: "identifyTime", label: "认定时间(*)", aliases: ["认定时间(*)", "认定时间", "identify_time"] },
  { key: "agreeGroupOpinion", label: "是否同意评议小组意见(*)", aliases: ["是否同意评议小组意见(*)", "是否同意评议小组意见", "agree_group_opinion"] },
  { key: "departmentRecommendLevel", label: "院系推荐档次(*)", aliases: ["院系推荐档次(*)", "院系推荐档次", "department_recommend_level"] },
  { key: "departmentOpinion", label: "院系意见（60字）(*)", aliases: ["院系意见（60字）(*)", "院系意见", "department_opinion"] },
  { key: "agreeDepartmentOpinion", label: "是否同意院系工作组意见(*)", aliases: ["是否同意院系工作组意见(*)", "是否同意院系工作组意见", "agree_department_opinion"] },
  { key: "schoolRecommendLevel", label: "学校推荐档次(*)", aliases: ["学校推荐档次(*)", "学校推荐档次", "school_recommend_level"] },
  { key: "schoolOpinion", label: "学校意见（60字）(*)", aliases: ["学校意见（60字）(*)", "学校意见", "school_opinion"] },
  { key: "householdType", label: "户籍性质（*）", aliases: ["户籍性质（*）", "户籍性质", "household_type"] },
  { key: "laborPopulation", label: "劳动力人口数（*）", aliases: ["劳动力人口数（*）", "劳动力人口数", "labor_population"] },
  { key: "unemploymentCount", label: "家庭失业人数（*）", aliases: ["家庭失业人数（*）", "家庭失业人数", "unemployment_count"] },
  { key: "supportPopulation", label: "赡养人口数（*）", aliases: ["赡养人口数（*）", "赡养人口数", "support_population"] },
  { key: "fiveGuarantees", label: "是否五保户（*）", aliases: ["是否五保户（*）", "是否五保户", "five_guarantees"] },
  { key: "singleParent", label: "是否单亲家庭子女（*）", aliases: ["是否单亲家庭子女（*）", "是否单亲家庭子女", "single_parent"] },
  { key: "disabilityType", label: "残疾类别（*）", aliases: ["残疾类别（*）", "残疾类别", "disability_type"] },
  { key: "parentsLostLabor", label: "父母是否丧失劳动（*）", aliases: ["父母是否丧失劳动（*）", "父母是否丧失劳动", "parents_lost_labor"] },
  { key: "seriousIllness", label: "家中有大病患者（*）", aliases: ["家中有大病患者（*）", "家中有大病患者", "serious_illness"] },
  { key: "incomeSource", label: "收入来源(*)", aliases: ["收入来源(*)", "收入来源", "income_source"] },
];

export default function AdminStudentInfoPage({ onNavigate }: AdminStudentInfoPageProps) {
  const [batches, setBatches] = useState<CollegeProcessedBatch[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({
    academicYear: "",
    college: "",
    keyword: "",
  });

  useEffect(() => {
    getMergeBatches().then(setBatches);
  }, []);

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleFilterReset = () => {
    setFilters({ academicYear: "", college: "", keyword: "" });
  };

  const studentBatches = batches.filter((b) => b.dataType === "student");

  const allRows = useMemo(() => {
    return studentBatches.flatMap((batch) =>
      batch.rows.map((row) => ({
        ...row,
        _batch: batch,
        _name: getText(row, ["姓名(*)", "姓名", "name"]),
        _idCard: getText(row, ["身份证号(*)", "身份证号", "id_card"]),
        _studentId: getText(row, ["学号", "student_id"]),
        _college: getText(row, ["学院", "college"]) || batch.collegeName,
        _academicYear: getBatchAcademicYear(batch),
      }))
    );
  }, [studentBatches]);

  const filteredRows = useMemo(() => {
    let result = allRows;
    
    // 学年筛选
    if (filters.academicYear) {
      result = result.filter((row) => row._academicYear === filters.academicYear);
    }
    
    // 学院筛选
    if (filters.college) {
      result = result.filter((row) => row._college === filters.college);
    }
    
    // 关键词搜索
    if (filters.keyword.trim()) {
      const keyword = filters.keyword.toLowerCase().trim();
      result = result.filter((row) =>
        row._name.toLowerCase().includes(keyword) ||
        (row._studentId && row._studentId.toLowerCase().includes(keyword)) ||
        row._idCard.toLowerCase().includes(keyword) ||
        row._college.toLowerCase().includes(keyword)
      );
    }
    
    return result;
  }, [allRows, filters]);

  const collegeStats = useMemo(() => {
    const stats: Record<string, { count: number; year: string }> = {};
    studentBatches.forEach((batch) => {
      const key = batch.collegeName;
      if (!stats[key]) {
        stats[key] = { count: 0, year: getBatchAcademicYear(batch) };
      }
      stats[key].count += batch.rowCount;
    });
    return stats;
  }, [studentBatches]);

  const exportData = () => {
    if (filteredRows.length === 0) {
      alert("暂无数据可导出");
      return;
    }
    const rows = filteredRows.map((row) => {
      const obj: Record<string, string> = {};
      studentColumns.forEach((col) => {
        obj[col.label] = getText(row, col.aliases);
      });
      obj["来源学院"] = row._college;
      obj["学年"] = getBatchAcademicYear(row._batch);
      obj["提交时间"] = row._batch.createdAt ? new Date(row._batch.createdAt).toLocaleString() : "";
      return obj;
    });
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = studentColumns.map(() => ({ wch: 16 })).concat([{ wch: 18 }, { wch: 12 }, { wch: 22 }]);
    XLSX.utils.book_append_sheet(workbook, sheet, "本专科信息");
    XLSX.writeFile(workbook, `本专科信息_${Date.now()}.xlsx`);
  };

  return (
    <section className="bos-page-stack">
      <PageHeader
        breadcrumb="困难生业务 / 本专科信息"
        title="本专科信息管理"
        description="查看各学院上传的困难生本专科信息，支持筛选、导出"
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

        <DataFilterPanel
          filters={filters}
          onChange={handleFilterChange}
          onReset={handleFilterReset}
          showAcademicYear={true}
          showCollege={true}
          showSearch={true}
          searchPlaceholder="搜索姓名、学号、身份证号、学院"
        />

        <div style={styles.toolbar}>
          <button style={styles.exportButton} onClick={exportData}>导出数据</button>
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {studentColumns.map((col) => (
                  <th key={col.key} style={styles.th}>{col.label}</th>
                ))}
                <th style={styles.th}>来源学院</th>
                <th style={styles.th}>学年</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={studentColumns.length + 2} style={styles.empty}>暂无本专科信息数据</td>
                </tr>
              ) : (
                filteredRows.map((row, index) => (
                  <tr key={`${row._idCard}-${row._studentId}-${index}`}>
                    {studentColumns.map((col) => (
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
