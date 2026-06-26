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
import {
  buildColumnMap,
  findHeaderRowIndex,
  normalizeDifficultyHeader,
  parseRuleOptions,
} from "./templateParser";
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
  collegeName?: string;
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

type StudentCloudRow = {
  college_name: string;
  student_id: string;
  name: string;
  id_card: string;
  difficulty_level: string;
  status: string;
};

const makeStudentKey = (collegeName: string, studentId: string, idCard: string) => {
  if (studentId) return `sid:${collegeName}::${studentId}`;
  if (idCard) return `id:${collegeName}::${idCard}`;
  return "";
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

const STRICT_AUTO_REPAIR_FIELDS = [
  "姓名",
  "家庭人口数",
  "劳动力人口数",
  "赡养人口数",
  "特殊困难类型",
];

const POPULATION_FIELDS = new Set(["家庭人口数", "劳动力人口数", "赡养人口数"]);

const GENERAL_DIFFICULTY_LEVEL = "A.家庭经济一般困难";
const SPECIAL_DIFFICULTY_LEVEL = "C.家庭经济特别困难";
const DIFFICULTY_LEVEL_ERROR_REASON =
  "推荐档次必须选择 A.家庭经济一般困难 或 C.家庭经济特别困难，系统不根据其他信息自动判断困难等级。";
const SPECIAL_TYPE_REQUIRED_FOR_C_REASON =
  "已选择 C.家庭经济特别困难，特殊困难类型不能为空或为‘无’，请人工核实并选择对应特殊群体类型。";
const SPECIAL_TYPE_REQUIRED_FOR_C_SUGGESTION =
  "请根据学生实际情况选择脱贫家庭学生、低保家庭学生、孤儿、残疾学生、其他低收入家庭学生等合法类型；如没有特殊群体依据，请将推荐档次改为 A.家庭经济一般困难。";

const displayOriginalValue = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text || "空";
};

