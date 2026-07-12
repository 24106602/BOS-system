import { useState, useEffect, useMemo, type CSSProperties } from "react";
import * as XLSX from "xlsx-js-style";
import StudentDatabasePanel from "../components/StudentDatabasePanel";
import { getMergeBatches } from "../db/localMergeDb";
import type { CollegeProcessedBatch } from "../types/merge";
import AdminCard from "../components/ui/AdminCard";
import PageHeader from "../components/ui/PageHeader";

type MergedDetailRow = {
  idCard: string;
  name: string;
  collegeName: string;
  academicYear: string;
  familyCount: string;
  recommendLevel: string;
  studentFields: Record<string, string>;
  familyMembers: FamilyMember[];
  relationStatus: string;
};

type FamilyMember = {
  year: string;
  semester: string;
  memberName: string;
  age: string;
  relationship: string;
  workUnit: string;
  income: string;
  occupation: string;
  healthStatus: string;
};

const studentDetailColumns = [
  { key: "姓名(*)", aliases: ["姓名(*)", "姓名", "name"] },
  { key: "籍贯(*)", aliases: ["籍贯(*)", "籍贯", "native_place"] },
  { key: "身份证号(*)", aliases: ["身份证号(*)", "身份证号", "id_card"] },
  { key: "家庭人口数(*)", aliases: ["家庭人口数(*)", "家庭人口数", "family_count"] },
  { key: "手机号码(*)", aliases: ["手机号码(*)", "手机号码", "phone", "联系电话"] },
  { key: "辅导员姓名", aliases: ["辅导员姓名", "counselor_name"] },
  { key: "申请日期(*)", aliases: ["申请日期(*)", "申请日期", "apply_date"] },
  { key: "家庭地址(*)", aliases: ["家庭地址(*)", "家庭地址", "home_address"] },
  { key: "邮政编码(*)", aliases: ["邮政编码(*)", "邮政编码", "postal_code"] },
  { key: "家长手机号码(*)", aliases: ["家长手机号码(*)", "家长手机号码", "parent_phone"] },
  { key: "特殊困难类型(*)", aliases: ["特殊困难类型(*)", "特殊困难类型", "special_type", "特殊类型"] },
  { key: "家庭人均年收入(*)", aliases: ["家庭人均年收入(*)", "家庭人均年收入", "per_capita_income"] },
  { key: "是否遭受自然灾害(*)", aliases: ["是否遭受自然灾害(*)", "是否遭受自然灾害", "natural_disaster"] },
  { key: "自然灾害描述（60字）(*)", aliases: ["自然灾害描述（60字）(*)", "自然灾害描述", "natural_disaster_desc"] },
  { key: "是否遭受突发事件(*)", aliases: ["是否遭受突发事件(*)", "是否遭受突发事件", "emergency_event"] },
  { key: "突发事件描述（60字）(*)", aliases: ["突发事件描述（60字）(*)", "突发事件描述", "emergency_event_desc"] },
  { key: "家庭成员因残疾、年迈而劳动能力弱情况（60字）(*)", aliases: ["家庭成员因残疾、 无年迈而劳动能力弱情况（60字）(*)", "家庭成员因残疾、年迈而劳动能力弱情况", "labor_weak_desc"] },
  { key: "家庭成员失业情况（60字）(*)", aliases: ["家庭成员失业情况（60字）(*)", "家庭成员失业情况", "unemployment_desc"] },
  { key: "家庭欠债金额(*)", aliases: ["家庭欠债金额(*)", "家庭欠债金额", "debt_amount"] },
  { key: "家庭欠债情况（60字）(*)", aliases: ["家庭欠债情况（60字）(*)", "家庭欠债情况", "debt_desc"] },
  { key: "其他情况", aliases: ["其他情况", "other_info"] },
  { key: "推荐档次(*)", aliases: ["推荐档次(*)", "推荐档次", "recommend_level", "认定等级"] },
  { key: "陈述理由（60字）(*)", aliases: ["陈述理由（60字）(*)", "陈述理由", "reason_desc"] },
  { key: "认定时间(*)", aliases: ["认定时间(*)", "认定时间", "identify_time"] },
  { key: "是否同意评议小组意见(*)", aliases: ["是否同意评议小组意见(*)", "是否同意评议小组意见", "agree_group_opinion"] },
  { key: "院系推荐档次(*)", aliases: ["院系推荐档次(*)", "院系推荐档次", "department_recommend_level"] },
  { key: "院系意见（60字）(*)", aliases: ["院系意见（60字）(*)", "院系意见", "department_opinion"] },
  { key: "是否同意院系工作组意见(*)", aliases: ["是否同意院系工作组意见(*)", "是否同意院系工作组意见", "agree_department_opinion"] },
  { key: "学校推荐档次(*)", aliases: ["学校推荐档次(*)", "学校推荐档次", "school_recommend_level"] },
  { key: "学校意见（60字）(*)", aliases: ["学校意见（60字）(*)", "学校意见", "school_opinion"] },
  { key: "户籍性质（*）", aliases: ["户籍性质（*）", "户籍性质", "household_type"] },
  { key: "劳动力人口数（*）", aliases: ["劳动力人口数（*）", "劳动力人口数", "labor_population"] },
  { key: "家庭失业人数（*）", aliases: ["家庭失业人数（*）", "家庭失业人数", "unemployment_count"] },
  { key: "赡养人口数（*）", aliases: ["赡养人口数（*）", "赡养人口数", "support_population"] },
  { key: "是否五保户（*）", aliases: ["是否五保户（*）", "是否五保户", "five_guarantees"] },
  { key: "是否单亲家庭子女（*）", aliases: ["是否单亲家庭子女（*）", "是否单亲家庭子女", "single_parent"] },
  { key: "残疾类别（*）", aliases: ["残疾类别（*）", "残疾类别", "disability_type"] },
  { key: "父母是否丧失劳动（*）", aliases: ["父母是否丧失劳动（*）", "父母是否丧失劳动", "parents_lost_labor"] },
  { key: "家中有大病患者（*）", aliases: ["家中有大病患者（*）", "家中有大病患者", "serious_illness"] },
  { key: "收入来源(*)", aliases: ["收入来源(*)", "收入来源", "income_source"] },
];

