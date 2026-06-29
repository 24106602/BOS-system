// 本专科困难生处理服务：负责本专科数据规则校验、修复、标记和 Excel 导出。

import * as XLSX from "xlsx-js-style";
import type {
  CheckResult,
  ColumnMapItem,
  DisqualifiedRow,
  ErrorReportItem,
  HighlightInfo,
  ProcessLog,
  ProcessingStats,
  WorkbookData,
} from "./types";
import {
  resolveDifficultyFieldBinding,
  SPECIAL_DIFFICULTY_TYPE_ALIASES,
  type DifficultyStudentCanonicalKey,
  type DifficultyStudentValidatorKey,
} from "../constants/difficultyStudentTemplate";
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
  extractMaxLength,
  fixIncomeSource,
  fixProvince,
  formatIncomeNumber,
  incomeSourceList,
  isRequiredByRule,
  isZeroLikeText,
  normalizeDate as normalizeDateValue,
  normalizeDifficultyLevel as normalizeDifficultyLevelValue,
  normalizeDisabilityType as normalizeDisabilityTypeValue,
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
  "籍贯",
  "身份证号",
  "家庭人口数",
  "手机号码",
  "家庭地址",
  "邮政编码",
  "家长手机号码",
  "劳动力人口数",
  "赡养人口数",
  "特殊困难类型",
  "推荐档次",
  "院系推荐档次",
  "学校推荐档次",
];

const SPECIAL_DIFFICULTY_LEVEL = "C.家庭经济特别困难";
const DIFFICULTY_LEVEL_ERROR_REASON =
  "推荐档次必须选择 A.家庭经济一般困难 或 C.家庭经济特别困难，系统不根据其他信息自动判断困难等级。";
const SPECIAL_TYPE_REQUIRED_FOR_C_REASON =
  "已选择 C.家庭经济特别困难，特殊困难类型不能为空或为‘无’，请人工核实并选择对应特殊群体类型。";
const SPECIAL_TYPE_REQUIRED_FOR_C_SUGGESTION =
  "请根据学生实际情况选择脱贫家庭学生、低保家庭学生、孤儿、残疾学生、其他低收入家庭学生等合法类型；如没有特殊群体依据，请将推荐档次改为 A.家庭经济一般困难。";

export const normalizeDifficultyLevel = normalizeDifficultyLevelValue;
export const normalizeDate = normalizeDateValue;
export const normalizeDisabilityType = normalizeDisabilityTypeValue;

const displayOriginalValue = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text || "空";
};

const toHalfWidthText = (value: unknown) =>
  String(value ?? "")
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, (letter) => String.fromCharCode(letter.charCodeAt(0) - 0xfee0));

const stripInvisibleText = (value: unknown) =>
  toHalfWidthText(value).replace(/[\s\u00a0\u200b-\u200d\u2060\ufeff\u3000]/g, "");

const normalizeGeneralCellText = (value: unknown) =>
  toHalfWidthText(value)
    .replace(/[\s\u00a0\u200b-\u200d\u2060\ufeff\u3000]/g, "")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/，/g, ",")
    .replace(/：/g, ":")
    .replace(/；/g, ";")
    .replace(/！/g, "!")
    .replace(/？/g, "?")
    .trim();

const expandScientificNotation = (value: string) => {
  const text = String(value ?? "").trim();
  const match = text.match(/^([+-]?\d+)(?:\.(\d+))?[eE]\+?(\d+)$/);
  if (!match) return text;

  const sign = match[1].startsWith("-") ? "-" : "";
  const integerPart = match[1].replace(/^[+-]/, "");
  const decimalPart = match[2] || "";
  const exponent = Number(match[3]);
  const digits = `${integerPart}${decimalPart}`;
  const decimalPlaces = decimalPart.length;
  const zeroCount = exponent - decimalPlaces;
  if (zeroCount >= 0) return `${sign}${digits}${"0".repeat(zeroCount)}`;

  const splitIndex = digits.length + zeroCount;
  return `${sign}${digits.slice(0, splitIndex)}.${digits.slice(splitIndex)}`;
};

const normalizeIdCard = (value: unknown) => {
  const raw = toHalfWidthText(value);
  const expanded = expandScientificNotation(raw);
  const fixed = expanded
    .replace(/[：:，,、。.\-—_\s\u00a0\u200b-\u200d\u2060\ufeff\u3000]/g, "")
    .replace(/[^0-9Xx]/g, "")
    .toUpperCase();
  const valid = /^[1-9]\d{16}[\dX]$/.test(fixed);

  return {
    value: fixed,
    valid,
    repaired: fixed !== raw,
    reason: valid
      ? "身份证号已清洗为18位规范格式"
      : `身份证号清洗后必须为18位，目前为 ${fixed.length} 位，请人工核对是否缺位或多位。`,
  };
};

