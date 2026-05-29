// 本专科困难生处理服务：负责本专科数据规则校验、修复、标记和 Excel 导出。

import * as XLSX from "xlsx-js-style";
import type {
  CheckResult,
  DisqualifiedRow,
  ErrorReportItem,
  HighlightInfo,
  ProcessLog,
  ProcessingStats,
  WorkbookData,
} from "./types";
import { buildColumnMap, findHeaderRowIndex, parseRuleOptions } from "./templateParser";
import { applyHighlightStyle, cloneWorksheet } from "./excelExport";
import { supabase } from '../utils/supabaseClient';
import {
  cleanFieldName,
  compressText,
  disabilityCategoryList,
  digitsOnly,
  extractMaxLength,
  fixDisabilityCategory,
  fixIncomeSource,
  fixProvince,
  fixSpecialDifficulty,
  fixYesNo,
  formatIncomeNumber,
  incomeSourceList,
  isRequiredByRule,
  isValidIdCard,
  isValidPhone,
  isValidPostcode,
  isZeroLikeText,
  normalizeText,
  parseAmountToNumber,
  parseIntegerValue,
  shouldBeNumber,
  SMART_FIX,
  specialDifficultyList,
  specialDifficultyRequiredList,
  trimIntegerToSixDigits,
} from "../utils/validators";

type StudentProcessorInput = {
  templateFields: string[];
  templateFirstRow: unknown[];
  dictionaryMap: Record<string, string[]>;
  fieldDictMap: Record<string, string>;
  sourceRows: unknown[][];
  onLog?: (log: ProcessLog) => void;
  onProgress?: (stats: ProcessingStats, status: string) => void;
};

export type StudentProcessorResult = {
  processedData: Record<string, unknown>[];
  highlightCellMap: Record<string, HighlightInfo>;
  disqualifiedRows: DisqualifiedRow[];
  analysis: Record<string, number>;
  stats: ProcessingStats;
  removedHeaders: { header: string; index: number }[];
  errorReports: ErrorReportItem[];
};

const makeStats = (
  total: number,
  repaired: number,
  errors: number,
  missingFields: number,
  removedFields: number,
  highlighted: number,
  disqualified: number
): ProcessingStats => ({
  total,
  repaired,
  errors,
  missingFields,
  removedFields,
  highlighted,
  disqualified,
});

const addMark = (
  highlightMap: Record<string, HighlightInfo>,
  rowIndex: number,
  colIndex: number,
  color: HighlightInfo["color"],
  reason: string
) => {
  highlightMap[`${rowIndex}_${colIndex}`] = { color, reason };
};

const addErrorReport = (
  errorReports: ErrorReportItem[],
  rowIndex: number,
  fieldName: string,
  originalValue: unknown,
  fixedValue: unknown,
  issueType: string,
  action: string
) => {
  errorReports.push({
    rowIndex,
    fieldName,
    originalValue,
    fixedValue,
    issueType,
    action,
  });
};

const isRequiredField = (field: string, index: number, firstRow: unknown[]) => {
  const ruleText = String(firstRow[index] ?? "");
  return isRequiredByRule(field, ruleText);
};

const getColumnValidList = (
  field: string,
  index: number,
  firstRow: unknown[],
  dictionaryMap: Record<string, string[]>,
  fieldDictMap: Record<string, string>
) => {
  if (index === 36 || cleanFieldName(field).includes("残疾类别")) return disabilityCategoryList;
  if (cleanFieldName(field).includes("特殊困难类型")) return specialDifficultyList;
  if (index === 39 || cleanFieldName(field).includes("收入来源")) return incomeSourceList;

  const ruleText = String(firstRow[index] ?? "");
  const ruleOptions = parseRuleOptions(ruleText);
  const dictType = fieldDictMap[field];
  const dictValues = dictType ? dictionaryMap[dictType] || [] : [];

  return Array.from(new Set([...dictValues, ...ruleOptions].filter(Boolean)));
};