const familyDetailColumns = [
  { key: "年度*", aliases: ["年度*", "年度", "year"] },
  { key: "学期*", aliases: ["学期*", "学期", "semester"] },
  { key: "家庭成员姓名*", aliases: ["家庭成员姓名*", "家庭成员姓名", "member_name", "成员姓名"] },
  { key: "家庭成员年龄*", aliases: ["家庭成员年龄*", "家庭成员年龄", "年龄", "age"] },
  { key: "与学生关系*", aliases: ["与学生关系*", "与学生关系", "关系", "relationship"] },
  { key: "工作或学习单位*", aliases: ["工作或学习单位*", "工作或学习单位", "work_unit"] },
  { key: "年收入（元）*", aliases: ["年收入（元）*", "年收入（元）", "年收入", "income"] },
  { key: "职业*", aliases: ["职业*", "职业", "occupation"] },
  { key: "健康状况*", aliases: ["健康状况*", "健康状况", "health_status"] },
];

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

const normalizeIdCard = (value: string) => value.replace(/\s|-/g, "").toUpperCase();

const getBatchAcademicYear = (batch: CollegeProcessedBatch) => {
  if (batch.academicYear) return batch.academicYear;
  if (batch.createdAt) {
    const year = new Date(batch.createdAt).getFullYear();
    return `${year}-${year + 1}`;
  }
  return "未知";
};

