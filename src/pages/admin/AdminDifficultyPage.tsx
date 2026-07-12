import { useEffect, useState, useMemo, type CSSProperties } from "react";
import * as XLSX from "xlsx-js-style";
import { getMergeBatches } from "../../db/localMergeDb";
import type { CollegeProcessedBatch } from "../../types/merge";
import { getBatchAcademicYear } from "../../utils/academicYear";
import { normalizeSubmissionCollegeName } from "../../utils/collegeDetector";

type AdminDifficultyPageProps = {
  onNavigate?: (to: string) => void;
};

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
  studentRaw: Record<string, unknown>;
  familyMembers: FamilyMember[];
  relationStatus: string;
};

type FamilyMember = {
  memberName: string;
  relationship: string;
  age: string;
  occupation: string;
  income: string;
  raw: Record<string, unknown>;
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
          raw: row,
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
        !idCard ? "缺少身份证号，无法关联" :
        familyMembers.length === 0 ? "未匹配到家庭成员" :
        expectedCount && expectedCount !== familyMembers.length ? `家庭成员数量需复核（期望${expectedCount}人，实际${familyMembers.length}人）` :
        "已关联";

      return {
        idCard,
        studentId: getText(row, ["student_id", "学号", "学生学号", "学生编号"]),
        name: getText(row, ["name", "姓名", "学生姓名"]),
        collegeName: normalizeSubmissionCollegeName(batch.collegeName),
        academicYear: getBatchAcademicYear(batch),
        difficultyLevel: getText(row, ["difficulty_level", "困难等级", "困难认定等级", "特殊困难类型", "认定等级"]),
        grade: getText(row, ["grade", "年级", "所在年级"]),
        gender: getText(row, ["gender", "性别"]),
        major: getText(row, ["major", "专业", "专业名称"]),
        className: getText(row, ["class_name", "班级", "行政班"]),
        studentRaw: row,
        familyMembers,
        relationStatus,
      };
    })
  );
};

const exportStudentData = (batches: CollegeProcessedBatch[]) => {
  const studentBatches = batches.filter((b) => b.dataType === "student");
  const rows = studentBatches.flatMap((batch) =>
    batch.rows.map((row) => ({
      学院: batch.collegeName,
      学年: getBatchAcademicYear(batch),
      学号: getText(row, ["student_id", "学号"]),
      姓名: getText(row, ["name", "姓名"]),
      身份证号: getText(row, ["id_card", "身份证号"]),
      年级: getText(row, ["grade", "年级"]),
      性别: getText(row, ["gender", "性别"]),
      专业: getText(row, ["major", "专业"]),
      班级: getText(row, ["class_name", "班级"]),
      困难等级: getText(row, ["difficulty_level", "困难等级"]),
      特殊困难类型: getText(row, ["special_type", "特殊困难类型"]),
      提交时间: batch.createdAt ? new Date(batch.createdAt).toLocaleString() : "",
    }))
  );

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 20 },
    { wch: 10 }, { wch: 6 }, { wch: 18 }, { wch: 16 }, { wch: 16 },
    { wch: 20 }, { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, "本专科信息");
  XLSX.writeFile(workbook, `困难生本专科信息_${Date.now()}.xlsx`);
};

const exportFamilyData = (batches: CollegeProcessedBatch[]) => {
  const familyBatches = batches.filter((b) => b.dataType === "family");
  const rows = familyBatches.flatMap((batch) =>
    batch.rows.map((row) => ({
      学院: batch.collegeName,
      学年: getBatchAcademicYear(batch),
      学生身份证号: getText(row, ["student_id_card", "学生身份证号"]),
      家庭成员姓名: getText(row, ["member_name", "家庭成员姓名"]),
      与学生关系: getText(row, ["relationship", "与学生关系"]),
      年龄: getText(row, ["age", "年龄"]),
      职业: getText(row, ["occupation", "职业"]),
      年收入: getText(row, ["income", "年收入"]),
      提交时间: batch.createdAt ? new Date(batch.createdAt).toLocaleString() : "",
    }))
  );

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 18 }, { wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 12 },
    { wch: 8 }, { wch: 16 }, { wch: 14 }, { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, "家庭成员信息");
  XLSX.writeFile(workbook, `困难生家庭成员信息_${Date.now()}.xlsx`);
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

