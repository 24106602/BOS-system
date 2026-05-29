// 本专科困难生跨列规则：集中处理跨字段一致性校验和最终必填项复检。

import type { HighlightInfo } from "./types";
import {
  fixSpecialDifficulty,
  isRequiredByRule,
  normalizeText,
  parseIntegerValue,
  specialDifficultyRequiredList,
} from "../utils/validators";

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
  const D = 3;
  const K = 10;
  const V = 21;
  const Z = 25;
  const AC = 28;
  const AF = 31;
  const AH = 33;

  const dField = templateFields[D];
  const kField = templateFields[K];
  const vField = templateFields[V];
  const zField = templateFields[Z];
  const acField = templateFields[AC];
  const afField = templateFields[AF];
  const ahField = templateFields[AH];

  result.forEach((row, rowIndex) => {
    const dValue = parseIntegerValue(row[dField]);
    const afValue = parseIntegerValue(row[afField]);
    const ahValue = parseIntegerValue(row[ahField]);

    if (dValue !== null && afValue !== null && ahValue !== null && !(dValue >= afValue && afValue >= ahValue)) {
      const reason = `人口关系不符合：D家庭人口数(${dValue}) >= AF劳动人口数(${afValue}) >= AH赡养人口数(${ahValue})`;
      [D, AF, AH].forEach((colIndex) => {
        const key = `${rowIndex}_${colIndex}`;
        if (!highlightMap[key]) marked++;
        addMark(highlightMap, rowIndex, colIndex, "purple", reason);
      });
      fieldErrors[dField] = (fieldErrors[dField] || 0) + 1;
      fieldErrors[afField] = (fieldErrors[afField] || 0) + 1;
      fieldErrors[ahField] = (fieldErrors[ahField] || 0) + 1;
    }

    const vValue = String(row[vField] ?? "").trim();
    const zValue = String(row[zField] ?? "").trim();
    const acValue = String(row[acField] ?? "").trim();
    const kValue = String(row[kField] ?? "").trim();

    if (zValue || acValue) {
      if (normalizeText(zValue) !== normalizeText(acValue)) {
        const reason = `Z列和AC列不一致：Z=${zValue || "空"}，AC=${acValue || "空"}`;
        [Z, AC].forEach((colIndex) => {
          const key = `${rowIndex}_${colIndex}`;
          if (!highlightMap[key]) marked++;
          addMark(highlightMap, rowIndex, colIndex, "purple", reason);
        });
        fieldErrors[zField] = (fieldErrors[zField] || 0) + 1;
        fieldErrors[acField] = (fieldErrors[acField] || 0) + 1;
      }
    }

    const isSpecialHardZAC =
      normalizeText(zValue) === normalizeText("C.家庭经济特别困难") &&
      normalizeText(acValue) === normalizeText("C.家庭经济特别困难");

    if (isSpecialHardZAC) {
      const fixedK = fixSpecialDifficulty(kValue);
      const kValid =
        fixedK !== "无" &&
        specialDifficultyRequiredList.some((item) => normalizeText(item) === normalizeText(fixedK));

      if (kValid && fixedK !== kValue) row[kField] = fixedK;

      if (!kValid) {
        const reason = "Z和AC均为C.家庭经济特别困难时，K列必须填写有效特殊困难类型，且不能为无";
        [K, Z, AC].forEach((colIndex) => {
          const key = `${rowIndex}_${colIndex}`;
          if (!highlightMap[key]) marked++;
          addMark(highlightMap, rowIndex, colIndex, "purple", reason);
        });
        fieldErrors[kField] = (fieldErrors[kField] || 0) + 1;
        fieldErrors[zField] = (fieldErrors[zField] || 0) + 1;
        fieldErrors[acField] = (fieldErrors[acField] || 0) + 1;
      }
    }

    const isVZSpecialHard =
      normalizeText(vValue) === normalizeText(zValue) &&
      normalizeText(zValue) === normalizeText("C.家庭经济特别困难");
    const kIsNone = normalizeText(kValue) === normalizeText("无");

    if (isVZSpecialHard && kIsNone) {
      const reason = "V列和Z列均为C.家庭经济特别困难，但K列特殊群体类型为“无”";
      [K, V, Z].forEach((colIndex) => {
        const key = `${rowIndex}_${colIndex}`;
        if (!highlightMap[key]) marked++;
        addMark(highlightMap, rowIndex, colIndex, "red", reason);
      });
      fieldErrors[kField] = (fieldErrors[kField] || 0) + 1;
      fieldErrors[vField] = (fieldErrors[vField] || 0) + 1;
      fieldErrors[zField] = (fieldErrors[zField] || 0) + 1;
    }
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
      if (!highlightMap[key]) marked++;
      addMark(highlightMap, rowIndex, colIndex, "yellow", "最终复检：必填项处理后仍为空，需要人工复核");
      fieldErrors[field] = (fieldErrors[field] || 0) + 1;
    });
  });

  return marked;
};