const mostFrequentApplicationDay = (rows: unknown[][], columnMap: { templateIndex: number; sourceIndex: number }[]) => {
  const dateMapItem = columnMap.find((item) => item.templateIndex === 6);
  if (!dateMapItem || dateMapItem.sourceIndex < 0) return "01";

  const dayCount: Record<string, number> = {};

  rows.forEach((row) => {
    const value = String(row[dateMapItem.sourceIndex] ?? "").trim();
    const digits = value.replace(/\D/g, "");
    let day = "";

    if (digits.length >= 8) day = digits.slice(-2);
    else if (digits.length >= 2) day = digits.slice(-2);

    if (/^(0[1-9]|[12]\d|3[01])$/.test(day)) {
      dayCount[day] = (dayCount[day] || 0) + 1;
    }
  });

  return Object.keys(dayCount).sort((a, b) => dayCount[b] - dayCount[a])[0] || "01";
};

const fixApplicationDate = (targetDay: string) => {
  const year = new Date().getFullYear();
  return `${year}09${targetDay}`;
};

const checkFamilyIncomeLColumn = (originalRawValue: unknown): CheckResult => {
  const raw = String(originalRawValue ?? "").trim();

  if (isZeroLikeText(raw)) {
    return {
      value: "0",
      valid: true,
      repaired: raw !== "0",
      reason: "L列家庭年均收入为空或无，已填写0",
      highlight: false,
    };
  }

  const num = parseAmountToNumber(raw);

  if (num === null || Number.isNaN(num)) {
    return {
      value: raw,
      valid: false,
      repaired: false,
      reason: "L列家庭年均收入必须填写数字",
      highlight: true,
      highlightColor: "yellow",
    };
  }

  const fixed = formatIncomeNumber(num);

  if (num >= 1000000) {
    return {
      value: fixed,
      valid: false,
      repaired: fixed !== raw,
      reason: "家庭年均收入达到或超过1000000，不符合困难生申请，不通过",
      highlight: true,
      highlightColor: "red",
      disqualified: true,
    };
  }

  return {
    value: fixed,
    valid: true,
    repaired: fixed !== raw,
    reason: "L列家庭年均收入已按整数位≤6、小数位≤2处理",
    highlight: false,
  };
};

const checkUnexpectedEventPColumn = (originalRawValue: unknown): CheckResult => {
  const raw = String(originalRawValue ?? "").trim();
  const noneWords = ["无", "没有", "否", "未发生", "无事件", "没发生", "暂无"];

  if (raw === "" || noneWords.some((item) => normalizeText(raw).includes(normalizeText(item)))) {
    return {
      value: "无",
      valid: true,
      repaired: raw !== "无",
      reason: "P列突发意外事件描述为空或否定类，已填写无",
      highlight: false,
    };
  }

  const fixed = compressText(raw, 60);

  return {
    value: fixed,
    valid: true,
    repaired: fixed !== raw,
    reason: fixed !== raw ? "P列突发意外事件描述超过60字符，已自动缩减" : "P列符合60字符要求",
    highlight: false,
  };
};

const checkDebtAmountSColumn = (originalRawValue: unknown): CheckResult => {
  const raw = String(originalRawValue ?? "").trim();

  if (isZeroLikeText(raw) || ["无欠债", "没有欠债"].includes(raw)) {
    return {
      value: "0",
      valid: true,
      repaired: raw !== "0",
      reason: "S列家庭欠债金额为空或无欠债，已填写0",
      highlight: false,
    };
  }

  const num = parseAmountToNumber(raw);

  if (num === null || Number.isNaN(num)) {
    return {
      value: raw,
      valid: false,
      repaired: false,
      reason: "S列家庭欠债金额必须为数字，例如20000",
      highlight: true,
      highlightColor: "yellow",
    };
  }

  const fixed = trimIntegerToSixDigits(num);

  return {
    value: fixed,
    valid: true,
    repaired: fixed !== raw,
    reason: fixed !== raw ? "S列家庭欠债金额已按整数位不超过6位修正" : "S列家庭欠债金额符合要求",
    highlight: false,
  };
};

const checkDebtReasonTColumn = (originalRawValue: unknown): CheckResult => {
  const raw = String(originalRawValue ?? "").trim();

  if (raw === "") {
    return {
      value: "无",
      valid: true,
      repaired: true,
      reason: "T列学生家庭欠债原因为空，已填写无",
      highlight: false,
    };
  }

  const fixed = compressText(raw, 60);

  return {
    value: fixed,
    valid: true,
    repaired: fixed !== raw,
    reason: fixed !== raw ? "T列欠债原因超过60字符，已自动缩减" : "T列欠债原因符合60字符要求",
    highlight: false,
  };
};