const makeMergedDetailRows = (batches: CollegeProcessedBatch[]): MergedDetailRow[] => {
  const studentBatches = batches.filter((b) => b.dataType === "student");
  const familyBatches = batches.filter((b) => b.dataType === "family");

  const familyByIdCard = new Map<string, FamilyMember[]>();
  familyBatches.forEach((batch) => {
    batch.rows.forEach((row) => {
      const idCard = normalizeIdCard(getText(row, ["学生身份证号*", "学生身份证号", "身份证件号", "身份证号"]));
      if (!idCard) return;
      familyByIdCard.set(idCard, [
        ...(familyByIdCard.get(idCard) || []),
        {
          year: getText(row, ["年度*", "年度", "year"]),
          semester: getText(row, ["学期*", "学期", "semester"]),
          memberName: getText(row, ["家庭成员姓名*", "家庭成员姓名", "成员姓名", "姓名"]),
          age: getText(row, ["家庭成员年龄*", "家庭成员年龄", "年龄", "age"]),
          relationship: getText(row, ["与学生关系*", "与学生关系", "关系", "relationship"]),
          workUnit: getText(row, ["工作或学习单位*", "工作或学习单位", "work_unit"]),
          income: getText(row, ["年收入（元）*", "年收入（元）", "年收入", "income"]),
          occupation: getText(row, ["职业*", "职业", "occupation"]),
          healthStatus: getText(row, ["健康状况*", "健康状况", "health_status"]),
        },
      ]);
    });
  });

  return studentBatches.flatMap((batch) =>
    batch.rows.map((row) => {
      const idCard = normalizeIdCard(getText(row, ["身份证号(*)", "身份证号", "身份证件号", "证件号", "学生身份证号"]));
      const familyMembers = idCard ? familyByIdCard.get(idCard) || [] : [];
      const familyCountText = getText(row, ["家庭人口数(*)", "家庭人口数", "family_count"]);
      const expectedCount = Number(familyCountText || familyMembers.length);
      const relationStatus =
        !idCard ? "缺少身份证号" :
        familyMembers.length === 0 ? "未匹配家庭成员" :
        expectedCount && expectedCount !== familyMembers.length ? `人数需复核(${expectedCount}/${familyMembers.length})` :
        "已关联";

      const studentFields: Record<string, string> = {};
      studentDetailColumns.forEach((col) => {
        studentFields[col.key] = getText(row, col.aliases);
      });

      return {
        idCard,
        name: getText(row, ["姓名(*)", "姓名", "name"]),
        collegeName: batch.collegeName,
        academicYear: getBatchAcademicYear(batch),
        familyCount: familyCountText,
        recommendLevel: getText(row, ["推荐档次(*)", "推荐档次", "recommend_level", "认定等级"]),
        studentFields,
        familyMembers,
        relationStatus,
      };
    })
  );
};

const exportMergedDetail = (detailRows: MergedDetailRow[]) => {
  const maxFamilyCount = Math.max(...detailRows.map((r) => r.familyMembers.length), 1);
  const headers: string[] = ["学院", "学年", "关联状态", ...studentDetailColumns.map((col) => col.key)];
  for (let i = 1; i <= maxFamilyCount; i++) {
    familyDetailColumns.forEach((col) => {
      headers.push(`家庭成员${i}_${col.key}`);
    });
  }

  const rows = detailRows.map((row) => {
    const base: Record<string, unknown> = {
      学院: row.collegeName,
      学年: row.academicYear,
      关联状态: row.relationStatus,
      ...row.studentFields,
    };
    row.familyMembers.forEach((member, index) => {
      familyDetailColumns.forEach((col) => {
        const key = `家庭成员${index + 1}_${col.key}`;
        base[key] =
          col.key === "年度*" ? member.year :
          col.key === "学期*" ? member.semester :
          col.key === "家庭成员姓名*" ? member.memberName :
          col.key === "家庭成员年龄*" ? member.age :
          col.key === "与学生关系*" ? member.relationship :
          col.key === "工作或学习单位*" ? member.workUnit :
          col.key === "年收入（元）*" ? member.income :
          col.key === "职业*" ? member.occupation :
          col.key === "健康状况*" ? member.healthStatus :
          "";
      });
    });
    return base;
  });

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = headers.map((h) => ({ wch: Math.min(Math.max(h.length * 1.5, 10), 40) }));
  XLSX.utils.book_append_sheet(workbook, sheet, "困难生明细");
  XLSX.writeFile(workbook, `困难生明细_${Date.now()}.xlsx`);
};

