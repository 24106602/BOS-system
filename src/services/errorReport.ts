import * as XLSX from "xlsx-js-style";
import type { ErrorReportItem } from "./types";

export function exportErrorReport(errorReports: ErrorReportItem[]) {
  const rows = errorReports.map((item) => ({
    行号: item.rowIndex + 1,
    字段名: item.fieldName,
    原值: item.originalValue ?? "",
    修复值: item.fixedValue ?? "",
    问题类型: item.issueType,
    处理结果: item.action,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 10 },
    { wch: 24 },
    { wch: 28 },
    { wch: 28 },
    { wch: 16 },
    { wch: 50 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "异常问题报告");
  XLSX.writeFile(workbook, `error_report_${Date.now()}.xlsx`);
}