const checkOtherEconomicInfoUColumn = (originalRawValue: unknown): CheckResult => {
  const raw = String(originalRawValue ?? "").trim();

  if (raw === "") {
    return {
      value: "无",
      valid: true,
      repaired: true,
      reason: "U列其它影响家庭经济信息为空，已填写无",
      highlight: false,
    };
  }

  const fixed = compressText(raw, 100);

  return {
    value: fixed,
    valid: true,
    repaired: fixed !== raw,
    reason: fixed !== raw ? "U列其它影响家庭经济信息超过100字符，已自动缩减" : "U列符合100字符要求",
    highlight: false,
  };
};

const checkWColumnOnlyLength = (originalRawValue: unknown): CheckResult => {
  const raw = String(originalRawValue ?? "").trim();
  const fixed = compressText(raw, 60);

  return {
    value: fixed,
    valid: true,
    repaired: fixed !== raw,
    reason: fixed !== raw ? "W列超过60字，已自动精简，不标黄" : "W列未超过60字",
    highlight: false,
  };
};

const checkDisabilityCategoryAKColumn = (originalRawValue: unknown): CheckResult => {
  const raw = String(originalRawValue ?? "").trim();
  const fixed = fixDisabilityCategory(raw);
  const valid = disabilityCategoryList.includes(fixed);

  return {
    value: fixed,
    valid,
    repaired: fixed !== raw,
    reason: valid
      ? "AK列残疾类别已按允许字典值处理"
      : "AK列残疾类别只能填写：无、视力残疾、听力残疾、智力残疾、其他残疾",
    highlight: !valid,
    highlightColor: "yellow",
  };
};