const normalizePhone = (value: unknown) => {
  const raw = toHalfWidthText(value);
  const withoutCountryCode = raw.replace(/^\s*(?:0086|\+?86)[\s()-]*/, "");
  const digits = withoutCountryCode.replace(/\D/g, "");
  const firstMobileMatch = withoutCountryCode.match(/1(?:\D*\d){10}/);
  const trailingText = firstMobileMatch
    ? withoutCountryCode.slice((firstMobileMatch.index || 0) + firstMobileMatch[0].length)
    : "";
  const hasSeparatedFollowingValue = firstMobileMatch && /^\D/.test(trailingText);
  const firstMobile = hasSeparatedFollowingValue ? firstMobileMatch[0].replace(/\D/g, "") : "";
  const fixed = firstMobile || digits;
  const valid = /^\d{11}$/.test(fixed);

  return {
    value: fixed,
    valid,
    repaired: fixed !== raw,
    reason: valid
      ? "手机号码已清洗为11位数字"
      : `手机号码清洗后必须为11位，目前为 ${fixed.length} 位，请人工核对是否缺位或多位。`,
  };
};

const normalizePostcode = (value: unknown) => {
  const raw = toHalfWidthText(value);
  const digits = raw.replace(/\D/g, "");
  const fixed = digits.length === 5 ? digits.padStart(6, "0") : digits;
  const valid = /^\d{6}$/.test(fixed);

  return {
    value: fixed,
    valid,
    repaired: fixed !== raw,
    reason: valid
      ? "邮政编码已清洗为6位数字"
      : `邮政编码清洗后必须为6位，目前为 ${fixed.length} 位，请人工核对是否缺位或多位。`,
  };
};

