import { useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
import * as XLSX from "xlsx-js-style";
import type { EnrolledStudentRecord } from "../types/enrolledStudent";
import {
  addEnrolledStudents,
  clearEnrolledStudents,
  getAllEnrolledStudents,
  getEnrolledStudentCount,
} from "../db/localEnrolledStudentDb";
import DataFilterPanel from "../components/ui/DataFilterPanel";

type EnrolledStudentField = keyof Pick<
  EnrolledStudentRecord,
  | "academicYear"
  | "semester"
  | "examineeId"
  | "studentId"
  | "name"
  | "idCardType"
  | "idCard"
  | "gender"
  | "birthDate"
  | "politicalStatus"
  | "nationality"
  | "studentType"
  | "studyForm"
  | "department"
  | "counselorName"
  | "grade"
  | "className"
  | "majorCategory"
  | "major"
  | "level"
  | "schoolSystem"
  | "enrollmentDate"
  | "isRuralStudent"
  | "studentSource"
  | "phone"
>;

type SheetCell = string | number | boolean | Date | null | undefined;
type SheetRow = SheetCell[];
type ColumnMap = Record<EnrolledStudentField, number[]>;

const columnAliases: Record<EnrolledStudentField, string[]> = {
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
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/^\d+[.、)]/, "")
    .replace(/[:：]/g, "")
    .replace(/[._\-—/\\,;，；]/g, "")
    .toLowerCase();
}

function normalizeHeaderForMatch(value: string) {
  return normalizeHeader(value)
    .replace(/学生/g, "")
    .replace(/名称/g, "")
    .replace(/类型/g, "")
    .replace(/日期/g, "")
    .replace(/信息/g, "");
}

function scoreHeader(headerValue: SheetCell, aliases: string[]): number {
  const header = normalizeHeader(String(headerValue ?? ""));
  if (!header) return 0;

  const normalizedAliases = aliases.map(normalizeHeader).filter(Boolean);
  if (normalizedAliases.includes(header)) return 300 + header.length;

  const simpleHeader = normalizeHeaderForMatch(header);
  const simpleAliases = aliases.map(normalizeHeaderForMatch).filter((alias) => alias.length >= 2);
  if (simpleHeader.length >= 2 && simpleAliases.includes(simpleHeader)) {
    return 200 + simpleHeader.length;
  }

  const fuzzyScores = [...normalizedAliases, ...simpleAliases]
    .filter((alias) => alias.length >= 2)
    .map((alias) => {
      const candidate = normalizedAliases.includes(alias) ? header : simpleHeader;
      if (candidate.length < 2 || (!candidate.includes(alias) && !alias.includes(candidate))) return 0;
      const shorter = Math.min(candidate.length, alias.length);
      const longer = Math.max(candidate.length, alias.length);
      return shorter / longer >= 0.6 ? 100 + shorter : 0;
    });
  return Math.max(0, ...fuzzyScores);
}