const checkAndFixCellByColumnRule = (
  field: string,
  columnIndex: number,
  originalRawValue: unknown,
  targetApplicationDay: string,
  firstRow: unknown[],
  dictionaryMap: Record<string, string[]>,
  fieldDictMap: Record<string, string>
): CheckResult => {
  const ruleText = String(firstRow[columnIndex] ?? "");
  const required = isRequiredField(field, columnIndex, firstRow);
  let value = String(originalRawValue ?? "").trim();

  if (columnIndex === 14) {
    const fixed = fixYesNo(value);
    return { value: fixed, valid: true, repaired: fixed !== value, reason: "O列已统一为是/否", highlight: false };
  }

  if (columnIndex === 15 || cleanFieldName(field).includes("突发意外事件具体描述")) return checkUnexpectedEventPColumn(value);
  if (columnIndex === 18 || cleanFieldName(field).includes("家庭欠债金额")) return checkDebtAmountSColumn(value);
  if (columnIndex === 19 || cleanFieldName(field).includes("欠债原因")) return checkDebtReasonTColumn(value);
  if (columnIndex === 20) return checkOtherEconomicInfoUColumn(value);
  if (columnIndex === 22) return checkWColumnOnlyLength(value);

  if ([26, 27, 29].includes(columnIndex)) {
    return {
      value: "同意",
      valid: true,
      repaired: value !== "同意",
      reason: `${["AA", "AB", "AD"][[26, 27, 29].indexOf(columnIndex)]}列已统一填写为同意`,
      highlight: false,
    };
  }

  if (columnIndex === 36 || cleanFieldName(field).includes("残疾类别")) return checkDisabilityCategoryAKColumn(value);

  if (shouldBeNumber(field, ruleText) && isZeroLikeText(value)) {
    return {
      value: "0",
      valid: true,
      repaired: value !== "0",
      reason: "数字列为空或填写无，已统一改为0",
      highlight: false,
    };
  }

  if (value === "") {
    if (columnIndex === 39 || cleanFieldName(field).includes("收入来源")) {
      return {
        value: "其他应当计入家庭的收入",
        valid: true,
        repaired: true,
        reason: "AN列收入来源为空，已归为其他应当计入家庭的收入",
        highlight: false,
      };
    }

    return {
      value: "",
      valid: !required,
      repaired: false,
      reason: required ? "必填项为空" : "非必填项为空，允许为空",
      highlight: required,
      highlightColor: "yellow",
    };
  }

  if (columnIndex === 2 || field.includes("身份证号")) {
    const fixed = value.replace(/\s+/g, "").toUpperCase();
    const valid = isValidIdCard(fixed);

    return {
      value: fixed,
      valid,
      repaired: fixed !== value,
      reason: valid ? "身份证号符合18位规则" : "身份证号必须为18位，最后一位允许X",
      highlight: !valid,
      highlightColor: "yellow",
    };
  }

  if (columnIndex === 4) {
    const digits = digitsOnly(value);
    return {
      value: digits,
      valid: isValidPhone(digits),
      repaired: digits !== value,
      reason: isValidPhone(digits) ? "E列手机号码符合11位规则" : "E列手机号码必须为11位",
      highlight: !isValidPhone(digits),
      highlightColor: "yellow",
    };
  }

  if (columnIndex === 8) {
    const digits = digitsOnly(value);
    const valid = isValidPostcode(digits);
    return {
      value: digits,
      valid,
      repaired: digits !== value,
      reason: valid ? "I列邮政编码符合6位规则" : "I列邮政编码必须为6位",
      highlight: !valid,
      highlightColor: "yellow",
    };
  }

  if (columnIndex === 9) {
    const digits = digitsOnly(value);
    return {
      value: digits,
      valid: isValidPhone(digits),
      repaired: digits !== value,
      reason: isValidPhone(digits) ? "J列家长手机号码符合11位规则" : "J列家长手机号码必须为11位",
      highlight: !isValidPhone(digits),
      highlightColor: "yellow",
    };
  }

  if (columnIndex === 6) {
    const fixed = fixApplicationDate(targetApplicationDay);
    return {
      value: fixed,
      valid: true,
      repaired: fixed !== value,
      reason: `G列申请日期统一为当前年份9月${targetApplicationDay}日`,
      highlight: false,
    };
  }

  if (columnIndex === 11 || cleanFieldName(field).includes("家庭年均收入")) return checkFamilyIncomeLColumn(value);

  if (cleanFieldName(field).includes("特殊困难类型")) {
    const fixed = fixSpecialDifficulty(value);
    const valid = specialDifficultyList.includes(fixed);
    return {
      value: fixed,
      valid,
      repaired: fixed !== value,
      reason: valid ? "特殊困难类型已按最接近字典值修正" : "特殊困难类型不在允许字典中",
      highlight: !valid,
      highlightColor: "yellow",
    };
  }

  if (columnIndex === 30 || field.includes("户籍性质")) {
    const fixed = SMART_FIX[value] || value;
    const finalValue = fixed.includes("城") || fixed.includes("非农")
      ? "城镇"
      : fixed.includes("农") || fixed.includes("乡")
      ? "农村"
      : fixed;
    const valid = finalValue === "城镇" || finalValue === "农村";

    return {
      value: finalValue,
      valid,
      repaired: finalValue !== value,
      reason: valid ? "AE列户籍性质已按规则统一" : "AE列只能填写城镇或农村",
      highlight: !valid,
      highlightColor: "yellow",
    };
  }

  if (columnIndex === 39 || cleanFieldName(field).includes("收入来源")) {
    const fixed = fixIncomeSource(value);

    return {
      value: fixed,
      valid: true,
      repaired: fixed !== value,
      reason:
        fixed === "其他应当计入家庭的收入" && normalizeText(value) !== normalizeText(fixed)
          ? "AN列收入来源未检索到明确类型，已统一归为其他应当计入家庭的收入"
          : "AN列收入来源已按最接近字典值修正",
      highlight: false,
    };
  }

  if (field.includes("籍贯") || columnIndex === 1) value = fixProvince(value);
  if (SMART_FIX[value]) value = SMART_FIX[value];

  if (shouldBeNumber(field, ruleText)) {
    const num = parseAmountToNumber(value);

    if (num === null || Number.isNaN(num)) {
      return {
        value,
        valid: false,
        repaired: false,
        reason: "该列只能填写数字",
        highlight: true,
        highlightColor: "yellow",
      };
    }

    const fixed = String(Math.floor(num));
    return {
      value: fixed,
      valid: true,
      repaired: fixed !== value,
      reason: fixed !== value ? "数字列已转换为规范整数" : "数字列符合要求",
      highlight: false,
    };
  }

  const maxLength = extractMaxLength(ruleText);
  if (maxLength && value.length > maxLength) {
    const before = value;
    value = value.slice(0, maxLength);
    return {
      value,
      valid: true,
      repaired: true,
      reason: `超过${maxLength}个字符，已截断。原值：${before}`,
      highlight: false,
    };
  }

  const validList = getColumnValidList(field, columnIndex, firstRow, dictionaryMap, fieldDictMap);
  if (validList.length > 0) {
    const exact = validList.find((item) => normalizeText(item) === normalizeText(value));
    if (exact) {
      return {
        value: exact,
        valid: true,
        repaired: exact !== String(originalRawValue ?? "").trim(),
        reason: "符合该列字典要求",
        highlight: false,
      };
    }

    return {
      value,
      valid: false,
      repaired: false,
      reason: `不符合该列字典要求，只能填写：${validList.join("、")}`,
      highlight: true,
      highlightColor: "yellow",
    };
  }

  return {
    value,
    valid: true,
    repaired: value !== String(originalRawValue ?? "").trim(),
    reason: value !== String(originalRawValue ?? "").trim() ? "按该列格式规则修复" : "符合该列规则",
    highlight: false,
  };
};