const cleanStudentName = (value: unknown) =>
  String(value ?? "")
    .replace(/（[^）]*）|\([^)]*\)/g, "")
    .replace(/[\s\u00a0\u200b-\u200d\u2060\ufeff\u3000]/g, "")
    .replace(/^[：:、,，.。;；"'“”‘’!?！？\-—_]+|[：:、,，.。;；"'“”‘’!?！？\-—_]+$/g, "");

const checkStudentName = (originalValue: unknown): CheckResult => {
  const raw = String(originalValue ?? "");
  const fixed = cleanStudentName(raw);

  if (!fixed) {
    return {
      value: "",
      valid: false,
      repaired: false,
      reason: "姓名为空，无法自动生成真实姓名",
      highlight: true,
      highlightColor: "yellow",
    };
  }

  return {
    value: fixed,
    valid: true,
    repaired: fixed !== raw,
    reason: fixed !== raw ? "姓名中的空格、不可见字符、括号备注或边界符号已自动清理" : "姓名有效",
    highlight: false,
  };
};

const chineseDigitMap: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

const parseChineseInteger = (value: string) => {
  let total = 0;
  let current = 0;

  for (const character of value) {
    if (character in chineseDigitMap) {
      current = chineseDigitMap[character];
      continue;
    }

    const unit = character === "十" ? 10 : character === "百" ? 100 : 0;
    if (!unit) return null;
    total += (current || 1) * unit;
    current = 0;
  }

  return total + current;
};

export const parsePopulationValue = (value: unknown): number | null => {
  const text = String(value ?? "")
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .trim();

  if (!text) return null;
  if (/(?:^|[^\d])-\s*\d|负数|负一|负二|负三|负四|负五|负六|负七|负八|负九/.test(text)) return null;

  const numberMatch = text.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  if (numberMatch) {
    const number = Number(numberMatch[0]);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
  }

  const normalized = normalizeText(text);
  if (["无", "没有", "暂无", "空", "零", "无劳动能力人口"].some((item) => normalized.includes(normalizeText(item)))) {
    return 0;
  }

  const chineseMatch = text.match(/[零〇一二两三四五六七八九十百]+/);
  return chineseMatch ? parseChineseInteger(chineseMatch[0]) : null;
};

const isPopulationEmptyLike = (value: unknown) => {
  const normalized = normalizeText(value);
  return !normalized || ["无", "没有", "暂无", "空", "零", "无劳动能力人口"].some(
    (item) => normalized.includes(normalizeText(item))
  );
};

const noneSpecialDifficultyTexts = ["", "无", "没有", "否", "暂无", "无特殊困难类型"];

const specialDifficultyKeywordMap: Array<[string, string[]]> = [
  ["脱贫不稳定家庭学生", ["脱贫不稳定", "不稳定脱贫"]],
  ["边缘易致贫家庭学生", ["边缘易致贫"]],
  ["突发严重困难家庭学生", ["突发严重困难"]],
  ["低保边缘家庭学生", ["低保边缘"]],
  ["特困救助供养学生", ["特困救助供养", "特困供养", "五保", "特困"]],
  ["刚性支出困难家庭学生", ["刚性支出"]],
  ["其他低收入家庭学生", ["其他低收入", "低收入"]],
  ["事实无人抚养儿童", ["事实无人抚养", "无人抚养"]],
  ["残疾人子女", ["残疾人子女", "父母残疾"]],
  ["残疾学生", ["残疾学生", "本人残疾"]],
  ["烈士子女", ["烈士子女", "烈士"]],
  ["脱贫家庭学生", ["原建档立卡", "建档立卡", "脱贫户", "脱贫家庭", "已脱贫"]],
  ["低保家庭学生", ["低保户", "低保家庭", "低保"]],
  ["孤儿", ["孤儿"]],
];

const isNoneSpecialDifficulty = (value: unknown) => {
  const normalized = normalizeText(value);
  return noneSpecialDifficultyTexts.some((item) => normalized === normalizeText(item));
};

const normalizeDifficultyLevelValue = (value: unknown) => {
  const normalized = normalizeText(value).replace(/[.。．]/g, "");
  if (["a", "a家庭经济一般困难", "一般困难", "家庭经济一般困难"].includes(normalized)) {
    return GENERAL_DIFFICULTY_LEVEL;
  }
  if (["c", "c家庭经济特别困难", "特别困难", "家庭经济特别困难"].includes(normalized)) {
    return SPECIAL_DIFFICULTY_LEVEL;
  }
  return "";
};

const isDifficultyLevelField = (field: string) => {
  const normalized = normalizeDifficultyHeader(field);
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

const hasSpecialDifficultyLevel = (row: Record<string, unknown>) =>
  Object.entries(row).some(([field, value]) => (
    isDifficultyLevelField(field) && normalizeDifficultyLevelValue(value) === SPECIAL_DIFFICULTY_LEVEL
  ));

const getDifficultyLevelColumns = (templateFields: string[]) =>
  templateFields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => isDifficultyLevelField(field));

const checkDifficultyLevel = (originalRawValue: unknown): CheckResult => {
  const raw = String(originalRawValue ?? "").trim();
  const fixed = normalizeDifficultyLevelValue(raw);

  if (!fixed) {
    return {
      value: raw,
      valid: false,
      repaired: false,
      reason: DIFFICULTY_LEVEL_ERROR_REASON,
      highlight: true,
      highlightColor: "yellow",
    };
  }

  return {
    value: fixed,
    valid: true,
    repaired: fixed !== raw,
    reason: fixed !== raw ? "推荐档次已规范为允许值" : "推荐档次符合允许值",
    highlight: false,
  };
};

const matchSpecialDifficultyType = (value: unknown) => {
  const normalized = normalizeText(value);
  if (!normalized) return "无";

  const exact = specialDifficultyList.find((item) => normalizeText(item) === normalized);
  if (exact) return exact;

  if (isNoneSpecialDifficulty(value)) return "无";

  return specialDifficultyKeywordMap.find(([, keywords]) =>
    keywords.some((keyword) => normalized.includes(normalizeText(keyword)))
  )?.[0] || "";
};

export const normalizeSpecialDifficultyType = (value: unknown) => {
  return matchSpecialDifficultyType(value);
};

const checkSpecialDifficultyType = (
  originalRawValue: unknown,
  row: Record<string, unknown>
): CheckResult => {
  const raw = String(originalRawValue ?? "").trim();
  const fixed = normalizeSpecialDifficultyType(originalRawValue);

  if (!fixed) {
    return {
      value: raw,
      valid: false,
      repaired: false,
      reason: `特殊困难类型必须为：${specialDifficultyList.join("、")}`,
      highlight: true,
      highlightColor: "yellow",
    };
  }

  return {
    value: fixed,
    valid: true,
    repaired: fixed !== raw && !(hasSpecialDifficultyLevel(row) && isNoneSpecialDifficulty(raw)),
    reason: fixed !== raw ? "特殊困难类型已按字段值标准化" : "特殊困难类型符合允许值",
    highlight: false,
  };
};

type PopulationColumn = {
  templateField: string;
  templateIndex: number;
  sourceIndex: number;
};

type DeferredRepairResult = {
  field: string;
  colIndex: number;
  originalValue: unknown;
  value: unknown;
  repaired: boolean;
  valid: boolean;
  reason: string;
};

const inferAssociatedFamilyMemberCount = (headers: string[], sourceRow: unknown[]) => {
  const explicitIndex = headers.findIndex((header) => {
    const normalized = normalizeDifficultyHeader(header);
    return ["家庭成员人数", "关联家庭成员人数", "家庭成员数量"].includes(normalized);
  });
  if (explicitIndex >= 0) return parsePopulationValue(sourceRow[explicitIndex]);

  const memberNameIndexes = headers
    .map((header, index) => ({ index, normalized: normalizeDifficultyHeader(header) }))
    .filter(({ normalized }) => /家庭成员\d*(?:姓名)?$/.test(normalized))
    .map(({ index }) => index);
  if (memberNameIndexes.length === 0) return null;

  return memberNameIndexes.filter((index) => String(sourceRow[index] ?? "").trim() !== "").length;
};

const repairPopulationValues = (
  sourceRow: unknown[],
  headers: string[],
  columns: {
    family?: PopulationColumn;
    labor?: PopulationColumn;
    dependent?: PopulationColumn;
  }
): DeferredRepairResult[] => {
  const available = (column?: PopulationColumn) => Boolean(column && column.sourceIndex >= 0);
  const read = (column?: PopulationColumn) => available(column) ? sourceRow[column!.sourceIndex] : "";
  const familyRaw = read(columns.family);
  const laborRaw = read(columns.labor);
  const dependentRaw = read(columns.dependent);

  let family = available(columns.family) ? parsePopulationValue(familyRaw) : null;
  let labor = available(columns.labor) ? parsePopulationValue(laborRaw) : null;
  let dependent = available(columns.dependent) ? parsePopulationValue(dependentRaw) : null;
  const laborInvalid = available(columns.labor) && labor === null && !isPopulationEmptyLike(laborRaw);
  const dependentInvalid =
    available(columns.dependent) && dependent === null && !isPopulationEmptyLike(dependentRaw);

  if (available(columns.labor) && labor === null && !laborInvalid) labor = 0;
  if (available(columns.dependent) && dependent === null && !dependentInvalid) dependent = 0;

  if (available(columns.family) && (family === null || family < 1)) {
    const associatedCount = inferAssociatedFamilyMemberCount(headers, sourceRow);
    family = Math.max(1, labor ?? 0, dependent ?? 0, associatedCount === null ? 0 : associatedCount + 1);
  }

  if (labor !== null && dependent !== null && labor < dependent) labor = dependent;
  if (family !== null && labor !== null && family < labor) family = labor;
  if (family !== null && dependent !== null && family < dependent) family = dependent;

  const makeResult = (
    column: PopulationColumn | undefined,
    originalValue: unknown,
    value: number | null,
    valid: boolean,
    invalidReason: string
  ): DeferredRepairResult | null => {
    if (!column || column.sourceIndex < 0) return null;
    if (!valid || value === null) {
      return {
        field: column.templateField,
        colIndex: column.templateIndex,
        originalValue,
        value: originalValue,
        repaired: false,
        valid: false,
        reason: invalidReason,
      };
    }

    const fixed = String(value);
    return {
      field: column.templateField,
      colIndex: column.templateIndex,
      originalValue,
      value: fixed,
      repaired: fixed !== String(originalValue ?? "").trim(),
      valid: true,
      reason: `${normalizeDifficultyHeader(column.templateField)}已按人口关系规则自动修复`,
    };
  };

  return [
    makeResult(columns.family, familyRaw, family, true, ""),
    makeResult(
      columns.labor,
      laborRaw,
      labor,
      !laborInvalid,
      "劳动力人口数完全无法判断，不能在缺少依据时自动生成"
    ),
    makeResult(
      columns.dependent,
      dependentRaw,
      dependent,
      !dependentInvalid,
      "赡养人口数完全无法判断，不能在缺少依据时自动生成"
    ),
  ].filter((item): item is DeferredRepairResult => item !== null);
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
  const normalizedField = normalizeDifficultyHeader(field);

  if (normalizedField === "姓名") return checkStudentName(originalRawValue);

  if (POPULATION_FIELDS.has(normalizedField)) {
    return {
      value,
      valid: true,
      repaired: false,
      reason: "人口字段将在行级规则中统一修复",
      highlight: false,
    };
  }

  if (isDifficultyLevelField(field)) return checkDifficultyLevel(originalRawValue);

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
  const specialTypeIndex = templateFields.findIndex((field) => normalizeDifficultyHeader(field) === "特殊困难类型");
  const specialTypeField = specialTypeIndex >= 0 ? templateFields[specialTypeIndex] : "";
  const difficultyLevelColumns = getDifficultyLevelColumns(templateFields);

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

    const columnsToMark = [
      ...(specialTypeIndex >= 0 ? [specialTypeIndex] : []),
      ...cLevelColumns.map(({ index }) => index),
    ];

    columnsToMark.forEach((colIndex) => {
      const key = `${rowIndex}_${colIndex}`;
      if (!highlightMap[key]) marked++;
      addMark(highlightMap, rowIndex, colIndex, "yellow", SPECIAL_TYPE_REQUIRED_FOR_C_REASON);
    });

    if (specialTypeField) {
      fieldErrors[specialTypeField] = (fieldErrors[specialTypeField] || 0) + 1;
      addErrorReport(
        errorReports,
        rowIndex,
        specialTypeField,
        specialTypeValue,
        specialTypeValue,
        "人工核实",
        `${SPECIAL_TYPE_REQUIRED_FOR_C_REASON} ${SPECIAL_TYPE_REQUIRED_FOR_C_SUGGESTION}`
      );
    }
    cLevelColumns.forEach(({ field, index }) => {
      fieldErrors[field] = (fieldErrors[field] || 0) + 1;
      addErrorReport(
        errorReports,
        rowIndex,
        field,
        row[field],
        row[field],
        "人工核实",
        SPECIAL_TYPE_REQUIRED_FOR_C_REASON
      );
      const key = `${rowIndex}_${index}`;
      if (!highlightMap[key]) {
        marked++;
        addMark(highlightMap, rowIndex, index, "yellow", SPECIAL_TYPE_REQUIRED_FOR_C_REASON);
      }
    });
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
      if (highlightMap[key]) return;
      marked++;
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
  collegeName: resolvedCollegeName,
  onLog,
  onProgress,
}: StudentProcessorInput): Promise<StudentProcessorResult> => {
  const headerIndex = findHeaderRowIndex(sourceRows, templateFields);
  const headers = (sourceRows[headerIndex] || []).map((item) => String(item ?? "").trim());
  const sourceDataRows = sourceRows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));

  const { columnMap, removedHeaders } = buildColumnMap(
    headers,
    templateFields,
    STRICT_AUTO_REPAIR_FIELDS
  );
  const populationColumns = {
    family: columnMap.find((item) => normalizeDifficultyHeader(item.templateField) === "家庭人口数"),
    labor: columnMap.find((item) => normalizeDifficultyHeader(item.templateField) === "劳动力人口数"),
    dependent: columnMap.find((item) => normalizeDifficultyHeader(item.templateField) === "赡养人口数"),
  };
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
    const sourceRowContext: Record<string, unknown> = {};

    headers.forEach((header, index) => {
      if (header) sourceRowContext[header] = sourceRow[index] ?? "";
    });
    columnMap.forEach((item) => {
      if (item.sourceIndex >= 0) {
        sourceRowContext[item.templateField] = sourceRow[item.sourceIndex] ?? "";
      }
    });

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
      const normalizedField = normalizeDifficultyHeader(field);
      const checked: CheckResult = normalizedField === "特殊困难类型"
        ? checkSpecialDifficultyType(originalValue, sourceRowContext)
        : checkAndFixCellByColumnRule(
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
        const logMessage = normalizedField === "特殊困难类型"
          ? `第 ${i + 1} 行：特殊困难类型“${displayOriginalValue(originalValue)}”已自动标准化为“${checked.value}”`
          : isDifficultyLevelField(field)
          ? `第 ${i + 1} 行：${normalizeDifficultyHeader(field)}“${displayOriginalValue(originalValue)}”已自动规范为“${checked.value}”`
          : normalizedField === "姓名"
          ? `第 ${i + 1} 行：姓名“${displayOriginalValue(originalValue)}”已自动清洗为“${checked.value}”`
          : `第 ${i + 1} 行 第 ${colIndex + 1} 列 ${field}
原值：${String(originalValue ?? "").trim()}
修复后：${checked.value}
依据：${checked.reason}`;
        onLog?.({
          type: "success",
          message: logMessage,
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

    const populationResults = repairPopulationValues(
      sourceRow,
      headers,
      populationColumns
    );
    populationResults.forEach((populationResult) => {
      outputRow[populationResult.field] = populationResult.value;

      if (populationResult.repaired) {
        repairedCount++;
        addErrorReport(
          errorReports,
          i,
          populationResult.field,
          populationResult.originalValue,
          populationResult.value,
          "自动修复",
          populationResult.reason
        );
        onLog?.({
          type: "success",
          message: `第 ${i + 1} 行：${normalizeDifficultyHeader(populationResult.field)}“${displayOriginalValue(
            populationResult.originalValue
          )}”已自动修复为 ${populationResult.value}`,
        });
      }

      if (!populationResult.valid) {
        errorCount++;
        fieldErrors[populationResult.field] = (fieldErrors[populationResult.field] || 0) + 1;
        addMark(
          highlightMap,
          i,
          populationResult.colIndex,
          "yellow",
          populationResult.reason
        );
        addErrorReport(
          errorReports,
          i,
          populationResult.field,
          populationResult.originalValue,
          populationResult.value,
          "数据格式错误",
          populationResult.reason
        );
        addErrorReport(
          errorReports,
          i,
          populationResult.field,
          populationResult.originalValue,
          populationResult.value,
          "标黄",
          populationResult.reason
        );
        onLog?.({
          type: "error",
          message: `第 ${i + 1} 行：${populationResult.reason}`,
        });
      }
    });

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
  const finalFailRowNumbers = new Set(finalFailRows.map((item) => item.rowNumber));
  const studentIdFieldIndex = templateFields.findIndex((field) => cleanFieldName(field).includes("学号"));
  const studentIdField = studentIdFieldIndex >= 0 ? templateFields[studentIdFieldIndex] : "";
  const duplicateSeen = new Map<string, number>();
  let duplicateCount = 0;

  result.forEach((row, index) => {
    const collegeName = String(row[templateFields[1]] ?? "").trim() || "未填学院";
    const studentId = studentIdField ? String(row[studentIdField] ?? "").trim() : "";
    const idCard = String(row[templateFields[2]] ?? "").trim();

    if (!studentId && !idCard) {
      duplicateCount += 1;
      errorReports.push({
        rowIndex: index + 1,
        fieldName: "学号/身份证号",
        originalValue: "",
        fixedValue: "",
        issueType: "严重错误",
        action: "学号和身份证号都为空，禁止上传到学校端",
      });
      if (studentIdFieldIndex >= 0) addMark(highlightMap, index, studentIdFieldIndex, "yellow", "学号和身份证号都为空，禁止上传到学校端");
      addMark(highlightMap, index, 2, "yellow", "学号和身份证号都为空，禁止上传到学校端");
      if (!finalFailRowNumbers.has(index + 1)) {
        finalFailRows.push({
          rowNumber: index + 1,
          name: String(row[templateFields[0]] ?? ""),
          idCard,
          income: String(row[templateFields[11]] ?? ""),
          reason: "学号和身份证号都为空，禁止上传到学校端",
        });
        finalFailRowNumbers.add(index + 1);
      }
      return;
    }

    const key = makeStudentKey(collegeName, studentId, idCard);
    if (!key) return;
    if (!duplicateSeen.has(key)) {
      duplicateSeen.set(key, index + 1);
      return;
    }

    duplicateCount += 1;
    const duplicateReason = studentId ? "同一学院内学号重复" : "同一学院内身份证号重复";
    errorReports.push({
      rowIndex: index + 1,
      fieldName: studentId ? "学号" : "身份证号",
      originalValue: studentId || idCard,
      fixedValue: studentId || idCard,
      issueType: "严重错误",
      action: duplicateReason,
    });
    addMark(
      highlightMap,
      index,
      studentId ? studentIdFieldIndex : 2,
      "yellow",
      duplicateReason
    );
    if (!finalFailRowNumbers.has(index + 1)) {
      finalFailRows.push({
        rowNumber: index + 1,
        name: String(row[templateFields[0]] ?? ""),
        idCard,
        income: String(row[templateFields[11]] ?? ""),
        reason: duplicateReason,
      });
      finalFailRowNumbers.add(index + 1);
    }
  });

  const adjustedErrorCount = errorCount + duplicateCount;
  const stats = makeStats(
    sourceDataRows.length,
    repairedCount,
    adjustedErrorCount,
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
异常问题：${adjustedErrorCount}
标记单元格：${Object.keys(highlightMap).length}
不通过人数：${finalFailRows.length}`,
  });

  const hasBlockingErrors = stats.errors > 0 || finalFailRows.length > 0;
  if (hasBlockingErrors) {
    onLog?.({
      type: "error",
      message: "上传失败，当前数据仍存在不通过项，请查看“不通过预览”",
    });
  } else {
    try {
      const cloudRows: StudentCloudRow[] = result.map((row) => ({
        college_name: resolvedCollegeName || String(row[templateFields[1]] ?? "").trim() || "未填学院",
        student_id: studentIdField ? String(row[studentIdField] ?? "").trim() : "",
        name: String(row[templateFields[0]] ?? "").trim(),
        id_card: String(row[templateFields[2]] ?? "").trim(),
        difficulty_level: String(row[templateFields[11]] ?? "").trim(),
        status: "pending_review",
      }));

      const collegeName = cloudRows[0]?.college_name || "未填学院";
      const { data: existingRows, error: fetchError } = await supabase
        .from("students")
        .select("id,college_name,student_id,id_card")
        .eq("college_name", collegeName);
      if (fetchError) throw fetchError;

      const existingByStudentId = new Map<string, number>();
      const existingByIdCard = new Map<string, number>();
      (existingRows || []).forEach((item: { id: number; student_id: string | null; id_card: string | null }) => {
        const sid = String(item.student_id ?? "").trim();
        const cid = String(item.id_card ?? "").trim();
        if (sid) existingByStudentId.set(sid, item.id);
        if (cid) existingByIdCard.set(cid, item.id);
      });

      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      let failed = 0;

      for (const row of cloudRows) {
        const sid = row.student_id.trim();
        const cid = row.id_card.trim();
        if (!sid && !cid) {
          skipped += 1;
          continue;
        }

        const existingId = sid ? existingByStudentId.get(sid) : existingByIdCard.get(cid);
        if (existingId) {
          const { error: updateError } = await supabase
            .from("students")
            .update({
              college_name: row.college_name,
              student_id: row.student_id,
              name: row.name,
              id_card: row.id_card,
              difficulty_level: row.difficulty_level,
              status: row.status,
            })
            .eq("id", existingId);
          if (updateError) {
            failed += 1;
          } else {
            updated += 1;
          }
          continue;
        }

        const { error: insertError } = await supabase.from("students").insert(row);
        if (insertError) {
          failed += 1;
        } else {
          inserted += 1;
        }
      }

      onLog?.({
        type: "success",
        message: `云端同步完成：新增 ${inserted} 条，更新 ${updated} 条，跳过 ${skipped} 条，失败 ${failed} 条`,
      });
    } catch (error) {
      const e = error as {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      };
      console.error("Supabase cloud sync failed:", e);
      console.error("Supabase error message:", e?.message);
      console.error("Supabase error details:", e?.details);
      console.error("Supabase error hint:", e?.hint);
      console.error("Supabase error code:", e?.code);
      onLog?.({
        type: "error",
        message: `云端同步失败：${e?.message || JSON.stringify(e)}；details=${e?.details || ""}；hint=${e?.hint || ""}；code=${e?.code || ""}`,
      });
    }
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

const getIssueSuggestion = (reason: string) =>
  reason.includes(SPECIAL_TYPE_REQUIRED_FOR_C_REASON)
    ? SPECIAL_TYPE_REQUIRED_FOR_C_SUGGESTION
    : "请按错误原因核对并修改该字段";

export const exportStudentExcel = ({
  processedData,
  templateWorkbook,
  templateOutputSheet,
  templateDictSheet,
  templateFields,
  templateFirstRow,
  highlightCellMap,
  disqualifiedRows,
  exportMode = "all",
}: {
  processedData: Record<string, unknown>[];
  templateWorkbook: WorkbookData;
  templateOutputSheet: string;
  templateDictSheet: string;
  templateFields: string[];
  templateFirstRow: unknown[];
  highlightCellMap: Record<string, HighlightInfo>;
  disqualifiedRows: DisqualifiedRow[];
  exportMode?: "all" | "passed" | "failed";
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
  if (exportMode === "all") {
    XLSX.utils.book_append_sheet(workbook, worksheet, templateOutputSheet || "治理结果");
  }

  if (exportMode === "all" && templateDictSheet && templateWorkbook.worksheets[templateDictSheet]) {
    XLSX.utils.book_append_sheet(workbook, cloneWorksheet(templateWorkbook.worksheets[templateDictSheet]), templateDictSheet);
  }

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

  const failRowNumberSet = new Set(disqualifiedRows.map((item) => item.rowNumber));
  const passedRows = processedData.filter((_, index) => !failRowNumberSet.has(index + 1));
  const passedSheet = XLSX.utils.json_to_sheet(passedRows, { header: templateFields });
  passedSheet["!cols"] = templateFields.map(() => ({ wch: 18 }));
  if (exportMode !== "failed") XLSX.utils.book_append_sheet(workbook, passedSheet, "通过名单");

  const studentIdFieldIndex = templateFields.findIndex((field) => cleanFieldName(field).includes("学号"));
  const studentIdField = studentIdFieldIndex >= 0 ? templateFields[studentIdFieldIndex] : "";
  const failIssueRows = issueEntries
    .filter(({ rowIndex }) => failRowNumberSet.has(rowIndex + 1))
    .map(({ rowIndex, colIndex, info }) => {
    const row = processedData[rowIndex] || {};
    const fieldName = templateFields[colIndex] || `第${colIndex + 1}列`;
    return [
      rowIndex + 1,
      String(row[templateFields[1]] ?? ""),
      String(row[templateFields[0]] ?? ""),
      studentIdField ? String(row[studentIdField] ?? "") : "",
      String(row[templateFields[2]] ?? ""),
      fieldName,
      String(row[fieldName] ?? ""),
      info.reason,
      info.color === "red" ? "error" : "warning",
      getIssueSuggestion(info.reason),
    ];
  });

  const noIssueFailRows = disqualifiedRows
    .filter((item) => !failIssueRows.some((row) => Number(row[0]) === item.rowNumber))
    .map((item) => {
      const row = processedData[item.rowNumber - 1] || {};
      return [
        item.rowNumber,
        String(row[templateFields[1]] ?? ""),
        String(item.name ?? ""),
        studentIdField ? String(row[studentIdField] ?? "") : "",
        String(item.idCard ?? ""),
        "",
        "",
        item.reason,
        "error",
        "请核对并补充可用于识别学生的完整信息",
      ];
    });

  const failDataRows = [...failIssueRows, ...noIssueFailRows];
  const failedRows = processedData
    .map((row, rowIndex) => ({ row, rowIndex }))
    .filter(({ rowIndex }) => failRowNumberSet.has(rowIndex + 1));
  const failSheet = XLSX.utils.json_to_sheet(failedRows.map(({ row }) => row), { header: templateFields });
  failSheet["!cols"] = templateFields.map(() => ({ wch: 18 }));
  failedRows.forEach(({ rowIndex }, failIndex) => {
    templateFields.forEach((_, colIndex) => {
      if (!highlightCellMap[`${rowIndex}_${colIndex}`]) return;
      const address = XLSX.utils.encode_cell({ r: failIndex + 1, c: colIndex });
      const cell = (failSheet as Record<string, Record<string, unknown>>)[address] || { v: "", t: "s" };
      (failSheet as Record<string, Record<string, unknown>>)[address] = applyHighlightStyle(cell, {
        color: "yellow",
        reason: highlightCellMap[`${rowIndex}_${colIndex}`].reason,
      });
    });
  });
  if (exportMode !== "passed") XLSX.utils.book_append_sheet(workbook, failSheet, "不通过名单");

  const issueSheetRows =
    failDataRows.length === 0
      ? [["暂无问题"]]
      : [
          ["行号", "学院", "姓名", "学号", "身份证号", "错误字段", "原值", "错误原因", "严重程度", "修改建议"],
          ...failDataRows,
        ];
  const issueSheet = XLSX.utils.aoa_to_sheet(issueSheetRows);
  issueSheet["!cols"] = [
    { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 24 },
    { wch: 18 }, { wch: 20 }, { wch: 60 }, { wch: 12 }, { wch: 42 },
  ];
  if (exportMode !== "passed") XLSX.utils.book_append_sheet(workbook, issueSheet, "问题说明");

  XLSX.writeFile(
    workbook,
    `${exportMode === "passed" ? "本专科通过名单" : exportMode === "failed" ? "本专科不通过名单" : "困难生数据处理结果"}_${Date.now()}.xlsx`
  );

  return { failCount: disqualifiedRows.length };
};