export default function DatabasePage() {
  const [tab, setTab] = useState<"database" | "detail">("database");
  const [batches, setBatches] = useState<CollegeProcessedBatch[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");

  useEffect(() => {
    getMergeBatches().then(setBatches);
  }, []);

  const detailRows = useMemo(() => makeMergedDetailRows(batches), [batches]);

  const filteredRows = useMemo(() => {
    if (!searchKeyword.trim()) return detailRows;
    const keyword = searchKeyword.toLowerCase().trim();
    return detailRows.filter((row) =>
      row.name.toLowerCase().includes(keyword) ||
      row.idCard.toLowerCase().includes(keyword) ||
      row.collegeName.toLowerCase().includes(keyword)
    );
  }, [detailRows, searchKeyword]);

  const handleExportDetail = () => {
    if (filteredRows.length === 0) {
      alert("暂无数据可导出");
      return;
    }
    exportMergedDetail(filteredRows);
  };

  return (
    <section className="bos-page-stack">
      <PageHeader
        breadcrumb="困难生业务 / 基础数据"
        title="困难生数据库"
        description="集中维护困难生基础数据，支持查询、导入与导出。"
        actions={<span className="bos-status-badge">基础数据维护</span>}
      />

      <AdminCard className="bos-database-card">
        <div style={styles.tabs}>
          <button
            style={tab === "database" ? styles.tabActive : styles.tab}
            onClick={() => setTab("database")}
          >
            数据库管理
          </button>
          <button
            style={tab === "detail" ? styles.tabActive : styles.tab}
            onClick={() => setTab("detail")}
          >
            困难生明细（{detailRows.length} 人）
          </button>
        </div>

        {tab === "database" ? (
          <StudentDatabasePanel />
        ) : (
          <div>
            <div style={styles.toolbar}>
              <input
                style={styles.searchInput}
                placeholder="搜索姓名、身份证号、学院"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
              />
              <button style={styles.exportButton} onClick={handleExportDetail}>导出明细</button>
            </div>

            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>序号</th>
                    <th style={styles.th}>学院</th>
                    <th style={styles.th}>学年</th>
                    <th style={styles.th}>姓名(*)</th>
                    <th style={styles.th}>身份证号(*)</th>
                    <th style={styles.th}>推荐档次(*)</th>
                    <th style={styles.th}>家庭人口数(*)</th>
                    {familyDetailColumns.map((col) => (
                      <th key={`family-${col.key}`} style={styles.th}>家庭成员1_{col.key}</th>
                    ))}
                    <th style={styles.th}>关联状态</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={8 + familyDetailColumns.length} style={styles.empty}>暂无困难生明细数据</td>
                    </tr>
                  ) : (
                    filteredRows.map((row, index) => {
                      const firstMember = row.familyMembers[0];
                      return (
                        <tr key={`${row.idCard}-${index}`}>
                          <td style={styles.td}>{index + 1}</td>
                          <td style={styles.td}>{row.collegeName}</td>
                          <td style={styles.td}>{row.academicYear}</td>
                          <td style={styles.td}>{row.name}</td>
                          <td style={styles.td}>{row.idCard}</td>
                          <td style={styles.td}>{row.recommendLevel}</td>
                          <td style={styles.td}>{row.familyCount}</td>
                          <td style={styles.td}>{firstMember?.year || "-"}</td>
                          <td style={styles.td}>{firstMember?.semester || "-"}</td>
                          <td style={styles.td}>{firstMember?.memberName || "-"}</td>
                          <td style={styles.td}>{firstMember?.age || "-"}</td>
                          <td style={styles.td}>{firstMember?.relationship || "-"}</td>
                          <td style={styles.td}>{firstMember?.workUnit || "-"}</td>
                          <td style={styles.td}>{firstMember?.income || "-"}</td>
                          <td style={styles.td}>{firstMember?.occupation || "-"}</td>
                          <td style={styles.td}>{firstMember?.healthStatus || "-"}</td>
                          <td style={styles.td}>
                            <span style={row.relationStatus === "已关联" ? styles.statusSuccess : styles.statusWarning}>
                              {row.relationStatus}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </AdminCard>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  tabs: {
    display: "flex",
    gap: 0,
    marginBottom: 16,
    borderBottom: "2px solid #e4e7ed",
  },
  tab: {
    padding: "8px 20px",
    border: "none",
    borderBottom: "2px solid transparent",
    background: "transparent",
    color: "#606266",
    fontSize: 14,
    cursor: "pointer",
    fontWeight: 500,
  },
  tabActive: {
    padding: "8px 20px",
    border: "none",
    borderBottom: "2px solid #0077d4",
    background: "transparent",
    color: "#0077d4",
    fontSize: 14,
    cursor: "pointer",
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
    maxHeight: 500,
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
  familyList: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    alignItems: "flex-start",
  },
  familyItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  familyRelation: {
    color: "#63738a",
    fontSize: 11,
  },
  noFamily: {
    color: "#909399",
    fontSize: 11,
  },
  statusSuccess: {
    padding: "3px 10px",
    borderRadius: 3,
    background: "#f0f9eb",
    color: "#67c23a",
    fontSize: 12,
  },
  statusWarning: {
    padding: "3px 10px",
    borderRadius: 3,
    background: "#fefce8",
    color: "#d97706",
    fontSize: 12,
  },
};