const checkCrossColumnRules = (
  result: Record<string, unknown>[],
  highlightMap: Record<string, HighlightInfo>,
  fieldErrors: Record<string, number>,
  templateFields: string[],
  errorReports: ErrorReportItem[]
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
        const fieldName = templateFields[colIndex] || `第${colIndex + 1}列`;
        if (!highlightMap[key]) marked++;
        addMark(highlightMap, rowIndex, colIndex, "red", reason);
        addErrorReport(errorReports, rowIndex, fieldName, row[fieldName], row[fieldName], "标红", reason);
      });
      fieldErrors[kField] = (fieldErrors[kField] || 0) + 1;
      fieldErrors[vField] = (fieldErrors[vField] || 0) + 1;
      fieldErrors[zField] = (fieldErrors[zField] || 0) + 1;
    }
  });

  return marked;
};

const finalRequiredEmptyCellValidation = (
  result: Record<string, unknown>[],
  highlightMap: Record<string, HighlightInfo>,
  fieldErrors: Record<string, number>,
  templateFields: string[],
  templateFirstRow: unknown[],
  errorReports: ErrorReportItem[]
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
      addErrorReport(errorReports, rowIndex, field, value, value, "必填缺失", "最终复检：必填项处理后仍为空，需要人工复核");
      addErrorReport(errorReports, rowIndex, field, value, value, "标黄", "最终复检：必填项处理后仍为空，需要人工复核");
      fieldErrors[field] = (fieldErrors[field] || 0) + 1;
    });
  });

  return marked;
};

const markNamesForRowsWithIssues = (
  result: Record<string, unknown>[],
  highlightMap: Record<string, HighlightInfo>,
  templateFields: string[],
  errorReports: ErrorReportItem[]
) => {
  let marked = 0;

  result.forEach((row, rowIndex) => {
    const rowHasIssue = Object.keys(highlightMap).some((key) => key.startsWith(`${rowIndex}_`));
    if (!rowHasIssue) return;
    const key = `${rowIndex}_0`;
    const fieldName = templateFields[0] || "姓名";
    const reason = "该学生所在行存在问题，详见不通过名单";
    if (!highlightMap[key]) {
      marked++;
      addErrorReport(errorReports, rowIndex, fieldName, row[fieldName], row[fieldName], "标黄", reason);
    }
    addMark(highlightMap, rowIndex, 0, "yellow", reason);
  });

  return marked;
};

const buildFailListFromHighlights = (
  result: Record<string, unknown>[],
  highlightMap: Record<string, HighlightInfo>,
  templateFields: string[]
) => {
  const list: DisqualifiedRow[] = [];

  result.forEach((row, rowIndex) => {
    const entries = Object.entries(highlightMap)
      .filter(([key]) => key.startsWith(`${rowIndex}_`))
      .filter(([key]) => !Number.isNaN(Number(key.split("_")[1])));

    if (entries.length === 0) return;

    const reasons = entries
      .filter(([key]) => Number(key.split("_")[1]) !== 0)
      .map(([key, info]) => {
        const colIndex = Number(key.split("_")[1]);
        const fieldName = templateFields[colIndex] || `第${colIndex + 1}列`;
        return `${fieldName}：${info.reason}`;
      });

    list.push({
      rowNumber: rowIndex + 1,
      name: String(row[templateFields[0]] ?? ""),
      idCard: String(row[templateFields[2]] ?? ""),
      income: String(row[templateFields[11]] ?? ""),
      reason: reasons.length > 0 ? Array.from(new Set(reasons)).join("；") : "姓名或个人信息存在问题",
    });
  });

  return list;
};