const normalizeYesNo = (value: unknown, emptyDefault: "是" | "否" = "否") => {
  const source = String(value ?? "");
  const raw = source.trim();
  const normalized = normalizeText(raw)
    .replace(/[✓✔]/g, "√")
    .replace(/[✕✖]/g, "×")
    .replace(/[，,。.!！；;：:、"'“”‘’]/g, "");

  const yesWords = ["是", "有", "有的", "存在", "确认", "同意", "是的", "√", "1", "true", "yes"];
  const noWords = ["否", "无", "没有", "暂无", "不存在", "不是", "无此情况", "×", "0", "false", "no"];

  if (!normalized) {
    return {
      value: emptyDefault,
      valid: true,
      repaired: source !== emptyDefault,
      reason: `是/否字段为空，已自动规范为“${emptyDefault}”`,
    };
  }

  if (yesWords.some((word) => normalized === normalizeText(word))) {
    return { value: "是", valid: true, repaired: source !== "是", reason: "是/否字段已规范为“是”" };
  }
  if (noWords.some((word) => normalized === normalizeText(word))) {
    return { value: "否", valid: true, repaired: source !== "否", reason: "是/否字段已规范为“否”" };
  }

  return { value: raw, valid: false, repaired: false, reason: "该字段只能填写是/否，且当前值无法识别" };
};

const normalizeAgreement = (value: unknown) => {
  const source = String(value ?? "");
  const raw = source.trim();
  const normalized = normalizeText(raw);
  const negative = ["不同意", "不通过", "驳回", "否"].some((word) =>
    word === "否" ? normalized === normalizeText(word) : normalized.includes(normalizeText(word))
  );
  const recognizable =
    !negative &&
    (["同意", "通过", "予以同意"].some((word) => normalized === normalizeText(word)) ||
      normalized.includes(normalizeText("同意")) ||
      normalized.includes(normalizeText("通过")) ||
      raw.length > 0);

  return {
    value: recognizable ? "同意" : raw,
    valid: recognizable,
    repaired: recognizable && source !== "同意",
    reason: recognizable ? "意见/同意字段已规范为“同意”" : "意见字段为空，无法自动生成意见",
  };
};

const normalizeNoneText = (value: unknown) => {
  const raw = String(value ?? "").trim();
  const normalized = normalizeText(raw).replace(/[，,。.!！；;：:、"'“”‘’]/g, "");
  const noneWords = ["", "无", "没有", "暂无", "无此情况", "否", "未发生", "没发生", "无其他情况", "无其它情况"];
  if (noneWords.some((word) => normalized === normalizeText(word))) return "无";
  return normalizeGeneralCellText(raw);
};

const DIFFICULTY_LEVEL_CANONICAL_KEYS = new Set<DifficultyStudentCanonicalKey>([
  "finalRecommendLevel",
  "collegeRecommendLevel",
  "schoolRecommendLevel",
]);

const POPULATION_CANONICAL_KEYS = new Set<DifficultyStudentCanonicalKey>([
  "familyPopulation",
  "laborPopulation",
  "dependentPopulation",
]);

const SITUATION_TEXT_CANONICAL_KEYS = new Set<DifficultyStudentCanonicalKey>([
  "naturalDisasterDescription",
  "unexpectedEventDescription",
  "familyDisabilityWeakLaborSituation",
  "familyUnemploymentSituation",
  "familyDebtReason",
  "otherSituation",
]);

const YES_NO_CANONICAL_KEYS = new Set<DifficultyStudentCanonicalKey>([
  "hasNaturalDisaster",
  "hasUnexpectedEvent",
  "agreesReviewGroup",
  "agreesCollegeWorkingGroup",
  "isWubaoHousehold",
  "isSingleParentChild",
  "parentsLostLaborAbility",
  "hasMajorDiseasePatient",
]);

const getCanonicalKey = (field: string) =>
  resolveDifficultyFieldBinding(field)?.canonicalKey;

const isCanonicalField = (field: string, canonicalKey: DifficultyStudentCanonicalKey) =>
  getCanonicalKey(field) === canonicalKey;

const findCanonicalFieldIndex = (
  fields: string[],
  canonicalKey: DifficultyStudentCanonicalKey
) => fields.findIndex((field) => isCanonicalField(field, canonicalKey));

const FORBIDDEN_VALIDATORS: Partial<
  Record<DifficultyStudentCanonicalKey, readonly DifficultyStudentValidatorKey[]>
> = {
  nativePlace: ["idCard", "phone", "postcode"],
  familyAddress: ["postcode"],
  postcode: ["phone"],
  familyUnemploymentSituation: ["familyDebtAmount"],
  familyDisabilityWeakLaborSituation: ["yesNo"],
};

export const validateFieldBindings = (columnMap: ColumnMapItem[]) => {
  const errors: string[] = [];

  columnMap.forEach((item) => {
    const expected = resolveDifficultyFieldBinding(item.templateField);
    if (!expected) {
      errors.push(`字段绑定异常：${item.templateField} 未建立 canonicalKey，请检查模板映射。`);
      return;
    }
    if (item.canonicalKey !== expected.canonicalKey || item.validatorKey !== expected.validatorKey) {
      errors.push(
        `字段绑定异常：${item.templateField} 被绑定到了 ${item.validatorKey || "未知"} 校验器，请检查模板映射。`
      );
      return;
    }
    if (FORBIDDEN_VALIDATORS[item.canonicalKey]?.includes(item.validatorKey)) {
      errors.push(
        `字段绑定异常：${item.templateField} 被绑定到了 ${item.validatorKey} 校验器，请检查模板映射。`
      );
    }
  });

  return errors;
};

const isPostcodeLike = (value: unknown) => {
  const digits = stripInvisibleText(value).replace(/\D/g, "");
  return /^\d{5,7}$/.test(digits);
};

const isAddressLike = (value: unknown) => {
  const text = stripInvisibleText(value);
  return /[省市区县镇乡村路街道号弄室]/.test(text) && /[\u4e00-\u9fa5]/.test(text) && text.length >= 4;
};

const isProvinceLevelValue = (value: unknown) =>
  /^(北京市|天津市|上海市|重庆市|香港特别行政区|澳门特别行政区|[\u4e00-\u9fa5]+省|[\u4e00-\u9fa5]+自治区)$/.test(
    String(value ?? "")
  );

const checkNativePlace = (originalRawValue: unknown): CheckResult => {
  const source = String(originalRawValue ?? "");
  const raw = source.trim();
  const fixed = fixProvince(raw);
  const valid = isProvinceLevelValue(fixed);

  return {
    value: fixed,
    valid,
    repaired: valid && fixed !== source,
    reason: valid ? "籍贯已归一到省级行政区" : "无法识别为有效省级行政区，请人工核对籍贯。",
    highlight: !valid,
    highlightColor: "yellow",
  };
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

const isDifficultyLevelField = (field: string) => {
  const canonicalKey = getCanonicalKey(field);
  return canonicalKey ? DIFFICULTY_LEVEL_CANONICAL_KEYS.has(canonicalKey) : false;
};

const hasSpecialDifficultyLevel = (row: Record<string, unknown>) =>
  Object.entries(row).some(([field, value]) => (
    isDifficultyLevelField(field) && normalizeDifficultyLevelValue(value) === SPECIAL_DIFFICULTY_LEVEL
  ));

const getDifficultyLevelColumns = (templateFields: string[]) =>
  templateFields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => isDifficultyLevelField(field));

const matchSpecialDifficultyType = (value: unknown) => {
  const normalized = normalizeText(value);
  if (!normalized) return "无";

  const exact = specialDifficultyList.find((item) => normalizeText(item) === normalized);
  if (exact) return exact;

  if (isNoneSpecialDifficulty(value)) return "无";

  const explicitAlias = Object.entries(SPECIAL_DIFFICULTY_TYPE_ALIASES).find(
    ([alias]) => normalizeText(alias) === normalized
  )?.[1];
  if (explicitAlias) return explicitAlias;

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

const DIFFICULTY_LEVEL_CONFLICT_REASON =
  "多个推荐档次字段不一致，请人工确认并统一选择 A.家庭经济一般困难 或 C.家庭经济特别困难。";

const repairDifficultyLevelValues = (
  sourceRow: unknown[],
  columnMap: ColumnMapItem[]
): DeferredRepairResult[] => {
  const columns = columnMap.filter(
    (item) =>
      item.sourceIndex >= 0 &&
      item.canonicalKey !== undefined &&
      DIFFICULTY_LEVEL_CANONICAL_KEYS.has(item.canonicalKey)
  );
  const values = columns.map((column) => {
    const originalValue = sourceRow[column.sourceIndex];
    const raw = String(originalValue ?? "").trim();
    return {
      column,
      originalValue,
      raw,
      normalized: normalizeDifficultyLevelValue(raw),
    };
  });
  const legalValues = Array.from(
    new Set(values.map((item) => item.normalized).filter(Boolean))
  );

  if (legalValues.length > 1) {
    return values.map(({ column, originalValue, normalized, raw }) => ({
      field: column.templateField,
      colIndex: column.templateIndex,
      originalValue,
      value: normalized || raw,
      repaired: Boolean(normalized) && normalized !== String(originalValue ?? ""),
      valid: false,
      reason: DIFFICULTY_LEVEL_CONFLICT_REASON,
    }));
  }

  if (legalValues.length === 0) {
    return values.map(({ column, originalValue, raw }) => ({
      field: column.templateField,
      colIndex: column.templateIndex,
      originalValue,
      value: raw,
      repaired: false,
      valid: false,
      reason: DIFFICULTY_LEVEL_ERROR_REASON,
    }));
  }

  const selectedLevel = legalValues[0];
  return values.map(({ column, originalValue, normalized, raw }) => {
    if (raw && !normalized) {
      return {
        field: column.templateField,
        colIndex: column.templateIndex,
        originalValue,
        value: raw,
        repaired: false,
        valid: false,
        reason: DIFFICULTY_LEVEL_ERROR_REASON,
      };
    }

    return {
      field: column.templateField,
      colIndex: column.templateIndex,
      originalValue,
      value: normalized || selectedLevel,
      repaired: (normalized || selectedLevel) !== String(originalValue ?? ""),
      valid: true,
      reason: normalized
        ? `${column.templateField}已规范为合法推荐档次`
        : `${column.templateField}为空，已按同一行已有推荐档次自动补齐`,
    };
  });
};

const getColumnValidList = (
  canonicalKey: DifficultyStudentCanonicalKey,
  field: string,
  index: number,
  firstRow: unknown[],
  dictionaryMap: Record<string, string[]>,
  fieldDictMap: Record<string, string>
) => {
  if (canonicalKey === "disabilityCategory") return disabilityCategoryList;
  if (canonicalKey === "specialDifficultyType") return specialDifficultyList;
  if (canonicalKey === "incomeSource") return incomeSourceList;

  const ruleText = String(firstRow[index] ?? "");
  const ruleOptions = parseRuleOptions(ruleText);
  const dictType = fieldDictMap[field];
  const dictValues = dictType ? dictionaryMap[dictType] || [] : [];

  return Array.from(new Set([...dictValues, ...ruleOptions].filter(Boolean)));
};

const getDateDay = (value: unknown) => {
  const dateText = normalizeDateValue(value);
  return dateText ? dateText.slice(-2) : "";
};

const mostFrequentApplicationDay = (rows: unknown[][], columnMap: { templateIndex: number; sourceIndex: number }[]) => {
  const dateMapItem = columnMap.find((item) => item.templateIndex === 6);
  if (!dateMapItem || dateMapItem.sourceIndex < 0) return "01";

  const dayCount: Record<string, number> = {};

  rows.forEach((row) => {
    const day = getDateDay(row[dateMapItem.sourceIndex]);

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

const detectAddressPostcodeColumnIssue = (
  rows: unknown[][],
  columnMap: ColumnMapItem[]
) => {
  const addressColumn = columnMap.find((item) => item.canonicalKey === "familyAddress");
  const postcodeColumn = columnMap.find((item) => item.canonicalKey === "postcode");
  if (!addressColumn || !postcodeColumn || addressColumn.sourceIndex < 0 || postcodeColumn.sourceIndex < 0) {
    return false;
  }

  const visibleRows = rows.filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
  if (visibleRows.length === 0) return false;

  const addressLooksPostcode = visibleRows.filter((row) => isPostcodeLike(row[addressColumn.sourceIndex])).length;
  const postcodeLooksAddress = visibleRows.filter((row) => isAddressLike(row[postcodeColumn.sourceIndex])).length;
  const threshold = Math.max(1, Math.ceil(visibleRows.length * 0.5));

  return addressLooksPostcode >= threshold || postcodeLooksAddress >= threshold;
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

const checkSituationText = (
  fieldName: string,
  originalRawValue: unknown,
  maxLength: number
): CheckResult => {
  const source = String(originalRawValue ?? "");
  const normalized = normalizeNoneText(source);
  const fixed = normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;

  return {
    value: fixed,
    valid: true,
    repaired: fixed !== source,
    reason: normalized.length > maxLength
      ? `${fieldName}超过${maxLength}字，已安全截断并保留前${maxLength}字`
      : `${fieldName}已按文本说明规则规范处理`,
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

const checkStatementReasonColumn = (originalRawValue: unknown): CheckResult => {
  const source = String(originalRawValue ?? "");
  const raw = source.trim();
  const normalized = normalizeText(raw).replace(/[，,。.!！；;：:、"'“”‘’]/g, "");

  if (!raw) {
    return {
      value: "",
      valid: false,
      repaired: false,
      reason: "陈述理由需填写学生家庭经济困难情况，不能为空",
      highlight: true,
      highlightColor: "yellow",
    };
  }

  if (["同意", "通过", "予以同意"].some((word) => normalized === normalizeText(word))) {
    return {
      value: raw,
      valid: false,
      repaired: false,
      reason: "陈述理由需填写学生家庭经济困难情况，不能仅填写“同意”。",
      highlight: true,
      highlightColor: "yellow",
    };
  }

  const fixed = compressText(raw, 60);

  return {
    value: fixed,
    valid: true,
    repaired: fixed !== source,
    reason: fixed !== raw ? "陈述理由超过60字，已自动精简" : "陈述理由符合要求",
    highlight: false,
  };
};

const checkDisabilityCategoryAKColumn = (originalRawValue: unknown): CheckResult => {
  const raw = String(originalRawValue ?? "").trim();
  const fixed = normalizeDisabilityTypeValue(raw);
  const valid = disabilityCategoryList.includes(fixed);

  return {
    value: fixed,
    valid,
    repaired: fixed !== raw,
    reason: valid
      ? "AK列残疾类别已按允许字典值处理"
      : `AK列残疾类别只能填写：${disabilityCategoryList.join("、")}`,
    highlight: !valid,
    highlightColor: "yellow",
  };
};

const FIELD_MISPLACEMENT_KEYWORDS = ["家庭", "困难", "收入", "疾病", "生病", "欠债", "经济"];

export const detectFieldMisplacement = (fieldName: string, value: unknown) => {
  const raw = String(value ?? "").trim();
  const compact = stripInvisibleText(raw);
  if (compact.length <= 15 || !FIELD_MISPLACEMENT_KEYWORDS.some((keyword) => compact.includes(keyword))) {
    return "";
  }

  return `疑似字段错位：字段“${fieldName}”应填写“是/否”，当前内容“${raw}”疑似把陈述理由填入了该字段。`;
};

const checkAndFixCellByCanonicalKey = (
  canonicalKey: DifficultyStudentCanonicalKey,
  field: string,
  columnIndex: number,
  originalRawValue: unknown,
  rowContext: Record<string, unknown>,
  targetApplicationDay: string,
  firstRow: unknown[],
  dictionaryMap: Record<string, string[]>,
  fieldDictMap: Record<string, string>
): CheckResult => {
  const ruleText = String(firstRow[columnIndex] ?? "");
  const required = isRequiredField(field, columnIndex, firstRow);
  let value = normalizeGeneralCellText(originalRawValue);

  if (canonicalKey === "name") return checkStudentName(originalRawValue);
  if (POPULATION_CANONICAL_KEYS.has(canonicalKey)) {
    return {
      value,
      valid: true,
      repaired: false,
      reason: "人口字段将在行级规则中统一修复",
      highlight: false,
    };
  }
  if (DIFFICULTY_LEVEL_CANONICAL_KEYS.has(canonicalKey)) {
    return {
      value: String(originalRawValue ?? "").trim(),
      valid: true,
      repaired: false,
      reason: "推荐档次将在同行规则中统一校验和补齐",
      highlight: false,
    };
  }
  if (canonicalKey === "specialDifficultyType") {
    return checkSpecialDifficultyType(originalRawValue, rowContext);
  }
  if (canonicalKey === "studentStatement") return checkStatementReasonColumn(originalRawValue);
  if (canonicalKey === "collegeOpinion" || canonicalKey === "schoolOpinion") {
    const fixed = normalizeAgreement(originalRawValue);
    return {
      value: fixed.value,
      valid: fixed.valid,
      repaired: fixed.repaired,
      reason: fixed.reason,
      highlight: !fixed.valid,
      highlightColor: "yellow",
    };
  }
  if (canonicalKey === "agreesReviewGroup") {
    const misplacementReason = detectFieldMisplacement(field, originalRawValue);
    if (misplacementReason) {
      return {
        value: String(originalRawValue ?? "").trim(),
        valid: false,
        repaired: false,
        reason: misplacementReason,
        highlight: true,
        highlightColor: "yellow",
      };
    }
  }
  if (YES_NO_CANONICAL_KEYS.has(canonicalKey)) {
    const emptyDefault = canonicalKey === "agreesCollegeWorkingGroup" ? "是" : "否";
    const fixed = normalizeYesNo(originalRawValue, emptyDefault);
    return {
      value: fixed.value,
      valid: fixed.valid,
      repaired: fixed.repaired,
      reason: fixed.reason.replace("是/否字段", field),
      highlight: !fixed.valid,
      highlightColor: "yellow",
    };
  }
  if (canonicalKey === "idCard") {
    const fixed = normalizeIdCard(originalRawValue);
    return {
      value: fixed.value,
      valid: fixed.valid,
      repaired: fixed.repaired,
      reason: fixed.reason,
      highlight: !fixed.valid,
      highlightColor: "yellow",
    };
  }
  if (canonicalKey === "phone" || canonicalKey === "parentPhone") {
    const fixed = normalizePhone(originalRawValue);
    return {
      value: fixed.value,
      valid: fixed.valid,
      repaired: fixed.repaired,
      reason: fixed.reason,
      highlight: !fixed.valid,
      highlightColor: "yellow",
    };
  }
  if (canonicalKey === "postcode") {
    const fixed = normalizePostcode(originalRawValue);
    return {
      value: fixed.value,
      valid: fixed.valid,
      repaired: fixed.repaired,
      reason: fixed.reason,
      highlight: !fixed.valid,
      highlightColor: "yellow",
    };
  }
  if (canonicalKey === "nativePlace") return checkNativePlace(originalRawValue);
  if (SITUATION_TEXT_CANONICAL_KEYS.has(canonicalKey)) {
    const maxLength = extractMaxLength(ruleText) || (canonicalKey === "otherSituation" ? 100 : 60);
    return checkSituationText(field, originalRawValue, maxLength);
  }
  if (canonicalKey === "applicationDate") {
    const fixed = fixApplicationDate(targetApplicationDay);
    return {
      value: fixed,
      valid: true,
      repaired: fixed !== String(originalRawValue ?? ""),
      reason: `申请日期已统一为当前年份9月${targetApplicationDay}日`,
      highlight: false,
    };
  }
  if (canonicalKey === "recognitionDate") {
    const fixed = normalizeDateValue(originalRawValue);
    return fixed
      ? {
          value: fixed,
          valid: true,
          repaired: fixed !== String(originalRawValue ?? ""),
          reason: "认定时间已统一为YYYYMMDD格式",
          highlight: false,
        }
      : {
          value,
          valid: false,
          repaired: false,
          reason: "认定时间格式无法解析，请人工核对",
          highlight: true,
          highlightColor: "yellow",
        };
  }
  if (canonicalKey === "familyAddress") {
    const raw = String(originalRawValue ?? "");
    const fixed = toHalfWidthText(raw)
      .replace(/[\s\u00a0\u200b-\u200d\u2060\ufeff\u3000]/g, "")
      .trim();
    return {
      value: fixed,
      valid: Boolean(fixed) || !required,
      repaired: fixed !== raw,
      reason: fixed ? "家庭地址已按地址文本规则处理" : "家庭地址为空，请人工补充",
      highlight: !fixed && required,
      highlightColor: "yellow",
    };
  }
  if (canonicalKey === "familyIncome") return checkFamilyIncomeLColumn(originalRawValue);
  if (canonicalKey === "familyDebtAmount") return checkDebtAmountSColumn(originalRawValue);
  if (canonicalKey === "disabilityCategory") return checkDisabilityCategoryAKColumn(originalRawValue);
  if (canonicalKey === "householdType") {
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
      repaired: finalValue !== String(originalRawValue ?? ""),
      reason: valid ? "户籍性质已按规则统一" : "户籍性质只能填写城镇或农村",
      highlight: !valid,
      highlightColor: "yellow",
    };
  }
  if (canonicalKey === "incomeSource") {
    const fixed = fixIncomeSource(value);
    return {
      value: fixed,
      valid: true,
      repaired: fixed !== String(originalRawValue ?? ""),
      reason: fixed === "其他应当计入家庭的收入" && normalizeText(value) !== normalizeText(fixed)
        ? "收入来源未检索到明确类型，已统一归为其他应当计入家庭的收入"
        : "收入来源已按最接近字典值修正",
      highlight: false,
    };
  }
  if (canonicalKey === "unemployedPopulation") {
    if (isZeroLikeText(value)) {
      return { value: "0", valid: true, repaired: value !== "0", reason: "家庭失业人数已规范为0", highlight: false };
    }
    const number = parseAmountToNumber(value);
    if (number === null || Number.isNaN(number)) {
      return { value, valid: false, repaired: false, reason: "家庭失业人数必须填写数字", highlight: true, highlightColor: "yellow" };
    }
    const fixed = String(Math.floor(number));
    return { value: fixed, valid: true, repaired: fixed !== value, reason: "家庭失业人数已规范为整数", highlight: false };
  }

  if (value === "") {
    return {
      value: "",
      valid: !required,
      repaired: false,
      reason: required ? `${field}为空，请人工补充` : `${field}为空，允许为空`,
      highlight: required,
      highlightColor: "yellow",
    };
  }

  if (SMART_FIX[value]) value = SMART_FIX[value];
  const maxLength = extractMaxLength(ruleText);
  if (maxLength && value.length > maxLength) {
    return {
      value: value.slice(0, maxLength),
      valid: true,
      repaired: true,
      reason: `${field}超过${maxLength}字，已安全截断`,
      highlight: false,
    };
  }

  const validList = getColumnValidList(
    canonicalKey,
    field,
    columnIndex,
    firstRow,
    dictionaryMap,
    fieldDictMap
  );
  if (validList.length > 0) {
    const exact = validList.find((item) => normalizeText(item) === normalizeText(value));
    if (!exact) {
      return {
        value,
        valid: false,
        repaired: false,
        reason: `${field}只能填写：${validList.join("、")}`,
        highlight: true,
        highlightColor: "yellow",
      };
    }
    value = exact;
  }

  return {
    value,
    valid: true,
    repaired: value !== String(originalRawValue ?? ""),
    reason: value !== String(originalRawValue ?? "") ? `${field}已按文本格式规范` : `${field}符合规则`,
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
  const specialTypeIndex = templateFields.findIndex((field) =>
    isCanonicalField(field, "specialDifficultyType")
  );
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

const markAddressPostcodeColumnIssue = (
  result: Record<string, unknown>[],
  highlightMap: Record<string, HighlightInfo>,
  fieldErrors: Record<string, number>,
  templateFields: string[],
  errorReports: ErrorReportItem[]
) => {
  const addressIndex = templateFields.findIndex((field) => isCanonicalField(field, "familyAddress"));
  const postcodeIndex = templateFields.findIndex((field) => isCanonicalField(field, "postcode"));
  if (addressIndex < 0 && postcodeIndex < 0) return 0;

  const reason = "疑似列错位：家庭地址列内容像邮编，或邮政编码列内容像地址，请人工核对表头与列顺序。";
  let rowsMarked = 0;

  result.forEach((row, rowIndex) => {
    const rowLooksMisaligned =
      (addressIndex >= 0 && isPostcodeLike(row[templateFields[addressIndex]])) ||
      (postcodeIndex >= 0 && isAddressLike(row[templateFields[postcodeIndex]]));
    if (!rowLooksMisaligned) return;

    rowsMarked++;
    [addressIndex, postcodeIndex]
      .filter((index) => index >= 0)
      .forEach((colIndex) => {
        const key = `${rowIndex}_${colIndex}`;
        if (!highlightMap[key]) addMark(highlightMap, rowIndex, colIndex, "yellow", reason);
      });
    fieldErrors["家庭地址/邮政编码"] = (fieldErrors["家庭地址/邮政编码"] || 0) + 1;
    addErrorReport(
      errorReports,
      rowIndex,
      "家庭地址/邮政编码",
      [
        addressIndex >= 0 ? row[templateFields[addressIndex]] : "",
        postcodeIndex >= 0 ? row[templateFields[postcodeIndex]] : "",
      ].join(" / "),
      "",
      "疑似列错位",
      reason
    );
  });

  return rowsMarked;
};

const markNamesForRowsWithIssues = (
  result: Record<string, unknown>[],
  highlightMap: Record<string, HighlightInfo>,
  templateFields: string[],
  errorReports: ErrorReportItem[]
) => {
  let marked = 0;
  const nameIndex = findCanonicalFieldIndex(templateFields, "name");
  const safeNameIndex = nameIndex >= 0 ? nameIndex : 0;

  result.forEach((row, rowIndex) => {
    const rowHasIssue = Object.keys(highlightMap).some((key) => key.startsWith(`${rowIndex}_`));
    if (!rowHasIssue) return;
    const key = `${rowIndex}_${safeNameIndex}`;
    const fieldName = templateFields[safeNameIndex] || "姓名";
    const reason = "该学生所在行存在问题，详见不通过名单";
    if (!highlightMap[key]) {
      marked++;
      addErrorReport(errorReports, rowIndex, fieldName, row[fieldName], row[fieldName], "标黄", reason);
    }
    addMark(highlightMap, rowIndex, safeNameIndex, "yellow", reason);
  });

  return marked;
};

const buildFailListFromHighlights = (
  result: Record<string, unknown>[],
  highlightMap: Record<string, HighlightInfo>,
  templateFields: string[]
) => {
  const list: DisqualifiedRow[] = [];
  const nameIndex = findCanonicalFieldIndex(templateFields, "name");
  const nameField = templateFields[nameIndex] || templateFields[0];
  const idCardField = templateFields[findCanonicalFieldIndex(templateFields, "idCard")] || templateFields[2];
  const incomeField = templateFields[findCanonicalFieldIndex(templateFields, "familyIncome")] || templateFields[11];

  result.forEach((row, rowIndex) => {
    const entries = Object.entries(highlightMap)
      .filter(([key]) => key.startsWith(`${rowIndex}_`))
      .filter(([key]) => !Number.isNaN(Number(key.split("_")[1])));

    if (entries.length === 0) return;

    const reasons = entries
      .filter(([key]) => Number(key.split("_")[1]) !== (nameIndex >= 0 ? nameIndex : 0))
      .map(([key, info]) => {
        const colIndex = Number(key.split("_")[1]);
        const fieldName = templateFields[colIndex] || `第${colIndex + 1}列`;
        return `${fieldName}：${info.reason}`;
      });

    list.push({
      rowNumber: rowIndex + 1,
      name: String(row[nameField] ?? ""),
      idCard: String(row[idCardField] ?? ""),
      income: String(row[incomeField] ?? ""),
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
    family: columnMap.find((item) => item.canonicalKey === "familyPopulation"),
    labor: columnMap.find((item) => item.canonicalKey === "laborPopulation"),
    dependent: columnMap.find((item) => item.canonicalKey === "dependentPopulation"),
  };
  const fieldBindingErrors = validateFieldBindings(columnMap);
  const targetApplicationDay = mostFrequentApplicationDay(sourceDataRows, columnMap);
  const addressPostcodeColumnIssue = detectAddressPostcodeColumnIssue(sourceDataRows, columnMap);

  onLog?.({
    type: "info",
    message: `开始执行【困难生数据处理】

本次规则：
AA、AD意见列统一为同意，Y、AB是否同意列规范为是/否；
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

  if (addressPostcodeColumnIssue) {
    onLog?.({
      type: "error",
      message: "检测到家庭地址与邮政编码列疑似错位，已停止对这两列逐格套用格式规则，并转为人工核对问题。",
    });
  }

  if (import.meta.env?.DEV) {
    fieldBindingErrors.forEach((message) => {
      console.error(message);
      onLog?.({ type: "error", message });
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
      const canonicalKey = mapItem.canonicalKey || getCanonicalKey(field);
      const checked: CheckResult = addressPostcodeColumnIssue &&
        (canonicalKey === "familyAddress" || canonicalKey === "postcode")
        ? {
            value: String(originalValue ?? "").trim(),
            valid: true,
            repaired: false,
            reason: "疑似地址与邮编列错位，等待行级人工核对",
            highlight: false,
          }
        : canonicalKey
        ? checkAndFixCellByCanonicalKey(
            canonicalKey,
            field,
            colIndex,
            originalValue,
            sourceRowContext,
            targetApplicationDay,
            templateFirstRow,
            dictionaryMap,
            fieldDictMap
          )
        : {
            value: normalizeGeneralCellText(originalValue),
            valid: true,
            repaired: normalizeGeneralCellText(originalValue) !== String(originalValue ?? ""),
            reason: `${field}未绑定专用校验器，已按普通文本格式处理`,
            highlight: false,
          };

      outputRow[field] = checked.value;

      if (checked.repaired) {
        repairedCount++;
        addErrorReport(errorReports, i, field, originalValue, checked.value, "自动修复", checked.reason);
        const logMessage = canonicalKey === "specialDifficultyType"
          ? `第 ${i + 1} 行：特殊困难类型“${displayOriginalValue(originalValue)}”已自动标准化为“${checked.value}”`
          : canonicalKey !== undefined && DIFFICULTY_LEVEL_CANONICAL_KEYS.has(canonicalKey)
          ? `第 ${i + 1} 行：${normalizeDifficultyHeader(field)}“${displayOriginalValue(originalValue)}”已自动规范为“${checked.value}”`
          : canonicalKey === "name"
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
          checked.reason.startsWith("疑似字段错位")
            ? "疑似字段错位"
            : checked.reason.includes("必填项为空")
            ? "必填缺失"
            : "数据格式错误",
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

    const difficultyLevelResults = repairDifficultyLevelValues(sourceRow, columnMap);
    difficultyLevelResults.forEach((levelResult) => {
      outputRow[levelResult.field] = levelResult.value;

      if (levelResult.repaired) {
        repairedCount++;
        addErrorReport(
          errorReports,
          i,
          levelResult.field,
          levelResult.originalValue,
          levelResult.value,
          "自动修复",
          levelResult.reason
        );
        onLog?.({
          type: "success",
          message: `第 ${i + 1} 行：${levelResult.reason}，修复为“${levelResult.value}”`,
        });
      }

      if (!levelResult.valid) {
        errorCount++;
        fieldErrors[levelResult.field] = (fieldErrors[levelResult.field] || 0) + 1;
        addMark(highlightMap, i, levelResult.colIndex, "yellow", levelResult.reason);
        addErrorReport(
          errorReports,
          i,
          levelResult.field,
          levelResult.originalValue,
          levelResult.value,
          levelResult.reason === DIFFICULTY_LEVEL_CONFLICT_REASON ? "推荐档次冲突" : "数据格式错误",
          levelResult.reason
        );
        onLog?.({ type: "error", message: `第 ${i + 1} 行：${levelResult.field}：${levelResult.reason}` });
      }
    });

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
  const addressPostcodeMarked = addressPostcodeColumnIssue
    ? markAddressPostcodeColumnIssue(result, highlightMap, fieldErrors, templateFields, errorReports)
    : 0;
  const emptyMarked = finalRequiredEmptyCellValidation(result, highlightMap, fieldErrors, templateFields, templateFirstRow, errorReports);
  markNamesForRowsWithIssues(result, highlightMap, templateFields, errorReports);
  errorCount += crossMarked + addressPostcodeMarked + emptyMarked;

  const finalFailRows = buildFailListFromHighlights(result, highlightMap, templateFields);
  const finalFailRowNumbers = new Set(finalFailRows.map((item) => item.rowNumber));
  const nameFieldIndex = findCanonicalFieldIndex(templateFields, "name");
  const idCardFieldIndex = findCanonicalFieldIndex(templateFields, "idCard");
  const incomeFieldIndex = findCanonicalFieldIndex(templateFields, "familyIncome");
  const nameField = nameFieldIndex >= 0 ? templateFields[nameFieldIndex] : templateFields[0];
  const idCardField = idCardFieldIndex >= 0 ? templateFields[idCardFieldIndex] : templateFields[2];
  const incomeField = incomeFieldIndex >= 0 ? templateFields[incomeFieldIndex] : templateFields[11];
  const studentIdFieldIndex = templateFields.findIndex((field) => cleanFieldName(field).includes("学号"));
  const studentIdField = studentIdFieldIndex >= 0 ? templateFields[studentIdFieldIndex] : "";
  const duplicateSeen = new Map<string, number>();
  let duplicateCount = 0;

  result.forEach((row, index) => {
    const collegeName = String(resolvedCollegeName ?? "").trim() || "未填学院";
    const studentId = studentIdField ? String(row[studentIdField] ?? "").trim() : "";
    const idCard = String(row[idCardField] ?? "").trim();

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
      if (idCardFieldIndex >= 0) {
        addMark(highlightMap, index, idCardFieldIndex, "yellow", "学号和身份证号都为空，禁止上传到学校端");
      }
      if (!finalFailRowNumbers.has(index + 1)) {
        finalFailRows.push({
          rowNumber: index + 1,
          name: String(row[nameField] ?? ""),
          idCard,
          income: String(row[incomeField] ?? ""),
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
      studentId ? studentIdFieldIndex : idCardFieldIndex,
      "yellow",
      duplicateReason
    );
    if (!finalFailRowNumbers.has(index + 1)) {
      finalFailRows.push({
        rowNumber: index + 1,
        name: String(row[nameField] ?? ""),
        idCard,
        income: String(row[incomeField] ?? ""),
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
  const canonicalKey = getCanonicalKey(field);
  const ruleText = String(firstRow[columnIndex] ?? "");
  if (
    canonicalKey === "idCard" ||
    canonicalKey === "phone" ||
    canonicalKey === "parentPhone" ||
    canonicalKey === "postcode"
  ) {
    return false;
  }
  return canonicalKey === "familyPopulation" ||
    canonicalKey === "laborPopulation" ||
    canonicalKey === "dependentPopulation" ||
    canonicalKey === "unemployedPopulation" ||
    canonicalKey === "familyIncome" ||
    canonicalKey === "familyDebtAmount" ||
    (!canonicalKey && shouldBeNumber(field, ruleText));
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
