// 本专科困难生跨列规则：集中处理跨字段一致性校验和最终必填项复检。

import type { HighlightInfo } from "./types";
import {
  isRequiredByRule,
  normalizeText,
  specialDifficultyRequiredList,
} from "../utils/validators";

const SPECIAL_DIFFICULTY_LEVEL = "C.家庭经济特别困难";
const SPECIAL_TYPE_REQUIRED_FOR_C_REASON =
  "已选择 C.家庭经济特别困难，特殊困难类型不能为空或为‘无’，请人工核实并选择对应特殊群体类型。";

const normalizeHeader = (value: unknown) =>
  String(value ?? "")
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/（[^）]*）|\([^)]*\)/g, "")
    .replace(/[\s\u00a0\u200b-\u200d\u2060\ufeff\u3000]/g, "")
    .replace(/[*＊()（）:：]/g, "")
    .toLowerCase();

const normalizeDifficultyLevelValue = (value: unknown) => {
  const normalized = normalizeText(value).replace(/[.。．]/g, "");
  if (["c", "c家庭经济特别困难", "特别困难", "家庭经济特别困难"].includes(normalized)) {
    return SPECIAL_DIFFICULTY_LEVEL;
  }
  return "";
};

const isDifficultyLevelField = (field: string) => {
  const normalized = normalizeHeader(field);
  if (normalized.includes("特殊困难")) return false;
  return [
    "推荐档次",
    "院系推荐档次",
    "学校推荐档次",
    "院系认定结果",
    "学校认定结果",
    "困难等级",
    "困难认定等级",
    "认定等级",
  ].some((keyword) => normalized === keyword || normalized.includes(keyword));
};

const isSpecialTypeField = (field: string) => {
  const normalized = normalizeHeader(field);
  return ["特殊困难类型", "特殊群体类型", "特殊困难群体类型", "困难类型"].includes(normalized);
};

const isNoneSpecialDifficulty = (value: unknown) => {
  const normalized = normalizeText(value);
  return ["", "无", "没有", "否", "暂无", "无特殊困难类型"].some((item) => normalized === normalizeText(item));
};

const addMark = (
  highlightMap: Record<string, HighlightInfo>,
  rowIndex: number,
  colIndex: number,
  color: HighlightInfo["color"],
  reason: string
) => {
  highlightMap[`${rowIndex}_${colIndex}`] = { color, reason };
};

const isRequiredField = (field: string, index: number, firstRow: unknown[]) => {
  const ruleText = String(firstRow[index] ?? "");
  return isRequiredByRule(field, ruleText);
};

export const checkCrossColumnRules = (
  result: Record<string, unknown>[],
  highlightMap: Record<string, HighlightInfo>,
  fieldErrors: Record<string, number>,
  templateFields: string[]
) => {
  let marked = 0;
  const specialTypeIndex = templateFields.findIndex(isSpecialTypeField);
  const specialTypeField = specialTypeIndex >= 0 ? templateFields[specialTypeIndex] : "";
  const difficultyLevelColumns = templateFields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => isDifficultyLevelField(field));

  result.forEach((row, rowIndex) => {
    const cLevelColumns = difficultyLevelColumns.filter(({ field }) =>
      normalizeDifficultyLevelValue(row[field]) === SPECIAL_DIFFICULTY_LEVEL
    );
    if (cLevelColumns.length === 0) return;

    const specialTypeValue = specialTypeField ? row[specialTypeField] : "";
    const validSpecialType =
      !isNoneSpecialDifficulty(specialTypeValue) &&
      specialDifficultyRequiredList.some((item) => normalizeText(item) === normalizeText(specialTypeValue));
    if (validSpecialType) return;

    [
      ...(specialTypeIndex >= 0 ? [specialTypeIndex] : []),
      ...cLevelColumns.map(({ index }) => index),
    ].forEach((colIndex) => {
      const key = `${rowIndex}_${colIndex}`;
      if (!highlightMap[key]) marked++;
      addMark(highlightMap, rowIndex, colIndex, "yellow", SPECIAL_TYPE_REQUIRED_FOR_C_REASON);
    });

    if (specialTypeField) fieldErrors[specialTypeField] = (fieldErrors[specialTypeField] || 0) + 1;
    cLevelColumns.forEach(({ field }) => {
      fieldErrors[field] = (fieldErrors[field] || 0) + 1;
    });
  });

  return marked;
};

export const finalRequiredEmptyCellValidation = (
  result: Record<string, unknown>[],
  highlightMap: Record<string, HighlightInfo>,
  fieldErrors: Record<string, number>,
  templateFields: string[],
  templateFirstRow: unknown[]
) => {
  let marked = 0;

  result.forEach((row, rowIndex) => {
    templateFields.forEach((field, colIndex) => {
      const value = String(row[field] ?? "").trim();
      const required = isRequiredField(field, colIndex, templateFirstRow);
      if (!required || value !== "") return;
      const key = `${rowIndex}_${colIndex}`;
      if (highlightMap[key]) return;
      if (!highlightMap[key]) marked++;
      addMark(highlightMap, rowIndex, colIndex, "yellow", "最终复检：必填项处理后仍为空，需要人工复核");
      fieldErrors[field] = (fieldErrors[field] || 0) + 1;
    });
  });

  return marked;
};