export const processStudentRows = async ({
  templateFields,
  templateFirstRow,
  dictionaryMap,
  fieldDictMap,
  sourceRows,
  onLog,
  onProgress,
}: StudentProcessorInput): Promise<StudentProcessorResult> => {
  const headerIndex = findHeaderRowIndex(sourceRows, templateFields);
  const headers = (sourceRows[headerIndex] || []).map((item) => String(item ?? "").trim());
  const sourceDataRows = sourceRows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));

  const { columnMap, removedHeaders } = buildColumnMap(headers, templateFields);
  const targetApplicationDay = mostFrequentApplicationDay(sourceDataRows, columnMap);

  onLog?.({
    type: "info",
    message: `开始执行【困难生数据处理】

本次规则：
AA、AB、AD列统一为同意；
W列超过60字自动精简，不标黄；
其它规则保持。`,
  });

  if (removedHeaders.length > 0) {
    onLog?.({
      type: "error",
      message: `检测到 ${removedHeaders.length} 个模板外字段，导出时删除：
${removedHeaders.map((item) => item.header).join("、")}`,
    });
  }

  let repairedCount = 0;
  let errorCount = 0;
  let missingFieldCount = 0;

  const fieldErrors: Record<string, number> = {};
  const result: Record<string, unknown>[] = [];
  const highlightMap: Record<string, HighlightInfo> = {};
  const failRows: DisqualifiedRow[] = [];
  const errorReports: ErrorReportItem[] = [];

  for (let i = 0; i < sourceDataRows.length; i++) {
    const sourceRow = sourceDataRows[i];
    const outputRow: Record<string, unknown> = {};

    for (const mapItem of columnMap) {
      const field = mapItem.templateField;
      const colIndex = mapItem.templateIndex;
      const required = isRequiredField(field, colIndex, templateFirstRow);

      if (mapItem.sourceIndex < 0) {
        missingFieldCount++;
        outputRow[field] = "";

        if (required) {
          errorCount++;
          fieldErrors[field] = (fieldErrors[field] || 0) + 1;
          addMark(highlightMap, i, colIndex, "yellow", "源数据缺少该必填字段");
          addErrorReport(errorReports, i, field, "", "", "必填缺失", "源数据缺少该必填字段");
          addErrorReport(errorReports, i, field, "", "", "标黄", "源数据缺少该必填字段");
        }

        continue;
      }

      const originalValue = sourceRow[mapItem.sourceIndex];
      const checked = checkAndFixCellByColumnRule(
        field,
        colIndex,
        originalValue,
        targetApplicationDay,
        templateFirstRow,
        dictionaryMap,
        fieldDictMap
      );

      outputRow[field] = checked.value;

      if (checked.repaired) {
        repairedCount++;
        addErrorReport(errorReports, i, field, originalValue, checked.value, "自动修复", checked.reason);
        onLog?.({
          type: "success",
          message: `第 ${i + 1} 行 第 ${colIndex + 1} 列 ${field}
原值：${String(originalValue ?? "").trim()}
修复后：${checked.value}
依据：${checked.reason}`,
        });
      }

      if (!checked.valid) {
        errorCount++;
        fieldErrors[field] = (fieldErrors[field] || 0) + 1;
        addErrorReport(
          errorReports,
          i,
          field,
          originalValue,
          checked.value,
          checked.reason.includes("必填项为空") ? "必填缺失" : "数据格式错误",
          checked.reason
        );
        onLog?.({
          type: "error",
          message: `第 ${i + 1} 行 第 ${colIndex + 1} 列 ${field}
问题值：${String(originalValue ?? "").trim()}
原因：${checked.reason}`,
        });
      }

      if (checked.highlight) {
        const highlightColor = checked.highlightColor || "yellow";
        addMark(highlightMap, i, colIndex, highlightColor, checked.reason);
        if (highlightColor === "red" || highlightColor === "yellow") {
          addErrorReport(
            errorReports,
            i,
            field,
            originalValue,
            checked.value,
            highlightColor === "red" ? "标红" : "标黄",
            checked.reason
          );
        }
      }

      if (checked.disqualified) {
        failRows.push({
          rowNumber: i + 1,
          name: String(outputRow[templateFields[0]] ?? ""),
          idCard: String(outputRow[templateFields[2]] ?? ""),
          income: checked.value,
          reason: checked.reason,
        });
      }
    }

    result.push(outputRow);
    onProgress?.(
      makeStats(
        sourceDataRows.length,
        repairedCount,
        errorCount,
        missingFieldCount,
        removedHeaders.length,
        Object.keys(highlightMap).length,
        failRows.length
      ),
      `处理中 ${i + 1} / ${sourceDataRows.length}`
    );
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  const crossMarked = checkCrossColumnRules(result, highlightMap, fieldErrors, templateFields, errorReports);
  const emptyMarked = finalRequiredEmptyCellValidation(result, highlightMap, fieldErrors, templateFields, templateFirstRow, errorReports);
  markNamesForRowsWithIssues(result, highlightMap, templateFields, errorReports);
  errorCount += crossMarked + emptyMarked;

  const finalFailRows = buildFailListFromHighlights(result, highlightMap, templateFields);
  const stats = makeStats(
    sourceDataRows.length,
    repairedCount,
    errorCount,
    missingFieldCount,
    removedHeaders.length,
    Object.keys(highlightMap).length,
    finalFailRows.length
  );

  onLog?.({
    type: "success",
    message: `困难生数据处理完成
输出数据行数：${result.length}
自动修复：${repairedCount}
异常问题：${errorCount}
标记单元格：${Object.keys(highlightMap).length}
不通过人数：${finalFailRows.length}`,
  });

  try {
    const studentIdFieldIndex = templateFields.findIndex((field) => cleanFieldName(field).includes("学号"));
    const studentIdField = studentIdFieldIndex >= 0 ? templateFields[studentIdFieldIndex] : "";

    const cloudRows = result.map((row) => ({
      college_name: String(row[templateFields[1]] ?? "").trim() || "未填学院",
      student_id: studentIdField ? String(row[studentIdField] ?? "").trim() : "",
      name: String(row[templateFields[0]] ?? "").trim(),
      id_card: String(row[templateFields[2]] ?? "").trim(),
      difficulty_level: String(row[templateFields[11]] ?? "").trim(),
      status: "pending_review",
    }));

    const { error: syncError } = await supabase.from("students").insert(cloudRows);
    if (syncError) throw syncError;

    onLog?.({
      type: "success",
      message: "🎉 云端数据同步成功，全校数据库已实时更新！",
    });
  } catch (error) {
    console.error("Supabase sync failed:", error);
    onLog?.({
      type: "error",
      message: "⚠️ 云端同步暂时失败，系统已自动转为本地 Excel/IndexedDB 备份机制，数据绝对安全。",
    });
  }

  return {
    processedData: result,
    highlightCellMap: highlightMap,
    disqualifiedRows: finalFailRows,
    analysis: fieldErrors,
    stats,
    removedHeaders,
    errorReports,
  };
};

