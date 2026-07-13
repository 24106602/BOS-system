import { useEffect, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
import * as XLSX from "xlsx-js-style";
import type { EnrolledStudentRecord } from "../types/enrolledStudent";
import {
  addEnrolledStudents,
  clearEnrolledStudents,
  getAllEnrolledStudents,
  getEnrolledStudentCount,
  verifyEnrolledStudent,
} from "../db/localEnrolledStudentDb";

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

function parseEnrolledStudentsFromRows(
  rows: Record<string, unknown>[],
  sourceFile: string
): EnrolledStudentRecord[] {
  const importedAt = new Date().toLocaleString();
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
        sourceFile,
        importedAt,
      };
      if (!base.name && !base.idCard && !base.studentId) return null;
      return base;
    })
    .filter(Boolean) as EnrolledStudentRecord[];
}

export default function EnrolledStudentDatabasePage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [students, setStudents] = useState<EnrolledStudentRecord[]>([]);
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

  const filtered = students.filter((s) => {
    if (filters.name && !s.name.includes(filters.name)) return false;
    if (filters.studentId && !s.studentId.includes(filters.studentId)) return false;
    if (filters.idCard && !s.idCard.includes(filters.idCard)) return false;
    if (filters.college && !s.college.includes(filters.college)) return false;
    if (filters.major && !s.major.includes(filters.major)) return false;
    return true;
  });

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
      const parsed = parseEnrolledStudentsFromRows(rows, file.name);
      if (parsed.length === 0) {
        alert("未能识别到有效学生数据，请检查表头");
        setImportStatus("");
        return;
      }
      const total = await addEnrolledStudents(parsed);
      setStudents(await getAllEnrolledStudents());
      setImportStatus(`已导入 ${parsed.length} 条，现有 ${total} 条`);
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
    if (!confirm("确定要清空在校生数据库吗？此操作不可撤销。")) return;
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
      学院: s.college,
      院系: s.department,
      专业: s.major,
      班级: s.className,
      性别: s.gender,
      年级: s.grade,
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "在校生");
    XLSX.writeFile(workbook, "在校生数据库.xlsx");
  };

  const handleVerify = async () => {
    const total = await getEnrolledStudentCount();
    if (total === 0) {
      alert("在校生数据库为空，请先导入在校生数据");
      return;
    }
    alert(`在校生数据库共有 ${total} 条记录\n\n校验规则：\n1. 优先按学号匹配\n2. 其次按身份证号+姓名匹配\n3. 匹配成功且姓名一致才视为在校\n\n学院端导入困难生数据时将自动校验`);
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
          <span style={styles.countBadge}>共 {students.length} 条</span>
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

        <div style={styles.filterRow}>
          <label style={styles.filterField}>
            <span>姓名</span>
            <input
              value={filters.name}
              onChange={(e) => setFilters({ ...filters, name: e.target.value })}
              placeholder="请输入姓名"
            />
          </label>
          <label style={styles.filterField}>
            <span>学号</span>
            <input
              value={filters.studentId}
              onChange={(e) => setFilters({ ...filters, studentId: e.target.value })}
              placeholder="请输入学号"
            />
          </label>
          <label style={styles.filterField}>
            <span>身份证号</span>
            <input
              value={filters.idCard}
              onChange={(e) => setFilters({ ...filters, idCard: e.target.value })}
              placeholder="请输入身份证号"
            />
          </label>
          <label style={styles.filterField}>
            <span>学院</span>
            <input
              value={filters.college}
              onChange={(e) => setFilters({ ...filters, college: e.target.value })}
              placeholder="请输入学院"
            />
          </label>
          <label style={styles.filterField}>
            <span>专业</span>
            <input
              value={filters.major}
              onChange={(e) => setFilters({ ...filters, major: e.target.value })}
              placeholder="请输入专业"
            />
          </label>
        </div>

        <div style={styles.tableWrap}>
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
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} style={styles.empty}>
                    {students.length === 0
                      ? "暂无在校生数据，请点击上方按钮导入"
                      : "没有匹配的结果"}
                  </td>
                </tr>
              ) : (
                filtered.slice(0, 100).map((student, index) => (
                  <tr key={index}>
                    <td style={styles.td}>{student.studentId}</td>
                    <td style={styles.td}>{student.name}</td>
                    <td style={styles.td}>{student.idCard}</td>
                    <td style={styles.td}>{student.gender}</td>
                    <td style={styles.td}>{student.college}</td>
                    <td style={styles.td}>{student.department}</td>
                    <td style={styles.td}>{student.major}</td>
                    <td style={styles.td}>{student.className}</td>
                    <td style={styles.td}>{student.grade}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {filtered.length > 100 && (
            <div style={styles.moreInfo}>共 {filtered.length} 条，仅显示前 100 条，请使用筛选条件缩小范围</div>
          )}
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
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    background: "#f5f7fa",
    borderBottom: "1px solid #e4e7ed",
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
  },
  filterRow: {
    display: "flex",
    gap: 12,
    padding: "12px 16px",
    borderBottom: "1px solid #e4e7ed",
    flexWrap: "wrap",
  },
  filterField: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 12,
    color: "#606266",
    minWidth: 140,
  },
  tableWrap: {
    overflow: "auto",
    maxHeight: "calc(100vh - 380px)",
    minHeight: 300,
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
    zIndex: 1,
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
  moreInfo: {
    padding: "10px 16px",
    textAlign: "center",
    color: "#909399",
    fontSize: 12,
    borderTop: "1px solid #e4e7ed",
    background: "#f5f7fa",
  },
};