function buildColumnMap(headers: SheetRow): ColumnMap {
  return Object.fromEntries(
    (Object.keys(columnAliases) as EnrolledStudentField[]).map((field) => {
      const candidates = headers
        .map((header, index) => ({ index, score: scoreHeader(header, columnAliases[field]) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score || a.index - b.index);
      const bestScore = candidates[0]?.score ?? 0;
      return [field, candidates.filter(({ score }) => score === bestScore).map(({ index }) => index)];
    })
  ) as ColumnMap;
}

function countMappedFields(headers: SheetRow): number {
  const map = buildColumnMap(headers);
  return (Object.keys(map) as EnrolledStudentField[]).filter((field) => map[field].length > 0).length;
}

function fillMergedHeaderCells(sheet: XLSX.WorkSheet, rows: SheetRow[]): SheetRow[] {
  const result = rows.map((row) => [...row]);
  const merges = (sheet["!merges"] ?? []) as XLSX.Range[];
  merges.forEach((merge) => {
    if (merge.s.r >= 30) return;
    const value = result[merge.s.r]?.[merge.s.c];
    if (value === undefined || value === null || value === "") return;
    for (let rowIndex = merge.s.r; rowIndex <= merge.e.r; rowIndex += 1) {
      result[rowIndex] ??= [];
      for (let columnIndex = merge.s.c; columnIndex <= merge.e.c; columnIndex += 1) {
        if (result[rowIndex][columnIndex] === undefined || result[rowIndex][columnIndex] === "") {
          result[rowIndex][columnIndex] = value;
        }
      }
    }
  });
  return result;
}

function locateHeaderRow(rows: SheetRow[]): { headerIndex: number; columnMap: ColumnMap } {
  const candidates = rows.slice(0, 30).map((row, index) => ({
    index,
    mappedFields: countMappedFields(row),
    nonEmptyCells: row.filter((cell) => String(cell ?? "").trim()).length,
  }));
  candidates.sort((a, b) =>
    b.mappedFields - a.mappedFields || b.nonEmptyCells - a.nonEmptyCells || a.index - b.index
  );
  const best = candidates[0];
  if (!best || best.mappedFields < 3) {
    throw new Error("未识别到有效表头，请确认文件包含学号、姓名、身份证件号等在校生字段");
  }
  return { headerIndex: best.index, columnMap: buildColumnMap(rows[best.index]) };
}

function cellToText(value: SheetCell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return formatDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  return String(value).trim();
}

function pickMappedCell(row: SheetRow, indexes: number[]): string {
  for (const index of indexes) {
    const value = cellToText(row[index]);
    if (value) return value;
  }
  return "";
}

function getCurrentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

function convertExcelDate(dateValue: SheetCell): string {
  if (dateValue === null || dateValue === undefined || dateValue === "") return "";
  if (dateValue instanceof Date) {
    return formatDateParts(dateValue.getFullYear(), dateValue.getMonth() + 1, dateValue.getDate());
  }

  const text = String(dateValue).trim();
  if (/^\d{8}$/.test(text)) return text;

  const normalizedDate = text.match(/^(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})日?$/);
  if (normalizedDate) {
    return formatDateParts(Number(normalizedDate[1]), Number(normalizedDate[2]), Number(normalizedDate[3]));
  }

  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial >= 1 && serial <= 2958465) {
      const parsed = XLSX.SSF.parse_date_code(serial);
      if (parsed) return formatDateParts(parsed.y, parsed.m, parsed.d);
    }
  }
  return text;
}

