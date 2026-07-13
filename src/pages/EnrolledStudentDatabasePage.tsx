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
  studentId: ["学号", "学生学号", "学籍号", "学生编号"],
  name: ["姓名", "学生姓名"],
  idCard: ["身份证号", "身份证号码", "身份证件号", "证件号", "学生身份证号"],
  college: ["学院", "院系", "二级学院", "学院名称", "学校名称"],
  department: ["院系", "系部", "学部", "院系名称"],
  major: ["专业", "专业名称"],
  className: ["班级", "行政班", "班级名称"],
  gender: ["性别", "学生性别"],
  grade: ["年级", "入学年级", "届别"],
  academicYear: ["学年", "学年度", "academic_year", "学年学期"],
};

function normalizeHeader(value: string) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/\*/g, "")
    .replace(/（.*?）/g, "")
    .replace(/\(.*?\)/g, "")
    .toLowerCase();
}

function pickCell(row: Record<string, unknown>, aliases: string[]) {
  const entries = Object.entries(row);
  const normalizedAliases = aliases.map(normalizeHeader);
  const exact = entries.find(([key]) => normalizedAliases.includes(normalizeHeader(key)));
  if (exact) return String(exact[1] ?? "").trim();
  const fuzzy = entries.find(([key]) => {
    const header = normalizeHeader(key);
    return normalizedAliases.some((alias) => header.includes(alias) || alias.includes(header));
  });
  return String(fuzzy?.[1] ?? "").trim();
}

function getCurrentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
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
      const base = {
        studentId: pickCell(row, columnAliases.studentId),
        name: pickCell(row, columnAliases.name),
        idCard: pickCell(row, columnAliases.idCard),
        college: pickCell(row, columnAliases.college),
        department: pickCell(row, columnAliases.department),
        major: pickCell(row, columnAliases.major),
        className: pickCell(row, columnAliases.className),
        gender: pickCell(row, columnAliases.gender),
        grade: pickCell(row, columnAliases.grade),
        academicYear: pickCell(row, columnAliases.academicYear) || currentYear,
        sourceFile,
        importedAt,
      };
      if (!base.name && !base.idCard && !base.studentId) return null;
      return base;
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
    college: "",
    major: "",
  });
  const [importStatus, setImportStatus] = useState("");

  useEffect(() => {
    getAllEnrolledStudents().then(setStudents);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [academicYear, filters.name, filters.studentId, filters.idCard, filters.college, filters.major]);

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
      if (filters.college && !s.college.includes(filters.college)) return false;
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
      alert("导入失败：" + (err as Error).message);
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
      学号: s.studentId,
      姓名: s.name,
      身份证号: s.idCard,
      性别: s.gender,
      学院: s.college,
      院系: s.department,
      专业: s.major,
      班级: s.className,
      年级: s.grade,
      学年: s.academicYear,
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
          <div style={styles.breadcrumb}>基础数据 / 在校生管理</div>
          <h2 style={styles.title}>在校生数据库</h2>
          <p style={styles.desc}>维护全校在校生基础信息，学院端导入困难生数据时将自动校验学生是否在校</p>
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
            <button style={styles.button} onClick={handleExport} disabled={filtered.length === 0}>
              导出当前结果
            </button>
            <button style={styles.button} onClick={handleVerify}>
              校验规则说明
            </button>
            <button style={styles.dangerButton} onClick={handleClear} disabled={students.length === 0}>
              清空数据库
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
            college: filters.college,
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
            setFilters({ name: "", studentId: "", idCard: "", college: "", major: "" });
          }}
          showAcademicYear={true}
          showCollege={false}
          showSearch={false}
          customFields={[
            { key: "name", label: "姓名", type: "text", placeholder: "请输入姓名", width: 120 },
            { key: "studentId", label: "学号", type: "text", placeholder: "请输入学号", width: 120 },
            { key: "idCard", label: "身份证号", type: "text", placeholder: "请输入身份证号", width: 160 },
            { key: "college", label: "学院", type: "text", placeholder: "请输入学院", width: 140 },
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
                  <th style={styles.th}>学号</th>
                  <th style={styles.th}>姓名</th>
                  <th style={styles.th}>身份证号</th>
                  <th style={styles.th}>性别</th>
                  <th style={styles.th}>学院</th>
                  <th style={styles.th}>院系</th>
                  <th style={styles.th}>专业</th>
                  <th style={styles.th}>班级</th>
                  <th style={styles.th}>年级</th>
                  <th style={styles.th}>学年</th>
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={styles.empty}>
                      {students.length === 0
                        ? "暂无在校生数据，请点击上方按钮导入"
                        : "没有匹配的结果"}
                    </td>
                  </tr>
                ) : (
                  pageData.map((student, index) => (
                    <tr key={(currentPage - 1) * PAGE_SIZE + index}>
                      <td style={styles.td}>{student.studentId}</td>
                      <td style={styles.td}>{student.name}</td>
                      <td style={styles.td}>{student.idCard}</td>
                      <td style={styles.td}>{student.gender}</td>
                      <td style={styles.td}>{student.college}</td>
                      <td style={styles.td}>{student.department}</td>
                      <td style={styles.td}>{student.major}</td>
                      <td style={styles.td}>{student.className}</td>
                      <td style={styles.td}>{student.grade}</td>
                      <td style={styles.td}>{student.academicYear}</td>
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
    overflow: "auto",
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
    height: "calc(100vh - 180px)",
    minHeight: 400,
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
  },
  tableWrap: {
    flex: 1,
    overflow: "auto",
    minHeight: 0,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    border: "1px solid #cbd5e1",
    padding: "8px 10px",
    background: "#edf4fa",
    textAlign: "center",
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    zIndex: 2,
  },
  td: {
    border: "1px solid #cbd5e1",
    padding: "8px 10px",
    textAlign: "center",
    whiteSpace: "nowrap",
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
