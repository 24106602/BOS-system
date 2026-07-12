import { useState, useEffect, useMemo, type CSSProperties } from "react";
import * as XLSX from "xlsx-js-style";
import StudentDatabasePanel from "../components/StudentDatabasePanel";
import { getMergeBatches } from "../db/localMergeDb";
import type { CollegeProcessedBatch } from "../types/merge";
import AdminCard from "../components/ui/AdminCard";
import PageHeader from "../components/ui/PageHeader";

type MergedDetailRow = {
  idCard: string;
  studentId: string;
  name: string;
  collegeName: string;
  academicYear: string;
  difficultyLevel: string;
  grade: string;
  gender: string;
  major: string;
  className: string;
  familyMembers: FamilyMember[];
  relationStatus: string;
};

type FamilyMember = {
  memberName: string;
  relationship: string;
  age: string;
  occupation: string;
  income: string;
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
      const idCard = normalizeIdCard(getText(row, ["student_id_card", "学生身份证号", "身份证件号", "身份证号"]));
      if (!idCard) return;
      familyByIdCard.set(idCard, [
        ...(familyByIdCard.get(idCard) || []),
        {
          memberName: getText(row, ["member_name", "家庭成员姓名", "成员姓名", "姓名"]),
          relationship: getText(row, ["relationship", "与学生关系", "关系"]),
          age: getText(row, ["age", "年龄"]),
          occupation: getText(row, ["occupation", "职业"]),
          income: getText(row, ["income", "年收入", "收入"]),
        },
      ]);
    });
  });

  return studentBatches.flatMap((batch) =>
    batch.rows.map((row) => {
      const idCard = normalizeIdCard(getText(row, ["id_card", "身份证号", "身份证件号", "证件号", "学生身份证号"]));
      const familyMembers = idCard ? familyByIdCard.get(idCard) || [] : [];
      const expectedCount = Number(getText(row, ["family_count", "家庭成员数量", "家庭人口数"]) || familyMembers.length);
      const relationStatus =
        !idCard ? "缺少身份证号" :
        familyMembers.length === 0 ? "未匹配家庭成员" :
        expectedCount && expectedCount !== familyMembers.length ? `人数需复核(${expectedCount}/${familyMembers.length})` :
        "已关联";

      return {
        idCard,
        studentId: getText(row, ["student_id", "学号", "学生学号", "学生编号"]),
        name: getText(row, ["name", "姓名", "学生姓名"]),
        collegeName: batch.collegeName,
        academicYear: getBatchAcademicYear(batch),
        difficultyLevel: getText(row, ["difficulty_level", "困难等级", "困难认定等级", "特殊困难类型", "认定等级"]),
        grade: getText(row, ["grade", "年级", "所在年级"]),
        gender: getText(row, ["gender", "性别"]),
        major: getText(row, ["major", "专业", "专业名称"]),
        className: getText(row, ["class_name", "班级", "行政班"]),
        familyMembers,
        relationStatus,
      };
    })
  );
};

const exportMergedDetail = (detailRows: MergedDetailRow[]) => {
  const maxFamilyCount = Math.max(...detailRows.map((r) => r.familyMembers.length), 1);
  const headers: string[] = [
    "学院", "学年", "学号", "姓名", "身份证号", "年级", "性别", "专业", "班级", "困难等级",
  ];
  for (let i = 1; i <= maxFamilyCount; i++) {
    headers.push(`家庭成员${i}姓名`, `家庭成员${i}关系`, `家庭成员${i}年龄`, `家庭成员${i}职业`, `家庭成员${i}年收入`);
  }

  const rows = detailRows.map((row) => {
    const base: Record<string, unknown> = {
      学院: row.collegeName,
      学年: row.academicYear,
      学号: row.studentId,
      姓名: row.name,
      身份证号: row.idCard,
      年级: row.grade,
      性别: row.gender,
      专业: row.major,
      班级: row.className,
      困难等级: row.difficultyLevel,
    };
    row.familyMembers.forEach((member, index) => {
      base[`家庭成员${index + 1}姓名`] = member.memberName;
      base[`家庭成员${index + 1}关系`] = member.relationship;
      base[`家庭成员${index + 1}年龄`] = member.age;
      base[`家庭成员${index + 1}职业`] = member.occupation;
      base[`家庭成员${index + 1}年收入`] = member.income;
    });
    return base;
  });

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  const colWidths = [18, 12, 14, 10, 20, 10, 6, 18, 16, 16];
  for (let i = 0; i < maxFamilyCount; i++) {
    colWidths.push(14, 12, 8, 16, 14);
  }
  sheet["!cols"] = colWidths.map((w) => ({ wch: w }));
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
      row.studentId.toLowerCase().includes(keyword) ||
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
                placeholder="搜索姓名、学号、身份证号、学院"
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
                    <th style={styles.th}>学号</th>
                    <th style={styles.th}>姓名</th>
                    <th style={styles.th}>身份证号</th>
                    <th style={styles.th}>年级</th>
                    <th style={styles.th}>性别</th>
                    <th style={styles.th}>困难等级</th>
                    <th style={styles.th}>家庭成员</th>
                    <th style={styles.th}>关联状态</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={styles.empty}>暂无困难生明细数据</td>
                    </tr>
                  ) : (
                    filteredRows.map((row, index) => (
                      <tr key={`${row.idCard}-${row.studentId}-${index}`}>
                        <td style={styles.td}>{index + 1}</td>
                        <td style={styles.td}>{row.collegeName}</td>
                        <td style={styles.td}>{row.academicYear}</td>
                        <td style={styles.td}>{row.studentId}</td>
                        <td style={styles.td}>{row.name}</td>
                        <td style={styles.td}>{row.idCard}</td>
                        <td style={styles.td}>{row.grade}</td>
                        <td style={styles.td}>{row.gender}</td>
                        <td style={styles.td}>{row.difficultyLevel}</td>
                        <td style={styles.td}>
                          <div style={styles.familyList}>
                            {row.familyMembers.map((member, i) => (
                              <div key={i} style={styles.familyItem}>
                                <strong>{member.memberName}</strong>
                                <span style={styles.familyRelation}>{member.relationship}</span>
                              </div>
                            ))}
                            {row.familyMembers.length === 0 && <span style={styles.noFamily}>无家庭成员</span>}
                          </div>
                        </td>
                        <td style={styles.td}>
                          <span style={row.relationStatus === "已关联" ? styles.statusSuccess : styles.statusWarning}>
                            {row.relationStatus}
                          </span>
                        </td>
                      </tr>
                    ))
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
