import type { CollegeProcessedBatch } from "../types/merge";

export type MergeDuplicateIssue = {
  issueType: "身份证重复" | "学号重复" | "姓名学院重复";
  key: string;
  count: number;
  rows: Record<string, unknown>[];
};

function normalize(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, "");
}

function findField(row: Record<string, unknown>, keywords: string[]): string {
  const keys = Object.keys(row);
  return keys.find((key) => keywords.some((word) => key.includes(word))) || "";
}

function collectDuplicate(
  rows: Record<string, unknown>[],
  keywords: string[],
  issueType: MergeDuplicateIssue["issueType"]
): MergeDuplicateIssue[] {
  const map = new Map<string, Record<string, unknown>[]>();

  rows.forEach((row) => {
    const field = findField(row, keywords);
    if (!field) return;

    const value = normalize(row[field]);
    if (!value) return;

    if (!map.has(value)) map.set(value, []);
    map.get(value)!.push(row);
  });

  return Array.from(map.entries())
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({
      issueType,
      key,
      count: list.length,
      rows: list,
    }));
}

export function checkMergeDuplicates(batches: CollegeProcessedBatch[]): MergeDuplicateIssue[] {
  const rows = batches.flatMap((batch) =>
    batch.rows.map((row) => ({
      来源学院: batch.collegeName,
      数据类型: batch.dataType,
      批次时间: batch.createdAt,
      ...row,
    }))
  );

  const idIssues = collectDuplicate(rows, ["身份证", "证件号"], "身份证重复");
  const studentNoIssues = collectDuplicate(rows, ["学号", "学生编号"], "学号重复");

  const nameCollegeMap = new Map<string, Record<string, unknown>[]>();

  rows.forEach((row) => {
    const nameField = findField(row, ["姓名"]);
    const collegeField = findField(row, ["学院"]);

    if (!nameField || !collegeField) return;

    const key = `${normalize(row[collegeField])}_${normalize(row[nameField])}`;
    if (!key || key === "_") return;

    if (!nameCollegeMap.has(key)) nameCollegeMap.set(key, []);
    nameCollegeMap.get(key)!.push(row);
  });

  const nameCollegeIssues: MergeDuplicateIssue[] = Array.from(nameCollegeMap.entries())
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({
      issueType: "姓名学院重复",
      key,
      count: list.length,
      rows: list,
    }));

  return [...idIssues, ...studentNoIssues, ...nameCollegeIssues];
}