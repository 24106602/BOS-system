import { useEffect, useRef, useState } from "react";
// 困难生数据库面板：负责导入、检索、导出和清空浏览器本地困难生基础库。
import type { ChangeEvent, CSSProperties } from "react";
import * as XLSX from "xlsx-js-style";
import type { StudentRecord } from "../types/student";
import {
  clearStudents,
  findStudent,
  getAllStudents,
  getStudentCount,
  saveStudents,
} from "../db/localStudentDb";

const columnAliases = {
  studentId: ["学号", "学生学号", "学籍号", "学生编号", "学号(*)"],
  name: ["姓名", "学生姓名", "姓名(*)"],
  idCard: ["身份证号", "身份证号码", "身份证件号", "证件号", "学生身份证号", "身份证号(*)"],
  college: ["学院", "院系", "二级学院", "学院名称"],
  major: ["专业", "专业名称"],
  className: ["班级", "行政班", "班级名称"],
  hardshipLevel: ["困难等级", "困难认定等级", "家庭经济困难等级", "认定等级", "推荐档次"],
  year: ["认定年份", "年份", "年度", "学年"],
  specialType: ["特殊困难类型", "困难类型", "特殊群体类型", "特殊类型"],
  remark: ["备注", "说明", "其他说明"],
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

function makeStudentKey(student: Omit<StudentRecord, "key">, index: number) {
  if (student.idCard) return `id:${student.idCard}`;
  if (student.studentId) return `student:${student.studentId}`;
  return `name:${student.name}-${student.college}-${student.className}-${index}`;
}

function parseStudentsFromRows(
  rows: Record<string, unknown>[],
  sourceFile: string
): StudentRecord[] {
  const importedAt = new Date().toLocaleString();

  return rows
    .map((row, index) => {
      const base = {
        studentId: pickCell(row, columnAliases.studentId),
        name: pickCell(row, columnAliases.name),
        idCard: pickCell(row, columnAliases.idCard),
        college: pickCell(row, columnAliases.college),
        major: pickCell(row, columnAliases.major),
        className: pickCell(row, columnAliases.className),
        hardshipLevel: pickCell(row, columnAliases.hardshipLevel),
        year: pickCell(row, columnAliases.year),
        specialType: pickCell(row, columnAliases.specialType),
        remark: pickCell(row, columnAliases.remark),
        sourceFile,
        importedAt,
      };

      return {
        ...base,
        key: makeStudentKey(base, index),
      };
    })
    .filter((student) => student.name || student.idCard || student.studentId);
}

export default function StudentDatabasePanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [count, setCount] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [result, setResult] = useState<StudentRecord | null>(null);
  const [preview, setPreview] = useState<StudentRecord[]>([]);
  const [message, setMessage] = useState("等待导入");
  const [isImporting, setIsImporting] = useState(false);

  const refreshDatabaseInfo = async () => {
    const [total, students] = await Promise.all([getStudentCount(), getAllStudents()]);
    setCount(total);
    setPreview(students.slice(-8).reverse());
  };

  useEffect(() => {
    refreshDatabaseInfo().catch(() => setMessage("本地数据库读取失败"));
  }, []);

  const uploadDatabase = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      setIsImporting(true);
      setMessage("正在导入");

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: false,
      });
      const students = parseStudentsFromRows(rows, file.name);

      if (students.length === 0) {
        setMessage("未识别到可入库学生");
        alert("未识别到可入库学生，请检查表头是否包含姓名、学号或身份证号。");
        return;
      }

      await saveStudents(students);
      await refreshDatabaseInfo();
      setMessage(`导入完成：${students.length} 人`);
      alert(`困难生数据库导入完成，共 ${students.length} 人。`);
    } catch (error) {
      console.error(error);
      setMessage("导入失败");
      alert("数据库导入失败，请检查 Excel 文件格式。");
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  };

  const searchStudent = async () => {
    const student = await findStudent(keyword);
    setResult(student);
    setMessage(student ? "检索命中" : "未检索到");
  };

  const clearDatabase = async () => {
    if (!window.confirm("确定清空困难生数据库吗？")) return;

    await clearStudents();
    setResult(null);
    setMessage("数据库已清空");
    await refreshDatabaseInfo();
  };

  const exportDatabase = async () => {
    const students = await getAllStudents();

    if (students.length === 0) {
      alert("数据库为空，暂无可导出数据。");
      return;
    }

    const rows = students.map((student) => ({
      学号: student.studentId,
      姓名: student.name,
      身份证号: student.idCard,
      学院: student.college,
      专业: student.major,
      班级: student.className,
      困难等级: student.hardshipLevel,
      认定年份: student.year,
      特殊困难类型: student.specialType,
      备注: student.remark,
      来源文件: student.sourceFile,
      入库时间: student.importedAt,
    }));

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = [
      { wch: 16 },
      { wch: 12 },
      { wch: 24 },
      { wch: 20 },
      { wch: 20 },
      { wch: 18 },
      { wch: 18 },
      { wch: 12 },
      { wch: 20 },
      { wch: 24 },
      { wch: 24 },
      { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(workbook, sheet, "困难生数据库");
    XLSX.writeFile(workbook, `困难生数据库_${Date.now()}.xlsx`);
  };

  return (
    <section style={styles.panel}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>困难生数据库</h2>
          <div style={styles.meta}>当前入库人数：{count}</div>
        </div>
        <div style={styles.status}>{message}</div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={uploadDatabase}
      />

      <div style={styles.toolbar}>
        <button
          style={styles.primaryButton}
          disabled={isImporting}
          onClick={() => fileRef.current?.click()}
        >
          {isImporting ? "导入中" : "上传困难生库"}
        </button>
        <button style={styles.secondaryButton} onClick={exportDatabase}>导出数据库</button>
        <button style={styles.dangerButton} onClick={clearDatabase}>清空数据库</button>
      </div>

      <div style={styles.searchRow}>
        <input
          style={styles.input}
          value={keyword}
          placeholder="输入学号、姓名或身份证号"
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") searchStudent();
          }}
        />
        <button style={styles.searchButton} onClick={searchStudent}>检索</button>
      </div>

      {result && (
        <div style={styles.resultBox}>
          <div>姓名：{result.name || "-"}</div>
          <div>学号：{result.studentId || "-"}</div>
          <div>身份证号：{result.idCard || "-"}</div>
          <div>学院：{result.college || "-"}</div>
          <div>困难等级：{result.hardshipLevel || "-"}</div>
        </div>
      )}

      <div style={styles.previewWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>姓名</th>
              <th style={styles.th}>学号</th>
              <th style={styles.th}>身份证号</th>
              <th style={styles.th}>学院</th>
              <th style={styles.th}>困难等级</th>
            </tr>
          </thead>
          <tbody>
            {preview.length === 0 ? (
              <tr>
                <td style={styles.td} colSpan={5}>暂无入库数据</td>
              </tr>
            ) : (
              preview.map((student) => (
                <tr key={student.key}>
                  <td style={styles.td}>{student.name}</td>
                  <td style={styles.td}>{student.studentId}</td>
                  <td style={styles.td}>{student.idCard}</td>
                  <td style={styles.td}>{student.college}</td>
                  <td style={styles.td}>{student.hardshipLevel}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: {
    background: "#f8fafc",
    border: "1px solid #cbd5e1",
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 14,
  },
  title: {
    margin: 0,
    color: "#1e293b",
    fontSize: 22,
  },
  meta: {
    marginTop: 6,
    color: "#475569",
    fontSize: 14,
  },
  status: {
    background: "#0f172a",
    color: "#4ade80",
    borderRadius: 12,
    padding: "8px 12px",
    fontWeight: 700,
    fontSize: 14,
  },
  toolbar: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 12,
  },
  searchRow: {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 1fr) 88px",
    gap: 10,
    marginBottom: 12,
  },
  input: {
    minWidth: 0,
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
  },
  primaryButton: button("#2563eb"),
  secondaryButton: button("#0f766e"),
  dangerButton: button("#dc2626"),
  searchButton: button("#475569"),
  resultBox: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 8,
    background: "#ffffff",
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    color: "#0f172a",
    lineHeight: 1.7,
  },
  previewWrap: {
    maxHeight: 220,
    overflow: "auto",
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    background: "#ffffff",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    background: "#e2e8f0",
    border: "1px solid #cbd5e1",
    padding: "8px 10px",
    textAlign: "center",
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
  },
  td: {
    border: "1px solid #cbd5e1",
    padding: "8px 10px",
    textAlign: "center",
    whiteSpace: "nowrap",
  },
};

function button(background: string): CSSProperties {
  return {
    background,
    color: "#ffffff",
    border: "none",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  };
}