export default function AdminDifficultyPage({ onNavigate }: AdminDifficultyPageProps) {
  const [batches, setBatches] = useState<CollegeProcessedBatch[]>([]);
  const [tab, setTab] = useState<"student" | "family" | "detail">("student");

  useEffect(() => {
    getMergeBatches().then(setBatches);
  }, []);

  const studentBatches = batches.filter((b) => b.dataType === "student");
  const familyBatches = batches.filter((b) => b.dataType === "family");
  const studentTotal = studentBatches.reduce((sum, b) => sum + b.rowCount, 0);
  const familyTotal = familyBatches.reduce((sum, b) => sum + b.rowCount, 0);
  const collegeCount = new Set(batches.map((b) => b.collegeName)).size;

  const detailRows = useMemo(() => makeMergedDetailRows(batches), [batches]);
  const currentBatches = tab === "student" ? studentBatches : familyBatches;
  const currentTotal = tab === "student" ? studentTotal : familyTotal;

  const handleExport = () => {
    if (tab === "student") {
      exportStudentData(batches);
    } else if (tab === "family") {
      exportFamilyData(batches);
    } else {
      exportMergedDetail(detailRows);
    }
  };

  return (
    <section>
      <div style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>学校管理员端 / 困难生业务</div>
          <h1 style={styles.title}>困难生数据治理平台</h1>
          <p style={styles.text}>管理全校困难生数据，统计学院上传情况，查看本专科信息与家庭成员信息汇总。</p>
        </div>
        <div style={styles.heroBadge}>困难生业务已启用</div>
      </div>

      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>已提交学院数</span>
          <strong style={styles.statValue}>{collegeCount}</strong>
        </div>
        <div style={{ ...styles.statCard, ...styles.statBlue }}>
          <span style={styles.statLabel}>本专科信息</span>
          <strong style={styles.statValue}>{studentTotal}</strong>
        </div>
        <div style={{ ...styles.statCard, ...styles.statGreen }}>
          <span style={styles.statLabel}>家庭成员信息</span>
          <strong style={styles.statValue}>{familyTotal}</strong>
        </div>
        <div style={{ ...styles.statCard, ...styles.statPurple }}>
          <span style={styles.statLabel}>困难生明细</span>
          <strong style={styles.statValue}>{detailRows.length}</strong>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.tabs}>
            <button
              style={tab === "student" ? styles.tabActive : styles.tab}
              onClick={() => setTab("student")}
            >
              本专科信息（{studentBatches.length} 学院，{studentTotal} 条）
            </button>
            <button
              style={tab === "family" ? styles.tabActive : styles.tab}
              onClick={() => setTab("family")}
            >
              家庭成员信息（{familyBatches.length} 学院，{familyTotal} 条）
            </button>
            <button
              style={tab === "detail" ? styles.tabActive : styles.tab}
              onClick={() => setTab("detail")}
            >
              困难生明细（合并视图，{detailRows.length} 人）
            </button>
          </div>
          <div style={styles.headerActions}>
            <button style={styles.primaryButton} onClick={() => onNavigate?.("/admin/difficulty/database")}>
              进入困难生数据库
            </button>
            <button style={styles.secondaryButton} onClick={handleExport}>
              导出{tab === "student" ? "本专科" : tab === "family" ? "家庭成员" : "明细"}数据
            </button>
          </div>
        </div>

        {tab === "detail" ? (
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
                {detailRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={styles.empty}>暂无困难生明细数据</td>
                  </tr>
                ) : (
                  detailRows.map((row, index) => (
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
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>序号</th>
                  <th style={styles.th}>学院名称</th>
                  <th style={styles.th}>学年</th>
                  <th style={styles.th}>{tab === "student" ? "本专科信息条数" : "家庭成员信息条数"}</th>
                  <th style={styles.th}>提交时间</th>
                  <th style={styles.th}>状态</th>
                </tr>
              </thead>
              <tbody>
                {currentBatches.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={styles.empty}>
                      暂无{tab === "student" ? "本专科信息" : "家庭成员信息"}提交数据
                    </td>
                  </tr>
                ) : (
                  currentBatches.map((batch, index) => (
                    <tr key={batch.id || index}>
                      <td style={styles.td}>{index + 1}</td>
                      <td style={styles.td}>{batch.collegeName || "—"}</td>
                      <td style={styles.td}>{batch.academicYear || getBatchAcademicYear(batch)}</td>
                      <td style={styles.td}>{batch.rowCount}</td>
                      <td style={styles.td}>
                        {batch.createdAt ? new Date(batch.createdAt).toLocaleString() : "—"}
                      </td>
                      <td style={styles.td}>
                        <span style={styles.statusBadge}>已上载</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {currentBatches.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={3} style={styles.tfootTd}><strong>合计</strong></td>
                    <td style={styles.tfootTd}><strong>{currentTotal}</strong></td>
                    <td colSpan={2} style={styles.tfootTd}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      <div style={styles.infoCard}>
        <h2 style={styles.infoTitle}>业务流程说明</h2>
        <div style={styles.infoSteps}>
          <div style={styles.infoStep}>
            <span style={styles.infoNumber}>1</span>
            <div>
              <strong>配置在校生数据库</strong>
              <p>在侧边栏"在校生数据库"中导入全校在校生基础信息。</p>
            </div>
          </div>
          <div style={styles.infoStep}>
            <span style={styles.infoNumber}>2</span>
            <div>
              <strong>学院端导入数据</strong>
              <p>各学院上传困难生本专科信息和家庭成员信息，系统自动校验在校身份。</p>
            </div>
          </div>
          <div style={styles.infoStep}>
            <span style={styles.infoNumber}>3</span>
            <div>
              <strong>学校端汇总统计</strong>
              <p>在本页面查看各学院上传情况，切换标签页查看本专科、家庭成员数据和合并明细。</p>
            </div>
          </div>
          <div style={styles.infoStep}>
            <span style={styles.infoNumber}>4</span>
            <div>
              <strong>导出数据</strong>
              <p>点击导出按钮下载全校汇总数据，支持本专科信息、家庭成员信息和合并明细三种格式。</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  hero: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: 20,
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    background: "#fff",
    boxShadow: "0 4px 14px rgba(15, 35, 64, 0.05)",
    marginBottom: 14,
  },
  eyebrow: { color: "#0077d4", fontSize: 13, fontWeight: 800 },
  title: { margin: "5px 0 7px", color: "#172033", fontSize: 26 },
  text: { margin: 0, color: "#63738a", fontSize: 14, lineHeight: 1.7 },
  heroBadge: {
    padding: "7px 10px",
    borderRadius: 999,
    background: "#e9f8f2",
    color: "#087b5b",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
    marginBottom: 14,
  },
  statCard: {
    padding: 16,
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    background: "#fff",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  statBlue: { borderLeft: "4px solid #409eff" },
  statGreen: { borderLeft: "4px solid #67c23a" },
  statPurple: { borderLeft: "4px solid #909399" },
  statLabel: { color: "#63738a", fontSize: 13 },
  statValue: { color: "#172033", fontSize: 24 },
  card: {
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    background: "#fff",
    overflow: "hidden",
    marginBottom: 14,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid #e4e7ed",
    flexWrap: "wrap",
    gap: 10,
  },
  tabs: { display: "flex", gap: 0 },
  tab: {
    padding: "8px 18px",
    border: "1px solid #dcdfe6",
    borderBottom: "none",
    background: "#f5f7fa",
    color: "#606266",
    fontSize: 13,
    cursor: "pointer",
    borderRadius: "4px 4px 0 0",
  },
  tabActive: {
    padding: "8px 18px",
    border: "1px solid #409eff",
    borderBottom: "none",
    background: "#fff",
    color: "#409eff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    borderRadius: "4px 4px 0 0",
  },
  headerActions: { display: "flex", gap: 10 },
  primaryButton: {
    padding: "7px 18px",
    border: "none",
    borderRadius: 4,
    background: "#0077d4",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  secondaryButton: {
    padding: "7px 18px",
    border: "1px solid #dcdfe6",
    borderRadius: 4,
    background: "#fff",
    color: "#606266",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  tableWrap: { overflow: "auto", maxHeight: 500 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    border: "1px solid #cbd5e1",
    padding: "8px 10px",
    background: "#edf4fa",
    textAlign: "center",
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    zIndex: 1,
  },
  td: {
    border: "1px solid #cbd5e1",
    padding: "8px 10px",
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  tfootTd: {
    border: "1px solid #cbd5e1",
    padding: "8px 10px",
    textAlign: "center",
    background: "#f5f7fa",
  },
  statusBadge: {
    padding: "3px 10px",
    borderRadius: 3,
    background: "#f0f9eb",
    color: "#67c23a",
    fontSize: 12,
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
  empty: {
    padding: 40,
    textAlign: "center",
    color: "#909399",
  },
  infoCard: {
    padding: 18,
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    background: "#fff",
    boxShadow: "0 4px 14px rgba(15, 35, 64, 0.05)",
  },
  infoTitle: { margin: "0 0 14px", color: "#172033", fontSize: 18, fontWeight: 600 },
  infoSteps: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
  },
  infoStep: { display: "flex", gap: 10, padding: 12, background: "#f8fafc", borderRadius: 6 },
  infoNumber: {
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 50,
    background: "#0077d4",
    color: "#fff",
    fontWeight: 800,
    fontSize: 14,
    flexShrink: 0,
  },
  familyList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
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
};