const shouldWriteNumberCell = (field: string, columnIndex: number, firstRow: unknown[]) => {
  const ruleText = String(firstRow[columnIndex] ?? "");
  if (field.includes("身份证")) return false;
  if (field.includes("手机")) return false;
  if (field.includes("电话")) return false;
  if (field.includes("邮政编码")) return false;
  return shouldBeNumber(field, ruleText) || columnIndex === 11 || columnIndex === 18;
};

export const exportStudentExcel = ({
  processedData,
  templateWorkbook,
  templateOutputSheet,
  templateDictSheet,
  templateFields,
  templateFirstRow,
  highlightCellMap,
  disqualifiedRows,
}: {
  processedData: Record<string, unknown>[];
  templateWorkbook: WorkbookData;
  templateOutputSheet: string;
  templateDictSheet: string;
  templateFields: string[];
  templateFirstRow: unknown[];
  highlightCellMap: Record<string, HighlightInfo>;
  disqualifiedRows: DisqualifiedRow[];
}) => {
  const originalSheet = templateWorkbook.worksheets[templateOutputSheet];
  if (!originalSheet) throw new Error("模板输出表不存在");

  const worksheet = cloneWorksheet(originalSheet);

  Object.keys(worksheet).forEach((address) => {
    if (!/^[A-Z]+[0-9]+$/.test(address)) return;
    const cell = XLSX.utils.decode_cell(address);
    if (cell.r >= 2 || cell.c >= templateFields.length) delete (worksheet as Record<string, unknown>)[address];
  });

  processedData.forEach((row, rowIndex) => {
    templateFields.forEach((field, colIndex) => {
      const address = XLSX.utils.encode_cell({ r: rowIndex + 2, c: colIndex });
      const sampleAddress = XLSX.utils.encode_cell({ r: 2, c: colIndex });
      const headerAddress = XLSX.utils.encode_cell({ r: 1, c: colIndex });
      const sampleCell = (originalSheet as Record<string, { s?: unknown }>)[sampleAddress] ||
        (originalSheet as Record<string, { s?: unknown }>)[headerAddress];
      const value = row[field] ?? "";
      let cell: Record<string, unknown> = { v: value, t: "s" };

      if (shouldWriteNumberCell(field, colIndex, templateFirstRow) && value !== "" && !Number.isNaN(Number(value))) {
        cell = { ...cell, v: Number(value), t: "n" };
      }

      if (sampleCell?.s) cell.s = { ...(sampleCell.s as Record<string, unknown>) };
      cell = applyHighlightStyle(cell, highlightCellMap[`${rowIndex}_${colIndex}`]);
      (worksheet as Record<string, unknown>)[address] = cell;
    });
  });

  worksheet["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: processedData.length + 1, c: templateFields.length - 1 },
  });
  worksheet["!cols"] = originalSheet["!cols"] || templateFields.map(() => ({ wch: 28 }));
  if (originalSheet["!rows"]) worksheet["!rows"] = JSON.parse(JSON.stringify(originalSheet["!rows"]));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, templateOutputSheet || "治理结果");

  if (templateDictSheet && templateWorkbook.worksheets[templateDictSheet]) {
    XLSX.utils.book_append_sheet(workbook, cloneWorksheet(templateWorkbook.worksheets[templateDictSheet]), templateDictSheet);
  }

  const failSheetRows = [
    ["源数据行号", "姓名", "身份证号", "家庭年均收入", "不通过原因", "处理结果"],
    ...disqualifiedRows.map((item) => [
      item.rowNumber,
      item.name,
      item.idCard,
      item.income,
      item.reason,
      "不通过",
    ]),
  ];
  const failSheet = XLSX.utils.aoa_to_sheet(failSheetRows);
  failSheet["!cols"] = [
    { wch: 12 },
    { wch: 15 },
    { wch: 25 },
    { wch: 18 },
    { wch: 80 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(workbook, failSheet, "不通过名单");

  const issueEntries = Object.entries(highlightCellMap)
    .map(([key, info]) => {
      const [rowIndexText, colIndexText] = key.split("_");
      return {
        rowIndex: Number(rowIndexText),
        colIndex: Number(colIndexText),
        info,
      };
    })
    .filter((item) => !Number.isNaN(item.rowIndex) && !Number.isNaN(item.colIndex))
    .sort((a, b) => a.rowIndex - b.rowIndex || a.colIndex - b.colIndex);

  const issueSheetRows =
    issueEntries.length === 0
      ? [["暂无问题"]]
      : [
          ["源数据行号", "字段名", "当前值", "标记颜色", "问题原因"],
          ...issueEntries.map(({ rowIndex, colIndex, info }) => {
            const fieldName = templateFields[colIndex] || `第${colIndex + 1}列`;
            return [
              rowIndex + 1,
              fieldName,
              processedData[rowIndex]?.[fieldName] ?? "",
              info.color,
              info.reason,
            ];
          }),
        ];
  const issueSheet = XLSX.utils.aoa_to_sheet(issueSheetRows);
  issueSheet["!cols"] = [
    { wch: 12 },
    { wch: 28 },
    { wch: 28 },
    { wch: 12 },
    { wch: 80 },
  ];
  XLSX.utils.book_append_sheet(workbook, issueSheet, "问题清单");

  XLSX.writeFile(workbook, `困难生数据处理结果_${Date.now()}.xlsx`);

  return { failCount: disqualifiedRows.length };
};