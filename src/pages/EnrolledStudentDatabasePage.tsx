import { useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
import * as XLSX from "xlsx-js-style";
import type { EnrolledStudentRecord } from "../types/enrolledStudent";
import {
  addEnrolledStudents,
  clearEnrolledStudents,
  getAllEnrolledStudents,
  getEnrolledStudentCount,
  verifyEnrolledStudent,
} from "../db/localEnrolledStudentDb";
import DataFilterPanel from "../components/ui/DataFilterPanel";

const columnAliases = {
  academicYear: ["学年", "学年度", "academic_year", "学年学期"],
  semester: ["学期", "semester"],
  examineeId: ["考生号", "考试号", "考号", "考生编号"],
  studentId: ["学号", "学生学号", "学籍号", "学生编号", "校号"],
  name: ["姓名", "学生姓名", "名字"],
  idCardType: ["身份证件类型", "证件类型", "身份证类型"],
  idCard: ["身份证号", "身份证号码", "身份证件号", "证件号", "学生身份证号", "身份证"],
  gender: ["性别", "学生性别"],
  birthDate: ["出生日期", "生日", "出生年月"],
  politicalStatus: ["政治面貌", "政治"],
  nationality: ["民族", "名族"],
  studentType: ["学生类型", "类型", "学历类型"],
  studyForm: ["学习形式", "学习方式", "学习性质"],
  department: ["院系名称", "院系", "系部", "学部", "学院", "二级学院", "学院名称", "系", "部门"],
  counselorName: ["辅导员姓名", "辅导员"],
  grade: ["年级", "入学年级", "届别", "级"],
  className: ["班级", "行政班", "班级名称", "班"],
  majorCategory: ["专业大类", "学科门类", "学科大类"],
  major: ["专业", "专业名称", "专业方向"],
  level: ["层次", "学历层次", "学历", "教育层次"],
  schoolSystem: ["学制", "修业年限"],
  enrollmentDate: ["入学日期", "入学报名日期", "入校日期", "入学时间"],
  isRuralStudent: ["是否农村学生", "农村学生", "农村"],
  studentSource: ["生源地区", "生源地", "来源地区"],
  phone: ["联系电话", "手机号码", "电话", "手机", "联系方式"],
};

function normalizeHeader(value: string) {
  return String(value ?? "")
    .trim()
    .replace(/[\s\u3000]+/g, "")
    .replace(/\*/g, "")
    .replace(/（.*?）/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[:：]/g, "")
    .replace(/[.,;，；]/g, "")
    .toLowerCase();
}

function normalizeHeaderForMatch(value: string) {
  return normalizeHeader(value)
    .replace(/^(.*?)$/g, "$1")
    .replace(/学生/g, "")
    .replace(/名称/g, "")
    .replace(/类型/g, "")
    .replace(/日期/g, "");
}

function pickCell(row: Record<string, unknown>, aliases: string[]) {
  const entries = Object.entries(row);
  const normalizedAliases = aliases.map(normalizeHeader);

  // 精确匹配
  const exact = entries.find(([key]) => normalizedAliases.includes(normalizeHeader(key)));
  if (exact) return String(exact[1] ?? "").trim();

  // 简化后的精确匹配（去除"学生"、"名称"等通用后缀）
  const simpleAliases = aliases.map(normalizeHeaderForMatch);
  const simpleExact = entries.find(([key]) =>
    simpleAliases.includes(normalizeHeaderForMatch(key))
  );
  if (simpleExact) return String(simpleExact[1] ?? "").trim();

  // 模糊匹配
  const fuzzy = entries.find(([key]) => {
    const header = normalizeHeader(key);
    const simpleHeader = normalizeHeaderForMatch(key);
    return normalizedAliases.some((alias) => header.includes(alias) || alias.includes(header)) ||
      simpleAliases.some((alias) => simpleHeader.includes(alias) || alias.includes(simpleHeader));
  });
  return String(fuzzy?.[1] ?? "").trim();
}

function getCurrentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function convertExcelDate(dateValue: string): string {
  const num = parseFloat(dateValue);
  if (isNaN(num)) return dateValue;
  
  const excelEpoch = new Date(1899, 11, 30);
  const date = new Date(excelEpoch.getTime() + num * 24 * 60 * 60 * 1000);
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  
  return `${year}${month}${day}`;
}

function parseEnrolledStudentsFromRows(
  rows: Record<string, unknown>[],
  sourceFile: string,
  defaultAcademicYear?: string
): EnrolledStudentRecord[] {
  const importedAt = new Date().toLocaleString();
  const currentYear = defaultAcademicYear || getCurrentAcademicYear();
  return rows
    .map((row) => {
      const studentId = pickCell(row, columnAliases.studentId);
      const name = pickCell(row, columnAliases.name);
      const idCard = pickCell(row, columnAliases.idCard);
      if (!name && !idCard && !studentId) return null;

      const idCardNum = idCard.replace(/\s+/g, "");
      let gender = pickCell(row, columnAliases.gender);
      let birthDate = convertExcelDate(pickCell(row, columnAliases.birthDate));

      if (idCardNum.length === 18) {
        if (!gender) {
          gender = parseInt(idCardNum.charAt(16)) % 2 === 1 ? "男" : "女";
        }
        if (!birthDate) {
          birthDate = idCardNum.substring(6, 14);
        }
      }

      return {
        academicYear: pickCell(row, columnAliases.academicYear) || currentYear,
        semester: pickCell(row, columnAliases.semester),
        examineeId: pickCell(row, columnAliases.examineeId),
        studentId,
        name,
        idCardType: pickCell(row, columnAliases.idCardType),
        idCard: idCardNum,
        gender,
        birthDate,
        politicalStatus: pickCell(row, columnAliases.politicalStatus),
        nationality: pickCell(row, columnAliases.nationality),
        studentType: pickCell(row, columnAliases.studentType),
        studyForm: pickCell(row, columnAliases.studyForm),
        department: pickCell(row, columnAliases.department),
        counselorName: pickCell(row, columnAliases.counselorName),
        grade: pickCell(row, columnAliases.grade),
        className: pickCell(row, columnAliases.className),
        majorCategory: pickCell(row, columnAliases.majorCategory),
        major: pickCell(row, columnAliases.major),
        level: pickCell(row, columnAliases.level),
        schoolSystem: pickCell(row, columnAliases.schoolSystem),
        enrollmentDate: convertExcelDate(pickCell(row, columnAliases.enrollmentDate)),
        isRuralStudent: pickCell(row, columnAliases.isRuralStudent),
        studentSource: pickCell(row, columnAliases.studentSource),
        phone: pickCell(row, columnAliases.phone),
        sourceFile,
        importedAt,
      };
    })
    .filter(Boolean) as EnrolledStudentRecord[];
}

const PAGE_SIZE = 50;

export default function EnrolledStudentDatabasePage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const [students, setStudents] = useState<EnrolledStudentRecord[]>([]);
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    name: "",
    studentId: "",
    idCard: "",
    department: "",
    major: "",
  });
  const [importStatus, setImportStatus] = useState("");

  useEffect(() => {
    getAllEnrolledStudents().then(setStudents);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [academicYear, filters.name, filters.studentId, filters.idCard, filters.department, filters.major]);

  const yearOptions = useMemo(() => {
    const years = new Set(students.map((s) => s.academicYear).filter(Boolean));
    const current = getCurrentAcademicYear();
    if (!years.has(current)) years.add(current);
    return Array.from(years).sort().reverse();
  }, [students]);

  const filtered = useMemo(() => {
    return students.filter((s) => {
      if (academicYear && s.academicYear !== academicYear) return false;
      if (filters.name && !s.name.includes(filters.name)) return false;
      if (filters.studentId && !s.studentId.includes(filters.studentId)) return false;
      if (filters.idCard && !s.idCard.includes(filters.idCard)) return false;
      if (filters.department && !s.department.includes(filters.department)) return false;
      if (filters.major && !s.major.includes(filters.major)) return false;
      return true;
    });
  }, [students, academicYear, filters]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage * PAGE_SIZE, total);
  const pageData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      setImportStatus("正在读取...");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];
      if (rows.length === 0) {
        alert("文件中没有读取到数据");
        setImportStatus("");
        return;
      }
      const parsed = parseEnrolledStudentsFromRows(rows, file.name, academicYear);
      if (parsed.length === 0) {
        alert("未能识别到有效学生数据，请检查表头");
        setImportStatus("");
        return;
      }
      const totalCount = await addEnrolledStudents(parsed);
      setStudents(await getAllEnrolledStudents());
      setImportStatus(`已导入 ${parsed.length} 条，现有 ${totalCount} 条`);
      alert(`导入成功！新增 ${parsed.length} 条在校生数据`);
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : "未知错误";
      if (errorMessage.includes("exceeded the quota") || errorMessage.includes("数据量过大")) {
        alert(`导入失败：数据量过大，超出本地存储限制。\n\n建议：请配置 Supabase 云端数据库以支持大规模数据存储。\n当前错误：${errorMessage}`);
      } else {
        alert("导入失败：" + errorMessage);
      }
      setImportStatus("");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleClear = async () => {
    if (!confirm("确定要清空当前学年的在校生数据吗？此操作不可撤销。")) return;
    await clearEnrolledStudents();
    setStudents([]);
    setImportStatus("");
  };

  const handleExport = () => {
    if (filtered.length === 0) {
      alert("没有可导出的数据");
      return;
    }
    const exportData = filtered.map((s) => ({
      学年: s.academicYear,
      学期: s.semester || "-",
      考生号: s.examineeId || "-",
      学号: s.studentId,
      学生姓名: s.name,
      身份证件类型: s.idCardType || "-",
      身份证件号: s.idCard,
      性别: s.gender || "-",
      出生日期: s.birthDate || "-",
      政治面貌: s.politicalStatus || "-",
      民族: s.nationality || "-",
      学生类型: s.studentType || "-",
      学习形式: s.studyForm || "-",
      院系名称: s.department || "-",
      辅导员姓名: s.counselorName || "-",
      年级: s.grade || "-",
      班级: s.className || "-",
      专业大类: s.majorCategory || "-",
      专业: s.major || "-",
      层次: s.level || "-",
      学制: s.schoolSystem || "-",
      入学日期: s.enrollmentDate || "-",
      是否农村学生: s.isRuralStudent || "-",
      生源地区: s.studentSource || "-",
      联系电话: s.phone || "-",
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "在校生");
    XLSX.writeFile(workbook, `在校生数据库_${academicYear}.xlsx`);
  };

  const handleVerify = async () => {
    const count = await getEnrolledStudentCount();
    if (count === 0) {
      alert("在校生数据库为空，请先导入在校生数据");
      return;
    }
    alert(`在校生数据库共有 ${count} 条记录\n\n校验规则：\n1. 优先按学号匹配\n2. 其次按身份证号+姓名匹配\n3. 匹配成功且姓名一致才视为在校\n\n学院端导入困难生数据时将自动校验`);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!tableRef.current) return;
    const target = tableRef.current;
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      target.scrollLeft += e.deltaY;
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>在校生数据库</h2>
        </div>
        <div style={styles.headerActions}>
          <span style={styles.countBadge}>共 {total} 人</span>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <span style={styles.cardTitle}>数据管理</span>
          <div style={styles.cardActions}>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: "none" }}
              onChange={handleFile}
            />
            <button style={styles.primaryButton} onClick={() => fileRef.current?.click()}>
              导入在校生数据
            </button>
            <button style={styles.button} onClick={handleVerify}>
              校验规则说明
            </button>
            <button style={styles.dangerButton} onClick={handleClear} disabled={students.length === 0}>
              清空数据库
            </button>
            <button
              style={styles.downloadButton}
              onClick={handleExport}
              disabled={filtered.length === 0}
            >
              下载
            </button>
          </div>
        </div>

        {importStatus && (
          <div style={styles.statusBar}>
            <span>{importStatus}</span>
          </div>
        )}

        <DataFilterPanel
          filters={{
            academicYear,
            name: filters.name,
            studentId: filters.studentId,
            idCard: filters.idCard,
            department: filters.department,
            major: filters.major,
          }}
          onChange={(key, value) => {
            if (key === "academicYear") {
              setAcademicYear(value);
            } else {
              setFilters((prev) => ({ ...prev, [key]: value }));
            }
          }}
          onReset={() => {
            setAcademicYear(getCurrentAcademicYear());
            setFilters({ name: "", studentId: "", idCard: "", department: "", major: "" });
          }}
          showAcademicYear={true}
          showCollege={false}
          showSearch={false}
          customFields={[
            { key: "name", label: "姓名", type: "text", placeholder: "请输入姓名", width: 120 },
            { key: "studentId", label: "学号", type: "text", placeholder: "请输入学号", width: 120 },
            { key: "idCard", label: "身份证号", type: "text", placeholder: "请输入身份证号", width: 160 },
            { key: "department", label: "院系", type: "text", placeholder: "请输入院系", width: 140 },
            { key: "major", label: "专业", type: "text", placeholder: "请输入专业", width: 140 },
          ]}
        />

        <div style={styles.tableContainer}>
          <div
            ref={tableRef}
            style={styles.tableWrap}
            onWheel={handleWheel}
          >
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>学年</th>
                  <th style={styles.th}>学期</th>
                  <th style={styles.th}>考生号</th>
                  <th style={styles.th}>学号</th>
                  <th style={styles.th}>学生姓名</th>
                  <th style={styles.th}>身份证件类型</th>
                  <th style={styles.th}>身份证件号</th>
                  <th style={styles.th}>性别</th>
                  <th style={styles.th}>出生日期</th>
                  <th style={styles.th}>政治面貌</th>
                  <th style={styles.th}>民族</th>
                  <th style={styles.th}>学生类型</th>
                  <th style={styles.th}>学习形式</th>
                  <th style={styles.th}>院系名称</th>
                  <th style={styles.th}>辅导员姓名</th>
                  <th style={styles.th}>年级</th>
                  <th style={styles.th}>班级</th>
                  <th style={styles.th}>专业大类</th>
                  <th style={styles.th}>专业</th>
                  <th style={styles.th}>层次</th>
                  <th style={styles.th}>学制</th>
                  <th style={styles.th}>入学日期</th>
                  <th style={styles.th}>是否农村学生</th>
                  <th style={styles.th}>生源地区</th>
                  <th style={styles.th}>联系电话</th>
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr>
                    <td colSpan={25} style={styles.empty}>
                      {students.length === 0
                        ? "暂无在校生数据，请点击上方按钮导入"
                        : "没有匹配的结果"}
                    </td>
                  </tr>
                ) : (
                  pageData.map((student, index) => (
                    <tr key={(currentPage - 1) * PAGE_SIZE + index}>
                      <td style={styles.td}>{student.academicYear || "-"}</td>
                      <td style={styles.td}>{student.semester || "-"}</td>
                      <td style={styles.td}>{student.examineeId || "-"}</td>
                      <td style={styles.td}>{student.studentId || "-"}</td>
                      <td style={styles.td}>{student.name || "-"}</td>
                      <td style={styles.td}>{student.idCardType || "-"}</td>
                      <td style={styles.td}>{student.idCard || "-"}</td>
                      <td style={styles.td}>{student.gender || "-"}</td>
                      <td style={styles.td}>{student.birthDate || "-"}</td>
                      <td style={styles.td}>{student.politicalStatus || "-"}</td>
                      <td style={styles.td}>{student.nationality || "-"}</td>
                      <td style={styles.td}>{student.studentType || "-"}</td>
                      <td style={styles.td}>{student.studyForm || "-"}</td>
                      <td style={styles.td}>{student.department || "-"}</td>
                      <td style={styles.td}>{student.counselorName || "-"}</td>
                      <td style={styles.td}>{student.grade || "-"}</td>
                      <td style={styles.td}>{student.className || "-"}</td>
                      <td style={styles.td}>{student.majorCategory || "-"}</td>
                      <td style={styles.td}>{student.major || "-"}</td>
                      <td style={styles.td}>{student.level || "-"}</td>
                      <td style={styles.td}>{student.schoolSystem || "-"}</td>
                      <td style={styles.td}>{student.enrollmentDate || "-"}</td>
                      <td style={styles.td}>{student.isRuralStudent || "-"}</td>
                      <td style={styles.td}>{student.studentSource || "-"}</td>
                      <td style={styles.td}>{student.phone || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={styles.paginationBar}>
            <div style={styles.paginationInfo}>
              共 {total} 人，当前显示第 {start} 到 {end} 人
            </div>
            <div style={styles.paginationControls}>
            <button
              style={styles.pageButton}
              onClick={() => setPage(1)}
              disabled={currentPage <= 1}
            >
              首页
            </button>
              <button
                style={styles.pageButton}
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                上一页
              </button>
              <span style={styles.pageText}>
                第 {currentPage} / {totalPages} 页
              </span>
              <button
                style={styles.pageButton}
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
              >
                下一页
              </button>
              <button
                style={styles.pageButton}
                onClick={() => setPage(totalPages)}
                disabled={currentPage >= totalPages}
              >
                末页
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    width: "100%",
    flex: 1,
    minHeight: 0,
    padding: 16,
    overflow: "hidden",
    background: "#f5f7fa",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  breadcrumb: {
    color: "#909399",
    fontSize: 12,
    marginBottom: 4,
  },
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 600,
    color: "#303133",
  },
  desc: {
    margin: "6px 0 0",
    fontSize: 13,
    color: "#909399",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  countBadge: {
    padding: "6px 16px",
    background: "#ecf5ff",
    color: "#409eff",
    borderRadius: 4,
    fontSize: 13,
    fontWeight: 600,
  },
  card: {
    background: "#fff",
    borderRadius: 6,
    border: "1px solid #e4e7ed",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    background: "#f5f7fa",
    borderBottom: "1px solid #e4e7ed",
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "#303133",
  },
  cardActions: {
    display: "flex",
    gap: 8,
  },
  button: {
    padding: "6px 14px",
    border: "1px solid #dcdfe6",
    borderRadius: 4,
    background: "#fff",
    color: "#606266",
    fontSize: 12,
    cursor: "pointer",
  },
  primaryButton: {
    padding: "6px 14px",
    border: "none",
    borderRadius: 4,
    background: "#409eff",
    color: "#fff",
    fontSize: 12,
    cursor: "pointer",
    fontWeight: 600,
  },
  dangerButton: {
    padding: "6px 14px",
    border: "1px solid #fbc4c4",
    borderRadius: 4,
    background: "#fef0f0",
    color: "#f56c6c",
    fontSize: 12,
    cursor: "pointer",
  },
  downloadButton: {
    padding: "4px 10px",
    border: "1px solid #dcdfe6",
    borderRadius: 3,
    background: "#fff",
    color: "#606266",
    fontSize: 12,
    cursor: "pointer",
    marginRight: 6,
  },
  statusBar: {
    padding: "8px 16px",
    background: "#f0f9eb",
    color: "#67c23a",
    fontSize: 12,
    borderBottom: "1px solid #e1f3d8",
    flexShrink: 0,
  },
  filterRow: {
    display: "flex",
    gap: 12,
    padding: "12px 16px",
    borderBottom: "1px solid #e4e7ed",
    flexWrap: "wrap",
    flexShrink: 0,
  },
  filterField: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 12,
    color: "#606266",
    minWidth: 140,
  },
  tableContainer: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    position: "relative",
  },
  tableWrap: {
    flex: 1,
    overflowY: "auto",
    overflowX: "auto",
    minHeight: 0,
    scrollbarWidth: "thin",
    scrollbarColor: "#409eff #e4e7ed",
    "&::-webkit-scrollbar": {
      width: "8px",
      height: "8px",
    },
    "&::-webkit-scrollbar-track": {
      background: "#e4e7ed",
      borderRadius: "4px",
    },
    "&::-webkit-scrollbar-thumb": {
      background: "#409eff",
      borderRadius: "4px",
    },
    "&::-webkit-scrollbar-thumb:hover": {
      background: "#66b1ff",
    },
  },
  table: {
    width: "100%",
    minWidth: "1800px",
    borderCollapse: "collapse",
    fontSize: 12,
  },
  th: {
    border: "1px solid #cbd5e1",
    padding: "6px 8px",
    background: "#edf4fa",
    textAlign: "center",
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    zIndex: 10,
    fontWeight: 600,
    color: "#303133",
    boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
  },
  td: {
    border: "1px solid #cbd5e1",
    padding: "6px 8px",
    textAlign: "center",
    whiteSpace: "nowrap",
    color: "#606266",
  },
  empty: {
    padding: 40,
    textAlign: "center",
    color: "#909399",
  },
  paginationBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 16px",
    background: "#f5f7fa",
    borderTop: "1px solid #e4e7ed",
    flexShrink: 0,
  },
  paginationInfo: {
    fontSize: 12,
    color: "#606266",
    fontWeight: 500,
  },
  paginationControls: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  pageButton: {
    padding: "4px 10px",
    border: "1px solid #dcdfe6",
    borderRadius: 3,
    background: "#fff",
    color: "#606266",
    fontSize: 12,
    cursor: "pointer",
  },
  pageText: {
    fontSize: 12,
    color: "#606266",
    padding: "0 6px",
  },
};
