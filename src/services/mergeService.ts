import { checkMergeDuplicates } from "./mergeDuplicateChecker";
import * as XLSX from "xlsx-js-style";
import type { CollegeProcessedBatch, MergeResult } from "../types/merge";
import { getBatchAcademicYear } from "../utils/academicYear";
import { normalizeSubmissionCollegeName } from "../utils/collegeDetector";

export function mergeBatches(batches: CollegeProcessedBatch[]): MergeResult {
  const rows = batches.flatMap((batch) =>
    batch.rows.map((row) => ({
      学年: getBatchAcademicYear(batch),
      来源学院: normalizeSubmissionCollegeName(batch.collegeName),
      数据类型: batch.dataType === "student" ? "本专科信息" : "家庭成员信息",
      批次时间: batch.createdAt,
      ...row,
    }))
  );

  return {
    totalRows: rows.length,
    collegeCount: new Set(batches.map((item) => normalizeSubmissionCollegeName(item.collegeName))).size,
    rows,
  };
}

export function exportMergedExcel(batches: CollegeProcessedBatch[]) {
  const result = mergeBatches(batches);
  const duplicateIssues = checkMergeDuplicates(batches);

  const worksheet = XLSX.utils.json_to_sheet(result.rows);
  worksheet["!cols"] = Object.keys(result.rows[0] || {}).map(() => ({ wch: 22 }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "全校汇总表");

  if (duplicateIssues.length > 0) {
    const duplicateRows = duplicateIssues.flatMap((issue) =>
      issue.rows.map((row) => ({
        问题类型: issue.issueType,
        重复值: issue.key,
        重复次数: issue.count,
        来源学院: row["来源学院"] ?? "",
        数据类型:
          row["数据类型"] === "student"
            ? "本专科信息"
            : row["数据类型"] === "family"
            ? "家庭成员信息"
            : row["数据类型"] ?? "",
        批次时间: row["批次时间"] ?? "",
        原始行数据: JSON.stringify(row),
      }))
    );
    const duplicateWorksheet = XLSX.utils.json_to_sheet(duplicateRows);
    duplicateWorksheet["!cols"] = [
      { wch: 16 },
      { wch: 26 },
      { wch: 12 },
      { wch: 18 },
      { wch: 16 },
      { wch: 22 },
      { wch: 80 },
    ];
    XLSX.utils.book_append_sheet(workbook, duplicateWorksheet, "重复数据检查");
  }

  XLSX.writeFile(workbook, `全校困难生汇总表_${Date.now()}.xlsx`);

  return result;
}