function parseEnrolledStudentsFromRows(
  rows: SheetRow[],
  columnMap: ColumnMap,
  sourceFile: string,
  defaultAcademicYear?: string
): EnrolledStudentRecord[] {
  const importedAt = new Date().toLocaleString();
  const currentYear = defaultAcademicYear || getCurrentAcademicYear();
  return rows
    .map((row) => {
      const getCell = (field: EnrolledStudentField) => pickMappedCell(row, columnMap[field]);
      const studentId = getCell("studentId");
      const name = getCell("name");
      const idCard = getCell("idCard");
      if (!name && !idCard && !studentId) return null;

      const idCardNum = idCard.replace(/\s+/g, "");
      let gender = getCell("gender");
      let birthDate = convertExcelDate(getCell("birthDate"));

      if (idCardNum.length === 18) {
        if (!gender) {
          gender = parseInt(idCardNum.charAt(16)) % 2 === 1 ? "男" : "女";
        }
        if (!birthDate) {
          birthDate = idCardNum.substring(6, 14);
        }
      }

      return {
        academicYear: getCell("academicYear") || currentYear,
        semester: getCell("semester"),
        examineeId: getCell("examineeId"),
        studentId,
        name,
        idCardType: getCell("idCardType"),
        idCard: idCardNum,
        gender,
        birthDate,
        politicalStatus: getCell("politicalStatus"),
        nationality: getCell("nationality"),
        studentType: getCell("studentType"),
        studyForm: getCell("studyForm"),
        department: getCell("department"),
        counselorName: getCell("counselorName"),
        grade: getCell("grade"),
        className: getCell("className"),
        majorCategory: getCell("majorCategory"),
        major: getCell("major"),
        level: getCell("level"),
        schoolSystem: getCell("schoolSystem"),
        enrollmentDate: convertExcelDate(getCell("enrollmentDate")),
        isRuralStudent: getCell("isRuralStudent"),
        studentSource: getCell("studentSource"),
        phone: getCell("phone"),
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
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json<SheetRow>(sheet, {
        header: 1,
        defval: "",
        raw: true,
        blankrows: false,
      });
      const rows = fillMergedHeaderCells(sheet, rawRows);
      if (rows.length === 0) {
        alert("文件中没有读取到数据");
        setImportStatus("");
        return;
      }
      const { headerIndex, columnMap } = locateHeaderRow(rows);
      const headerRow = rows[headerIndex];

      // ---- 诊断：打印表头匹配结果 ----
      const fieldLabels: Record<EnrolledStudentField, string> = {
        academicYear: "学年", semester: "学期", examineeId: "考生号", studentId: "学号",
        name: "学生姓名", idCardType: "身份证件类型", idCard: "身份证件号", gender: "性别",
        birthDate: "出生日期", politicalStatus: "政治面貌", nationality: "民族",
        studentType: "学生类型", studyForm: "学习形式", department: "院系名称",
        counselorName: "辅导员姓名", grade: "年级", className: "班级",
        majorCategory: "专业大类", major: "专业", level: "层次", schoolSystem: "学制",
        enrollmentDate: "入学日期", isRuralStudent: "是否农村学生", studentSource: "生源地区",
        phone: "联系电话",
      };
      const mappingLines: string[] = [];
      const unmappedFields: string[] = [];
      (Object.keys(columnMap) as EnrolledStudentField[]).forEach((field) => {
        const indexes = columnMap[field];
        if (indexes.length === 0) {
          unmappedFields.push(fieldLabels[field]);
        } else {
          const colNames = indexes.map((i) => `"${String(headerRow[i] ?? "")}"`).join(", ");
          mappingLines.push(`  ${fieldLabels[field]} → 第${indexes[0] + 1}列 ${colNames}`);
        }
      });
      console.group(`📋 导入诊断 — ${file.name}`);
      console.log(`表头行: 第 ${headerIndex + 1} 行`);
      console.log(`识别到 ${mappingLines.length} 个字段映射`);
      if (mappingLines.length > 0) console.log("字段映射:\n" + mappingLines.join("\n"));
      if (unmappedFields.length > 0) console.warn("未匹配字段: " + unmappedFields.join(", "));
      // ---- 诊断结束 ----

      const parsed = parseEnrolledStudentsFromRows(
        rows.slice(headerIndex + 1),
        columnMap,
        file.name,
        academicYear
      );
      if (parsed.length === 0) {
        console.warn("解析结果为空，请检查表头和数据行");
        console.groupEnd();
        alert("未能识别到有效学生数据，请检查表头");
        setImportStatus("");
        return;
      }

      // 打印第一条示例数据
      console.log(`解析到 ${parsed.length} 条记录`);
      console.log("第一条示例:", JSON.stringify(parsed[0], null, 2));
      // 检查空值字段
      const emptyFields = (Object.keys(fieldLabels) as EnrolledStudentField[]).filter(
        (f) => !parsed[0][f]
      );
      if (emptyFields.length > 0) {
        console.warn("第一条记录中为空的字段: " + emptyFields.map((f) => fieldLabels[f]).join(", "));
      }
      console.groupEnd();

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
    if (!confirm("确定要禁用当前学年的在校生数据吗？历史记录将保留。")) return;
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
          style={{
            flex: "0 0 auto",
            marginBottom: 0,
            borderRadius: 0,
            boxShadow: "none",
            borderBottom: "1px solid #e4e7ed",
          }}
          filters={{
            academicYear,
            name: filters.name,
            studentId: filters.studentId,
            idCard: filters.idCard,
            department: filters.department,
            major: filters.major,
          }}
          onChange={(key, value) => {
            setPage(1);
            if (key === "academicYear") {
              setAcademicYear(value);
            } else {
              setFilters((prev) => ({ ...prev, [key]: value }));
            }
          }}
          onReset={() => {
            setPage(1);
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
    height: "100%",
    maxHeight: "100%",
    flex: 1,
    minHeight: 0,
    padding: 16,
    boxSizing: "border-box",
    background: "#f5f7fa",
    display: "flex",
    flexDirection: "column",
    gap: 14,
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexShrink: 0,
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
    position: "relative",
    overflow: "hidden",
  },
  tableWrap: {
    flex: "1 1 0",
    width: "100%",
    overflowY: "auto",
    overflowX: "auto",
    minHeight: 0,
    overscrollBehavior: "contain",
    scrollbarWidth: "thin",
    scrollbarColor: "#409eff #e4e7ed",
  },
  table: {
    width: "100%",
    minWidth: "1800px",
    borderCollapse: "separate",
    borderSpacing: 0,
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
