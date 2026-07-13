import * as XLSX from "xlsx-js-style";
import { applyHighlightStyle, cloneWorksheet } from "./excelExport";
import type { WorkbookData } from "./types";
import { parseTemplateRules } from "./templateRuleParser";
import { awardTypeLabels } from "./awardConfig";
import {
  createAwardFieldResolver,
  getMissingAwardFields,
  normalizeHeaderName,
  type AwardFieldResolver,
  type AwardStandardField,
} from "./awardFieldResolver";
import { normalizeSubmissionCollegeName } from "../utils/collegeDetector";
import {
  getAwardSubmissions as getAwardSubmissionsDb,
  getAllAwardSubmissions as getAllAwardSubmissionsDb,
  saveAwardSubmission as saveAwardSubmissionDb,
} from "../db/localAwardDb";
import type {
  AwardDateFormat,
  AwardFieldRule,
  AwardIssue,
  AwardProcessResult,
  AwardProcessedRow,
  AwardRepairLog,
  AwardAdminRecord,
  AwardSubmission,
  AwardTemplate,
  AwardType,
} from "../types/award";

const ZERO_LIKE_VALUES = new Set(["无", "否", "没有", "空"]);
const NEGATIVE_VALUES = new Set(["否", "没有", "无", "否定", "不是", "不存在", "未"]);
const POSITIVE_VALUES = new Set(["是", "有", "肯定", "存在", "确认"]);

type CellIssue = {
  reason: string;
  suggestion: string;
};

type CellResult = {
  value: unknown;
  repairs: string[];
  issues: CellIssue[];
};

const toText = (value: unknown) => String(value ?? "").trim();

const normalizeFullWidthSymbols = (value: string) =>
  value
    .replace(/\u3000/g, " ")
    .replace(/[\uFF01-\uFF5E]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[【]/g, "[")
    .replace(/[】]/g, "]");

const normalizeBasicValue = (value: unknown) => {
  if (value instanceof Date) return value;
  return normalizeFullWidthSymbols(String(value ?? "")).trim();
};

const valuesEqual = (left: unknown, right: unknown) => String(left ?? "") === String(right ?? "");

const isBlank = (value: unknown) => String(value ?? "").trim() === "";

const makeIssue = (reason: string, suggestion: string): CellIssue => ({ reason, suggestion });

const isValidDate = (year: number, month: number, day: number) => {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

const parseDateParts = (rawValue: unknown): [number, number, number] | null => {
  if (rawValue instanceof Date && !Number.isNaN(rawValue.getTime())) {
    return [rawValue.getFullYear(), rawValue.getMonth() + 1, rawValue.getDate()];
  }

  if (typeof rawValue === "number" && rawValue > 0 && rawValue < 100000) {
    const parsed = XLSX.SSF.parse_date_code(rawValue);
    if (parsed && isValidDate(parsed.y, parsed.m, parsed.d)) return [parsed.y, parsed.m, parsed.d];
  }

  const text = normalizeFullWidthSymbols(String(rawValue ?? "")).trim();
  if (!text) return null;

  const separated = text.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D*$/);
  if (separated) {
    const year = Number(separated[1]);
    const month = Number(separated[2]);
    const day = Number(separated[3]);
    return isValidDate(year, month, day) ? [year, month, day] : null;
  }

  if (/^\d{5}$/.test(text)) {
    const parsed = XLSX.SSF.parse_date_code(Number(text));
    if (parsed && isValidDate(parsed.y, parsed.m, parsed.d)) return [parsed.y, parsed.m, parsed.d];
  }

  const digits = text.replace(/\D/g, "");
  if (digits.length !== 8) return null;

  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  return isValidDate(year, month, day) ? [year, month, day] : null;
};

const formatDate = ([year, month, day]: [number, number, number], format: AwardDateFormat) => {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  if (format === "YYYY-MM-DD") return `${year}-${mm}-${dd}`;
  if (format === "YYYY/MM/DD") return `${year}/${mm}/${dd}`;
  return `${year}${mm}${dd}`;
};

const isValidIdCard = (value: string) => {
  if (/^\d{15}$/.test(value)) return true;
  if (!/^\d{17}[\dX]$/.test(value)) return false;

  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checks = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];
  const sum = weights.reduce((total, weight, index) => total + Number(value[index]) * weight, 0);
  return checks[sum % 11] === value[17];
};

const isValidStudentId = (value: string) => /^[A-Za-z0-9_-]{4,30}$/.test(value);

const normalizeComparable = (value: unknown) => normalizeFullWidthSymbols(String(value ?? "")).trim().toLowerCase();

const checkCell = (rule: AwardFieldRule, originalValue: unknown): CellResult => {
  const repairs: string[] = [];
  const issues: CellIssue[] = [];
  let value: unknown = normalizeBasicValue(originalValue);

  if (!valuesEqual(value, originalValue)) repairs.push("已去除首尾空格并规范全角符号");

  if (isBlank(value)) {
    if (rule.required) issues.push(makeIssue("必填字段为空", "请补充该字段后重新处理"));
    return { value: "", repairs, issues };
  }

  if (rule.kind === "number") {
    const text = toText(value);
    if (ZERO_LIKE_VALUES.has(text)) {
      value = 0;
      repairs.push("数字字段中的空值含义已统一为 0");
    } else {
      const numberText = text.replace(/[,\s￥¥元]/g, "");
      if (!/^-?\d+(?:\.\d+)?$/.test(numberText)) {
        issues.push(makeIssue("数字字段无法解析为数字", "请填写有效数字"));
      } else {
        const parsed = Number(numberText);
        value = parsed;
        if (text !== String(parsed)) repairs.push("数字字段已规范为标准数字格式");
      }
    }
  }

  if (rule.kind === "yesNo") {
    const text = toText(value);
    if (NEGATIVE_VALUES.has(text)) {
      value = "否";
      if (text !== "否") repairs.push("是否字段中的否定含义已统一为“否”");
    } else if (POSITIVE_VALUES.has(text)) {
      value = "是";
      if (text !== "是") repairs.push("是否字段中的肯定含义已统一为“是”");
    } else {
      issues.push(makeIssue("是否字段只能填写“是”或“否”", "请将该字段修改为“是”或“否”"));
    }
  }

  if (rule.kind === "date") {
    const parts = parseDateParts(value);
    if (!parts) {
      issues.push(makeIssue("日期字段无法识别或日期不合法", `请按 ${rule.dateFormat || "YYYYMMDD"} 格式填写有效日期`));
    } else {
      const formatted = formatDate(parts, rule.dateFormat || "YYYYMMDD");
      if (!valuesEqual(formatted, value)) repairs.push(`日期字段已统一为 ${rule.dateFormat || "YYYYMMDD"} 格式`);
      value = formatted;
    }
  }

  if (rule.kind === "idCard") {
    const text = toText(value).toUpperCase();
    if (!isValidIdCard(text)) {
      issues.push(makeIssue("身份证号明显不合法", "请核对身份证号位数和校验位"));
    } else {
      if (!valuesEqual(text, value)) repairs.push("身份证号中的字母已规范为大写");
      value = text;
    }
  }

  if (rule.kind === "studentId") {
    const text = toText(value);
    if (!isValidStudentId(text)) {
      issues.push(makeIssue("学号明显不合法", "请填写 4 至 30 位字母、数字、下划线或短横线"));
    }
  }

  if (rule.kind === "enum") {
    const matched = (rule.enumValues || []).find(
      (item) => normalizeComparable(item) === normalizeComparable(value)
    );
    if (!matched) {
      issues.push(
        makeIssue(
          `枚举字段不在允许范围内：${(rule.enumValues || []).join("、")}`,
          `请从允许值中选择：${(rule.enumValues || []).join("、")}`
        )
      );
    } else {
      if (!valuesEqual(matched, value)) repairs.push("枚举字段已规范为模板中的标准值");
      value = matched;
    }
  }

  if (rule.maxLength && String(value ?? "").length > rule.maxLength) {
    issues.push(
      makeIssue(
        `字段字数超过模板限制（最多 ${rule.maxLength} 字）`,
        "请人工精简内容，系统不会自动截断信息"
      )
    );
  }

  return { value, repairs, issues };
};

type AwardBusinessContext = {
  fields: string[];
  sourceRow: unknown[];
  sourceRowIndex: number;
  excelRowNumber: number;
  values: Record<string, unknown>;
  issues: AwardIssue[];
  logs: AwardRepairLog[];
  resolver: AwardFieldResolver;
  courseConsistencyMap: Map<string, { courseCount: number; passedCourseCount: number; rowNumber: number }>;
  majorSkipLogged: { value: boolean };
};

const getBusinessField = (context: AwardBusinessContext, columnIndex: number) =>
  context.fields[columnIndex] || `第${columnIndex + 1}列`;

const hasBusinessIssue = (context: AwardBusinessContext, columnIndex: number) =>
  context.issues.some((issue) => issue.columnIndex === columnIndex);

const getFieldColumn = (context: AwardBusinessContext, field: AwardStandardField) =>
  context.resolver.getFieldColumn(field);

const getBusinessValue = (context: AwardBusinessContext, field: AwardStandardField) => {
  const columnIndex = getFieldColumn(context, field);
  if (columnIndex === null) return "";
  return context.values[getBusinessField(context, columnIndex)];
};

const addBusinessIssueByColumn = (
  context: AwardBusinessContext,
  columnIndex: number,
  field: string,
  reason: string,
  suggestion: string
) => {
  if (
    context.issues.some(
      (issue) => issue.columnIndex === columnIndex && issue.reason === reason
    )
  ) {
    return;
  }

  context.issues.push({
    rowIndex: context.sourceRowIndex,
    rowNumber: context.excelRowNumber,
    columnIndex,
    field,
    originalValue: context.sourceRow[columnIndex],
    value: context.values[field],
    reason,
    severity: "error",
    suggestion,
  });
};

const addBusinessIssue = (
  context: AwardBusinessContext,
  field: AwardStandardField,
  reason: string,
  suggestion: string
) => {
  const columnIndex = getFieldColumn(context, field);
  if (columnIndex === null) return;
  addBusinessIssueByColumn(context, columnIndex, field, reason, suggestion);
};

const setBusinessValue = (
  context: AwardBusinessContext,
  field: AwardStandardField,
  value: unknown,
  reason: string
) => {
  const columnIndex = getFieldColumn(context, field);
  if (columnIndex === null) return;
  const actualField = getBusinessField(context, columnIndex);
  const currentValue = context.values[actualField];
  context.values[actualField] = value;
  if (valuesEqual(currentValue, value)) return;

  context.logs.push({
    rowIndex: context.sourceRowIndex,
    rowNumber: context.excelRowNumber,
    columnIndex,
    field: actualField,
    originalValue: context.sourceRow[columnIndex],
    fixedValue: value,
    reason,
  });
};

const parseInteger = (value: unknown) => {
  if (typeof value === "number") return Number.isInteger(value) ? value : null;
  const text = toText(value);
  if (!/^-?\d+(?:\.0+)?$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isInteger(parsed) ? parsed : null;
};

const ensureInteger = (
  context: AwardBusinessContext,
  field: AwardStandardField,
  label: string,
  required = true
) => {
  const columnIndex = getFieldColumn(context, field);
  if (columnIndex === null) return null;
  const value = getBusinessValue(context, field);
  if (isBlank(value)) {
    if (required && !hasBusinessIssue(context, columnIndex)) {
      addBusinessIssue(context, field, `${label}必须填写整数`, `请填写${label}整数值`);
    }
    return null;
  }

  const parsed = parseInteger(value);
  if (parsed === null) {
    if (!hasBusinessIssue(context, columnIndex)) {
      addBusinessIssue(context, field, `${label}必须为整数`, `请将${label}修改为整数`);
    }
    return null;
  }

  setBusinessValue(context, field, parsed, `${label}已规范为整数`);
  return parsed;
};

const ensureYesNo = (context: AwardBusinessContext, field: AwardStandardField, label: string) => {
  const columnIndex = getFieldColumn(context, field);
  if (columnIndex === null) return "";
  const value = getBusinessValue(context, field);
  const text = toText(value);
  let normalized = "";

  if (NEGATIVE_VALUES.has(text)) normalized = "否";
  else if (POSITIVE_VALUES.has(text)) normalized = "是";

  if (!normalized) {
    if (!hasBusinessIssue(context, columnIndex)) {
      addBusinessIssue(context, field, `${label}只能填写“是”或“否”`, `请将${label}修改为“是”或“否”`);
    }
    return "";
  }

  setBusinessValue(context, field, normalized, `${label}已规范为“${normalized}”`);
  return normalized;
};

const ensureDate = (context: AwardBusinessContext, field: AwardStandardField, label: string) => {
  const columnIndex = getFieldColumn(context, field);
  if (columnIndex === null) return null;
  const value = getBusinessValue(context, field);
  const parts = parseDateParts(value);

  if (!parts) {
    if (!hasBusinessIssue(context, columnIndex)) {
      addBusinessIssue(context, field, `${label}无法解析为有效日期`, `请填写有效的${label}`);
    }
    return null;
  }

  const formatted = formatDate(parts, "YYYYMMDD");
  setBusinessValue(context, field, formatted, `${label}已统一为 YYYYMMDD 格式`);
  return Number(formatted);
};

const ensureTextLength = (
  context: AwardBusinessContext,
  field: AwardStandardField,
  label: string,
  minLength: number,
  maxLength: number
) => {
  const columnIndex = getFieldColumn(context, field);
  if (columnIndex === null) return;
  const text = toText(getBusinessValue(context, field));
  if (!text) {
    if (!hasBusinessIssue(context, columnIndex)) {
      addBusinessIssue(context, field, `${label}必填`, `请填写${label}`);
    }
    return;
  }

  if (text.length < minLength || text.length > maxLength) {
    addBusinessIssue(
      context,
      field,
      `${label}字数必须为 ${minLength}~${maxLength} 字`,
      `请将${label}调整为 ${minLength}~${maxLength} 字`
    );
  }
};

const logTemplateNotice = (context: AwardBusinessContext, reason: string) => {
  if (context.logs.some((item) => item.reason === reason)) return;
  context.logs.push({
    rowIndex: -1,
    rowNumber: 0,
    columnIndex: -1,
    field: "模板字段",
    originalValue: "",
    fixedValue: "",
    reason,
  });
};

const validateTopTenPercent = (
  context: AwardBusinessContext,
  rankField: AwardStandardField,
  totalField: AwardStandardField,
  rankLabel: string,
  totalLabel: string
) => {
  const total = ensureInteger(context, totalField, totalLabel);
  const rank = ensureInteger(context, rankField, rankLabel);
  if (total === null || rank === null) return;

  if (rank > total) {
    addBusinessIssue(context, rankField, `${rankLabel}不能大于${totalLabel}`, `请核对${rankLabel}`);
    return;
  }

  const limit = Math.max(1, Math.ceil(total * 0.1));
  if (rank > limit) {
    addBusinessIssue(context, rankField, `${rankLabel}必须进入${totalLabel}前 10%`, `请确认${rankLabel}不大于 ${limit}`);
  }
};

const REQUIRED_AWARD_FIELDS: Record<AwardType, AwardStandardField[]> = {
  national: [
    "学生姓名",
    "身份证号",
    "联系电话",
    "院系名称",
    "政治面貌",
    "必修课程数量",
    "及格课程数量",
    "成绩排名总人数",
    "成绩排名名次",
    "实行综合排名",
    "排名总人数",
    "排名名次",
    "申请理由",
    "申请日期",
    "院系意见",
    "院系日期",
  ],
  inspirational: [
    "学生姓名",
    "必修课程数量",
    "及格课程数量",
    "成绩排名总人数",
    "成绩排名名次",
    "实行综合排名",
    "排名总人数",
    "排名名次",
    "申请理由",
    "院系意见",
  ],
  shanghai: [
    "学生姓名",
    "身份证号",
    "联系电话",
    "院系名称",
    "政治面貌",
    "必修课程数量",
    "及格课程数量",
    "成绩排名总人数",
    "成绩排名名次",
    "实行综合排名",
    "排名总人数",
    "排名名次",
    "申请理由",
    "院系意见",
  ],
};

const ensureRequiredAwardFields = (awardType: AwardType, resolver: AwardFieldResolver) => {
  const missingFields = getMissingAwardFields(resolver, REQUIRED_AWARD_FIELDS[awardType]);
  if (missingFields.length > 0) {
    throw new Error(`当前模板缺少必要字段：${missingFields.join("、")}，请检查是否使用正确模板。`);
  }
};

const validateSameMajorCourseConsistency = (
  context: AwardBusinessContext,
  courseCount: number | null,
  passedCourseCount: number | null
) => {
  if (courseCount === null || passedCourseCount === null) return;
  if (!context.resolver.hasField("专业")) {
    if (!context.majorSkipLogged.value) {
      logTemplateNotice(context, "当前模板未找到专业字段，已跳过同专业课程数量一致性校验。");
      context.majorSkipLogged.value = true;
    }
    return;
  }

  const major = toText(getBusinessValue(context, "专业"));
  if (!major) return;
  const existing = context.courseConsistencyMap.get(major);
  if (!existing) {
    context.courseConsistencyMap.set(major, { courseCount, passedCourseCount, rowNumber: context.excelRowNumber });
    return;
  }

  if (existing.courseCount !== courseCount || existing.passedCourseCount !== passedCourseCount) {
    const reason = `同专业内必修课程数量、及格课程数量需保持一致；第 ${existing.rowNumber} 行已出现不同课程数量`;
    addBusinessIssue(context, "必修课程数量", reason, "请核对同专业必修课程数量");
    addBusinessIssue(context, "及格课程数量", reason, "请核对同专业及格课程数量");
  }
};

const validateRankingRules = (context: AwardBusinessContext, forceComprehensiveRanking: boolean) => {
  const courseCount = ensureInteger(context, "必修课程数量", "必修课程数量");
  const passedCourseCount = ensureInteger(context, "及格课程数量", "及格课程数量");

  if (courseCount !== null && (courseCount < 10 || courseCount > 30)) {
    addBusinessIssue(
      context,
      "必修课程数量",
      "必修课程数量不在 10-30 门范围内",
      "请核对该学生本学年必修课程数量，范围应为 10-30 门。"
    );
  }

  if (courseCount !== null && passedCourseCount !== null && courseCount !== passedCourseCount) {
    const reason = "必修课程数量必须等于及格课程数量";
    addBusinessIssue(context, "必修课程数量", reason, "请核对必修课程数量");
    addBusinessIssue(context, "及格课程数量", reason, "请核对及格课程数量");
  }
  validateSameMajorCourseConsistency(context, courseCount, passedCourseCount);

  validateTopTenPercent(context, "成绩排名名次", "成绩排名总人数", "成绩排名名次", "成绩排名总人数");

  if (forceComprehensiveRanking) {
    setBusinessValue(context, "实行综合排名", "是", "实行综合排名已自动修复为“是”");
  } else {
    ensureYesNo(context, "实行综合排名", "实行综合排名");
  }

  const gradeTotal = ensureInteger(context, "成绩排名总人数", "成绩排名总人数");
  const rankingTotal = ensureInteger(context, "排名总人数", "排名总人数");
  if (gradeTotal !== null && rankingTotal !== null && gradeTotal !== rankingTotal) {
    addBusinessIssue(context, "排名总人数", "成绩排名总人数必须等于排名总人数", "请将两个总人数保持一致");
  }

  validateTopTenPercent(context, "排名名次", "排名总人数", "排名名次", "排名总人数");
};

const SHANGHAI_POLITICAL_STATUS = [
  "中共党员",
  "中共预备党员",
  "共青团员",
  "民革会员",
  "民盟盟员",
  "民建会员",
  "民进会员",
  "农工党党员",
  "致公党党员",
  "九三学社社员",
  "台盟盟员",
  "无党派民主人士",
  "群众",
];

const POLITICAL_WORDS = [
  ...SHANGHAI_POLITICAL_STATUS,
  "党员",
  "预备党员",
  "团员",
  "共青团员",
  "群众",
];

const APPLICATION_FIXED_ENDINGS = [
  "特此申请国家奖学金。",
  "特此申请国家励志奖学金。",
  "特此申请上海市奖学金。",
];

const OPINION_FIXED_ENDINGS = [
  "同意推荐其申请国家奖学金。",
  "同意推荐其申请国家励志奖学金。",
  "同意推荐其申请上海市奖学金。",
];

const validateApplicationReason = (context: AwardBusinessContext) => {
  ensureTextLength(context, "申请理由", "申请理由", 100, 180);
  const reason = toText(getBusinessValue(context, "申请理由"));
  if (!reason) return;

  if (!/(我|本人)/.test(reason)) {
    addBusinessIssue(context, "申请理由", "申请理由必须使用第一视角", "请使用“我”或“本人”等第一视角表述");
  }
  if (POLITICAL_WORDS.some((item) => reason.includes(item))) {
    addBusinessIssue(context, "申请理由", "申请理由不得出现政治面貌词汇", "请删除政治面貌相关表述");
  }
  if (/(绩点|GPA|排名|名次|第\s*\d+|前\s*\d+|\d+\s*名|\d+\s*\/\s*\d+)/i.test(reason)) {
    addBusinessIssue(context, "申请理由", "申请理由不得出现绩点、GPA、具体排名或名次", "请改为综合表现描述");
  }
  if (APPLICATION_FIXED_ENDINGS.some((ending) => reason.includes(ending))) {
    addBusinessIssue(context, "申请理由", "申请理由不得出现固定申请结尾", "请删除固定结尾语句");
  }
};

const validateDepartmentOpinion = (context: AwardBusinessContext) => {
  ensureTextLength(context, "院系意见", "院系意见", 10, 50);
  const opinion = toText(getBusinessValue(context, "院系意见"));
  if (!opinion) return;

  const studentName = toText(getBusinessValue(context, "学生姓名"));
  if (studentName && opinion.includes(studentName)) {
    addBusinessIssue(context, "院系意见", "院系意见不得出现学生姓名", "请删除学生姓名，改为客观推荐意见");
  }
  if (opinion === "同意" || opinion === "同意推荐") {
    addBusinessIssue(context, "院系意见", "院系意见不能只写“同意”或“同意推荐”", "请补充完整的院系意见");
  }
  if (OPINION_FIXED_ENDINGS.some((ending) => opinion.includes(ending))) {
    addBusinessIssue(context, "院系意见", "院系意见不得出现固定推荐结尾", "请删除固定推荐结尾");
  }
};

type AwardGroupColumns = Partial<Record<"year" | "month" | "name" | "issuer", number>>;

const getAwardGroupColumns = (context: AwardBusinessContext) => {
  const fields = [1, 2, 3, 4].map((groupNumber) => ({
    year: context.resolver.getColumn(`获奖年份${groupNumber}` as AwardStandardField) ?? undefined,
    month: context.resolver.getColumn(`获奖月份${groupNumber}` as AwardStandardField) ?? undefined,
    name: context.resolver.getColumn(`获奖名称${groupNumber}` as AwardStandardField) ?? undefined,
    issuer: context.resolver.getColumn(`颁奖单位${groupNumber}` as AwardStandardField) ?? undefined,
  }));

  const resolvedGroups = fields.filter((group) =>
    [group.year, group.month, group.name, group.issuer].some((columnIndex) => columnIndex !== undefined)
  );
  if (resolvedGroups.length > 0) return resolvedGroups;

  const groups = new Map<string, AwardGroupColumns>();
  const kindRules: Array<[keyof AwardGroupColumns, string]> = [
    ["year", "获奖年份"],
    ["month", "获奖月份"],
    ["name", "获奖名称"],
    ["issuer", "颁奖单位"],
  ];

  context.fields.forEach((field, index) => {
    const normalized = normalizeHeaderName(field);
    const kind = kindRules.find(([, label]) => normalized.includes(label))?.[0];
    if (!kind) return;
    const suffix = normalized.match(/([一二三四五六七八九十123456789])$/)?.[1] || normalized.replace(/获奖年份|获奖月份|获奖名称|颁奖单位/g, "");
    const groupKey = suffix || String(index);
    const group = groups.get(groupKey) || {};
    group[kind] = index;
    groups.set(groupKey, group);
  });

  return Array.from(groups.values());
};

const getBusinessValueByColumn = (context: AwardBusinessContext, columnIndex?: number) =>
  columnIndex === undefined ? "" : context.values[getBusinessField(context, columnIndex)];

const SHANGHAI_AWARD_ISSUERS: Record<string, string> = {
  国家奖学金: "教育部",
  国家励志奖学金: "教育部",
  上海市奖学金: "上海市教育委员会",
};

type YearMonth = {
  year: number;
  month: number;
};

const parseYearMonthFromText = (text: string): YearMonth[] => {
  const normalized = normalizeFullWidthSymbols(text);
  const matches: YearMonth[] = [];
  const yearMonthPattern = /((?:19|20)\d{2})\s*(?:年|[./-])\s*(1[0-2]|0?[1-9])\s*月?/g;
  let match: RegExpExecArray | null;

  while ((match = yearMonthPattern.exec(normalized)) !== null) {
    matches.push({ year: Number(match[1]), month: Number(match[2]) });
  }

  return matches;
};

const parseYearMonthFromColumns = (yearValue: unknown, monthValue: unknown): YearMonth | null => {
  const year = parseInteger(yearValue);
  const month = parseInteger(monthValue);
  if (year === null || month === null || year < 1900 || year > 2100 || month < 1 || month > 12) return null;
  return { year, month };
};

const getApplicationYearMonth = (context: AwardBusinessContext): YearMonth | null => {
  if (!context.resolver.hasField("申请日期")) return null;
  const parts = parseDateParts(getBusinessValue(context, "申请日期"));
  if (!parts) return null;
  return { year: parts[0], month: parts[1] };
};

const isAwardBeforeApplyDate = (awardYear: number, awardMonth: number, applyDate: YearMonth) =>
  awardYear < applyDate.year || (awardYear === applyDate.year && awardMonth < applyDate.month);

const SCHOOL_LEVEL_KEYWORDS = ["校级", "学校", "校内", "校奖学金", "校优秀", "上海应用技术大学"];
const NON_SCHOOL_LEVEL_KEYWORDS = ["国家奖学金", "国家励志奖学金", "上海市奖学金", "教育部", "上海市教育委员会"];

const isSchoolLevelAward = (...texts: unknown[]) => {
  const content = texts.map((item) => toText(item)).filter(Boolean).join(" ");
  if (!content) return false;
  if (NON_SCHOOL_LEVEL_KEYWORDS.some((keyword) => content.includes(keyword))) return false;
  return SCHOOL_LEVEL_KEYWORDS.some((keyword) => content.includes(keyword));
};

const validateFreeTextAwardTime = (context: AwardBusinessContext) => {
  if (!context.resolver.hasField("曾获何种奖励")) return;
  const rawText = toText(getBusinessValue(context, "曾获何种奖励"));
  if (!rawText) return;

  const awardTimes = parseYearMonthFromText(rawText);
  if (awardTimes.length === 0) {
    addBusinessIssue(
      context,
      "曾获何种奖励",
      "无法识别曾获奖励时间，请按“2023年5月获得……”格式填写。",
      "请按“2023年5月获得……”格式填写。"
    );
    return;
  }

  const applyDate = getApplicationYearMonth(context);
  if (applyDate && awardTimes.some((item) => !isAwardBeforeApplyDate(item.year, item.month, applyDate))) {
    addBusinessIssue(
      context,
      "曾获何种奖励",
      "曾获奖励时间必须早于申请日期",
      "请核对奖励获得时间，奖励时间应早于申请日期。"
    );
  }

  if (isSchoolLevelAward(rawText) && awardTimes.some((item) => item.month !== 5 && item.month !== 11)) {
    addBusinessIssue(
      context,
      "曾获何种奖励",
      "校级奖项获奖月份必须为 5 月或 11 月",
      "请核对校级奖项获奖月份，校级奖项通常应为 5 月或 11 月。"
    );
  }
};

const addStructuredAwardIssue = (
  context: AwardBusinessContext,
  columnIndex: number | undefined,
  reason: string,
  suggestion: string
) => {
  if (columnIndex === undefined) return;
  addBusinessIssueByColumn(context, columnIndex, getBusinessField(context, columnIndex), reason, suggestion);
};

const validateAwardGroups = (context: AwardBusinessContext, checkShanghaiIssuer = false) => {
  const applyDate = getApplicationYearMonth(context);

  getAwardGroupColumns(context).forEach((group, groupIndex) => {
    const columns = [group.year, group.month, group.name, group.issuer];
    const groupValues = columns.map((columnIndex) => toText(getBusinessValueByColumn(context, columnIndex)));
    if (groupValues.every((value) => value === "")) return;

    const labels = ["获奖年份", "获奖月份", "获奖名称", "颁奖单位"];
    columns.forEach((columnIndex, offset) => {
      if (columnIndex === undefined) return;
      const value = groupValues[offset];
      if (!value) {
        addBusinessIssueByColumn(
          context,
          columnIndex,
          getBusinessField(context, columnIndex),
          `第 ${groupIndex + 1} 组获奖信息不完整`,
          `请补充第 ${groupIndex + 1} 组${labels[offset]}`
        );
      }
    });

    if (group.year !== undefined && groupValues[0] && !/^\d{4}$/.test(groupValues[0])) {
      addBusinessIssueByColumn(context, group.year, getBusinessField(context, group.year), "获奖年份必须为 4 位年份", "请填写 4 位获奖年份");
    }
    if (
      group.month !== undefined &&
      groupValues[1] &&
      (!/^\d{1,2}$/.test(groupValues[1]) || Number(groupValues[1]) < 1 || Number(groupValues[1]) > 12)
    ) {
      addBusinessIssueByColumn(context, group.month, getBusinessField(context, group.month), "获奖月份必须为 1~12", "请填写 1~12 之间的获奖月份");
    }

    const awardTime = parseYearMonthFromColumns(groupValues[0], groupValues[1]);
    if (awardTime && applyDate && !isAwardBeforeApplyDate(awardTime.year, awardTime.month, applyDate)) {
      addStructuredAwardIssue(
        context,
        group.year,
        "曾获奖励时间必须早于申请日期",
        "请核对奖励获得时间，奖励时间应早于申请日期。"
      );
      addStructuredAwardIssue(
        context,
        group.month,
        "曾获奖励时间必须早于申请日期",
        "请核对奖励获得时间，奖励时间应早于申请日期。"
      );
    }

    if (
      awardTime &&
      isSchoolLevelAward(groupValues[2], groupValues[3], groupValues.join(" ")) &&
      awardTime.month !== 5 &&
      awardTime.month !== 11
    ) {
      addStructuredAwardIssue(
        context,
        group.month,
        "校级奖项获奖月份必须为 5 月或 11 月",
        "请核对校级奖项获奖月份，校级奖项通常应为 5 月或 11 月。"
      );
    }

    [group.name, group.issuer].forEach((columnIndex, offset) => {
      if (columnIndex === undefined) return;
      const value = toText(getBusinessValueByColumn(context, columnIndex));
      if (!value) return;
      if (ZERO_LIKE_VALUES.has(value)) {
        addBusinessIssueByColumn(
          context,
          columnIndex,
          getBusinessField(context, columnIndex),
          `${offset === 0 ? "获奖名称" : "颁奖单位"}不得只填写“无”“否”“没有”`,
          `请填写有效的${offset === 0 ? "获奖名称" : "颁奖单位"}`
        );
      } else if (value.length <= 1 || value.length > 88) {
        addBusinessIssueByColumn(
          context,
          columnIndex,
          getBusinessField(context, columnIndex),
          `${offset === 0 ? "获奖名称" : "颁奖单位"}长度必须大于 1 且不超过 88 字符`,
          `请核对${offset === 0 ? "获奖名称" : "颁奖单位"}长度`
        );
      }
    });

    const expectedIssuer = checkShanghaiIssuer ? SHANGHAI_AWARD_ISSUERS[groupValues[2]] : "";
    if (group.issuer !== undefined && expectedIssuer && groupValues[3] && groupValues[3] !== expectedIssuer) {
      addBusinessIssueByColumn(
        context,
        group.issuer,
        getBusinessField(context, group.issuer),
        `${groupValues[2]}的颁奖单位应为“${expectedIssuer}”`,
        `请将颁奖单位修改为“${expectedIssuer}”`
      );
    }
  });
};

const estimateRewardCount = (value: unknown) => {
  const text = toText(value);
  if (!text) return 0;
  const splitCount = text.split(/[\r\n；、]+/).map((item) => item.trim()).filter(Boolean).length;
  const sequenceCount = text.match(/(?:^|[\s；、])\d+[.、）)]/g)?.length || 0;
  return Math.max(splitCount, sequenceCount, 1);
};

const validateOptionalDates = (context: AwardBusinessContext) => {
  const applicationDate = context.resolver.hasField("申请日期") ? ensureDate(context, "申请日期", "申请日期") : null;
  const counselorDate = context.resolver.hasField("辅导员推荐日期")
    ? ensureDate(context, "辅导员推荐日期", "辅导员推荐日期")
    : null;
  const departmentDate = context.resolver.hasField("院系日期") ? ensureDate(context, "院系日期", "院系日期") : null;

  if (applicationDate !== null && counselorDate !== null && applicationDate > counselorDate) {
    addBusinessIssue(context, "辅导员推荐日期", "辅导员推荐日期不能早于申请日期", "请核对辅导员推荐日期");
  }
  if (counselorDate !== null && departmentDate !== null && counselorDate > departmentDate) {
    addBusinessIssue(context, "院系日期", "院系日期不能早于辅导员推荐日期", "请核对院系日期");
  }
  if (counselorDate === null && applicationDate !== null && departmentDate !== null && applicationDate > departmentDate) {
    addBusinessIssue(context, "院系日期", "院系日期不能早于申请日期", "请核对院系日期");
  }
};

const validateCommonAwardRules = (context: AwardBusinessContext, forceComprehensiveRanking: boolean, checkShanghaiIssuer = false) => {
  validateRankingRules(context, forceComprehensiveRanking);
  validateApplicationReason(context);
  validateDepartmentOpinion(context);
  validateOptionalDates(context);
  validateFreeTextAwardTime(context);
  validateAwardGroups(context, checkShanghaiIssuer);
};

const validateNationalRules = (context: AwardBusinessContext) => {
  validateCommonAwardRules(context, true);
};

const validateInspirationalRules = (context: AwardBusinessContext) => {
  validateCommonAwardRules(context, false);
  if (context.resolver.hasField("曾获何种奖励") && estimateRewardCount(getBusinessValue(context, "曾获何种奖励")) > 2) {
    addBusinessIssue(context, "曾获何种奖励", "曾获何种奖励不得超过 2 条", "请将奖励信息精简为不超过 2 条");
  }
};

const validateShanghaiBasicFields = (context: AwardBusinessContext) => {
  const studentName = toText(getBusinessValue(context, "学生姓名"));
  if (!studentName) {
    addBusinessIssue(context, "学生姓名", "学生姓名必填", "请填写学生姓名");
  } else if (!/^[\u4e00-\u9fa5·A-Za-z]{1,20}$/.test(studentName)) {
    addBusinessIssue(
      context,
      "学生姓名",
      "学生姓名必须为 1~20 个汉字，可包含 · 和大小写字母",
      "请核对学生姓名格式"
    );
  }

  const idCard = toText(getBusinessValue(context, "身份证号")).toUpperCase();
  setBusinessValue(context, "身份证号", idCard, "身份证号中的字母已规范为大写");
  if (!/^\d{17}[\dX]$/.test(idCard) || !isValidIdCard(idCard)) {
    addBusinessIssue(context, "身份证号", "身份证号必须为合法的 18 位号码", "请核对身份证号位数和校验位");
  }

  const phone = normalizeFullWidthSymbols(toText(getBusinessValue(context, "联系电话"))).replace(/[\s\-；]/g, "");
  setBusinessValue(context, "联系电话", phone, "联系电话中的空格和横杠已自动移除");
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    addBusinessIssue(context, "联系电话", "联系电话必须为 11 位手机号", "请填写有效的 11 位手机号");
  }

  const department = toText(getBusinessValue(context, "院系名称"));
  if (!department) {
    addBusinessIssue(context, "院系名称", "院系名称必填", "请填写院系名称");
  } else if (department.length > 100) {
    addBusinessIssue(context, "院系名称", "院系名称不得超过 100 字符", "请精简院系名称");
  }

  const politicalStatus = toText(getBusinessValue(context, "政治面貌"));
  if (!politicalStatus) {
    addBusinessIssue(context, "政治面貌", "政治面貌必填", "请填写政治面貌");
  } else if (!SHANGHAI_POLITICAL_STATUS.includes(politicalStatus)) {
    addBusinessIssue(
      context,
      "政治面貌",
      `政治面貌不在允许范围内：${SHANGHAI_POLITICAL_STATUS.join("、")}`,
      "请从允许的政治面貌中选择"
    );
  }
};

const validateShanghaiRules = (context: AwardBusinessContext) => {
  validateShanghaiBasicFields(context);
  validateCommonAwardRules(context, false, true);
};

const applyAwardBusinessRules = (
  awardType: AwardType,
  context: AwardBusinessContext
) => {
  if (awardType === "national") validateNationalRules(context);
  else if (awardType === "inspirational") validateInspirationalRules(context);
  else validateShanghaiRules(context);
};
const getEffectiveColumnCount = (requirements: unknown[], fields: unknown[]) => {
  let count = Math.max(requirements.length, fields.length);
  while (
    count > 0 &&
    String(requirements[count - 1] ?? "").trim() === "" &&
    String(fields[count - 1] ?? "").trim() === ""
  ) {
    count--;
  }
  return count;
};

const AWARD_OFFICIAL_SHEET_NAMES = [
  "国家奖学金申请档案",
  "国家励志奖学金申请档案",
  "上海市奖学金申请档案",
];

const getAwardOutputSheetName = (workbookData: WorkbookData) =>
  AWARD_OFFICIAL_SHEET_NAMES.find((name) => workbookData.sheetNames.includes(name)) ||
  workbookData.sheetNames.find((name) => (workbookData.sheets[name] || []).length >= 2) ||
  workbookData.sheetNames[0];

export const parseAwardWorkbook = (workbookData: WorkbookData): AwardTemplate => {
  const outputSheet = getAwardOutputSheetName(workbookData);
  if (!outputSheet) throw new Error("Excel 中未找到可处理的工作表");

  const rows = workbookData.sheets[outputSheet] || [];
  const requirements = rows[0] || [];
  const rawFields = rows[1] || [];
  const columnCount = getEffectiveColumnCount(requirements, rawFields);
  const fields = rawFields.slice(0, columnCount).map((field, index) => {
    const value = String(field ?? "").trim();
    return value || `第${index + 1}列`;
  });

  if (fields.length === 0) throw new Error("模板第 2 行未读取到字段名称");

  const normalizedRequirements = requirements.slice(0, columnCount);
  return {
    workbookData,
    outputSheet,
    requirements: normalizedRequirements,
    fields,
    sourceRows: rows.slice(2),
    rules: parseTemplateRules(normalizedRequirements, fields),
  };
};

export const getAwardImportDiagnostics = ({
  fileName,
  workbookData,
  template,
  awardType,
}: {
  fileName: string;
  workbookData?: WorkbookData | null;
  template?: AwardTemplate | null;
  awardType?: AwardType;
}) => {
  const outputSheet = template?.outputSheet || (workbookData ? getAwardOutputSheetName(workbookData) : "");
  const fields = template?.fields || [];
  const resolver = fields.length > 0 ? createAwardFieldResolver(fields) : null;
  const missingFields = awardType && resolver ? getMissingAwardFields(resolver, REQUIRED_AWARD_FIELDS[awardType]) : [];

  return [
    `当前文件名：${fileName}`,
    `读取到的 Sheet 名：${workbookData?.sheetNames.join("、") || "未读取到"}`,
    `实际使用的 Sheet：${outputSheet || "未识别"}`,
    "识别到的表头行号：2",
    `识别到的字段名列表：${fields.length > 0 ? fields.join("、") : "未识别到字段"}`,
    `缺失的必要字段列表：${missingFields.length > 0 ? missingFields.join("、") : "无"}`,
  ];
};

const isTemplateRemarkRow = (sourceRow: unknown[], fields: string[], resolver: AwardFieldResolver) => {
  if (sourceRow.every((cell) => isBlank(cell))) return true;

  const text = sourceRow.map((cell) => toText(cell)).filter(Boolean).join(" ");
  if (!text) return true;

  const meaningfulCells = sourceRow.filter((cell) => !isBlank(cell)).length;
  const fieldText = fields.join(" ");
  const looksLikeRemark =
    meaningfulCells <= 4 &&
    /备注|说明|提示|注意|若|如果|请|报错|一致|填写|模板|示例|及格课程数量|必修课程数量|同院系|同专业|同班级/.test(text) &&
    !fieldText.includes(text);
  if (looksLikeRemark) return true;

  const getResolvedValue = (field: AwardStandardField) => {
    const columnIndex = resolver.getColumn(field);
    return columnIndex === null ? "" : toText(sourceRow[columnIndex]);
  };
  const studentName = getResolvedValue("学生姓名");
  const idCard = getResolvedValue("身份证号");
  const phone = getResolvedValue("联系电话");

  if (studentName || idCard || phone) return false;
  return false;
};

export const processAwardRows = ({
  awardType,
  fields,
  requirements,
  sourceRows,
}: {
  awardType?: AwardType;
  fields: string[];
  requirements: unknown[];
  sourceRows: unknown[][];
}): AwardProcessResult => {
  const rules = parseTemplateRules(requirements, fields);
  const passedRows: AwardProcessedRow[] = [];
  const failedRows: AwardProcessedRow[] = [];
  const issues: AwardIssue[] = [];
  const logs: AwardRepairLog[] = [];
  const resolver = createAwardFieldResolver(fields);
  const courseConsistencyMap = new Map<string, { courseCount: number; passedCourseCount: number; rowNumber: number }>();
  const majorSkipLogged = { value: false };

  if (awardType) ensureRequiredAwardFields(awardType, resolver);

  sourceRows.forEach((sourceRow, sourceRowIndex) => {
    if (isTemplateRemarkRow(sourceRow, fields, resolver)) return;

    const excelRowNumber = sourceRowIndex + 3;
    const values: Record<string, unknown> = {};
    const rowIssues: AwardIssue[] = [];

    rules.forEach((rule) => {
      const originalValue = sourceRow[rule.columnIndex];
      const standardField = resolver.getStandardFieldByColumn(rule.columnIndex);
      const forceNationalComprehensive = awardType === "national" && standardField === "实行综合排名";
      const valueToCheck = forceNationalComprehensive ? "是" : originalValue;
      if (forceNationalComprehensive && !valuesEqual(originalValue, "是")) {
        logs.push({
          rowIndex: sourceRowIndex,
          rowNumber: excelRowNumber,
          columnIndex: rule.columnIndex,
          field: rule.field,
          originalValue,
          fixedValue: "是",
          reason: "实行综合排名已自动修复为“是”",
        });
      }
      const checked = checkCell(rule, valueToCheck);
      values[rule.field] = checked.value;

      checked.repairs.forEach((reason) => {
        logs.push({
          rowIndex: sourceRowIndex,
          rowNumber: excelRowNumber,
          columnIndex: rule.columnIndex,
          field: rule.field,
          originalValue,
          fixedValue: checked.value,
          reason,
        });
      });

      checked.issues.forEach(({ reason, suggestion }) => {
        rowIssues.push({
          rowIndex: sourceRowIndex,
          rowNumber: excelRowNumber,
          columnIndex: rule.columnIndex,
          field: rule.field,
          originalValue,
          value: checked.value,
          reason,
          severity: "error",
          suggestion,
        });
      });
    });

    if (awardType) {
      applyAwardBusinessRules(awardType, {
        fields,
        sourceRow,
        sourceRowIndex,
        excelRowNumber,
        values,
        issues: rowIssues,
        logs,
        resolver,
        courseConsistencyMap,
        majorSkipLogged,
      });
    }

    const processedRow = { sourceRowIndex, excelRowNumber, values };
    if (rowIssues.length > 0) {
      failedRows.push(processedRow);
      issues.push(...rowIssues);
    } else {
      passedRows.push(processedRow);
    }
  });

  return { passedRows, failedRows, issues, logs };
};

export const processAwardWorkbook = (
  template: AwardTemplate,
  awardType?: AwardType
) =>
  processAwardRows({
    awardType,
    fields: template.fields,
    requirements: template.requirements,
    sourceRows: template.sourceRows,
  });

const makeAwardSheet = ({
  template,
  rows,
  issues = [],
}: {
  template: AwardTemplate;
  rows: AwardProcessedRow[];
  issues?: AwardIssue[];
}) => {
  const originalSheet = template.workbookData.worksheets[template.outputSheet];
  if (!originalSheet) throw new Error("模板输出表不存在");
  const worksheet = cloneWorksheet(originalSheet);

  Object.keys(worksheet).forEach((address) => {
    if (!/^[A-Z]+[0-9]+$/.test(address)) return;
    const cell = XLSX.utils.decode_cell(address);
    if (cell.r >= 2 || cell.c >= template.fields.length) delete (worksheet as Record<string, unknown>)[address];
  });

  const issueMap = new Map(issues.map((issue) => [`${issue.rowIndex}_${issue.columnIndex}`, issue]));
  rows.forEach((row, exportRowIndex) => {
    template.fields.forEach((field, columnIndex) => {
      const address = XLSX.utils.encode_cell({ r: exportRowIndex + 2, c: columnIndex });
      const sampleAddress = XLSX.utils.encode_cell({ r: 2, c: columnIndex });
      const headerAddress = XLSX.utils.encode_cell({ r: 1, c: columnIndex });
      const sampleCell = (originalSheet as Record<string, { s?: unknown }>)[sampleAddress] ||
        (originalSheet as Record<string, { s?: unknown }>)[headerAddress];
      const value = row.values[field] ?? "";
      let cell: Record<string, unknown> = {
        v: value,
        t: typeof value === "number" ? "n" : "s",
      };
      if (sampleCell?.s) cell.s = { ...(sampleCell.s as Record<string, unknown>) };
      if (issueMap.has(`${row.sourceRowIndex}_${columnIndex}`)) {
        cell = applyHighlightStyle(cell, { color: "yellow", reason: "该字段需要人工修改" });
      }
      (worksheet as Record<string, unknown>)[address] = cell;
    });
  });

  worksheet["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(1, rows.length + 1), c: template.fields.length - 1 },
  });
  worksheet["!cols"] = originalSheet["!cols"] || template.fields.map(() => ({ wch: 20 }));
  if (originalSheet["!rows"]) worksheet["!rows"] = JSON.parse(JSON.stringify(originalSheet["!rows"]));
  return worksheet;
};

const makeIssueSheet = (issues: AwardIssue[]) => {
  const rows = issues.length === 0
    ? [["暂无问题"]]
    : [
        ["行号", "字段名", "原值", "问题原因", "严重程度", "修改建议"],
        ...issues.map((issue) => [
          issue.rowNumber,
          issue.field,
          issue.originalValue ?? "",
          issue.reason,
          issue.severity,
          issue.suggestion,
        ]),
      ];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 10 },
    { wch: 24 },
    { wch: 28 },
    { wch: 54 },
    { wch: 12 },
    { wch: 46 },
  ];
  return worksheet;
};

export const exportAwardExcel = ({
  awardType,
  template,
  result,
  exportMode,
}: {
  awardType: AwardType;
  template: AwardTemplate;
  result: AwardProcessResult;
  exportMode: "passed" | "failed";
}) => {
  const workbook = XLSX.utils.book_new();
  const listName = `${awardTypeLabels[awardType]}${exportMode === "passed" ? "通过名单" : "不通过名单"}`;

  if (exportMode === "passed") {
    XLSX.utils.book_append_sheet(workbook, makeAwardSheet({ template, rows: result.passedRows }), listName);
  } else {
    XLSX.utils.book_append_sheet(
      workbook,
      makeAwardSheet({ template, rows: result.failedRows, issues: result.issues }),
      listName
    );
    XLSX.utils.book_append_sheet(workbook, makeIssueSheet(result.issues), "问题说明");
  }

  XLSX.writeFile(workbook, `${listName}.xlsx`);
};

export const findAwardTypeField = (fields: string[]) =>
  fields.find((field) => /奖项类型|获奖类型|奖项类别|奖项名称|奖项/.test(field));

export const buildAwardTypeCounts = (rows: AwardProcessedRow[], fields: string[]) => {
  const awardTypeField = findAwardTypeField(fields);
  return rows.reduce<Record<string, number>>((counts, row) => {
    const type = toText(awardTypeField ? row.values[awardTypeField] : "") || "未分类";
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});
};

export const makeAwardSubmission = ({
  awardType,
  academicYear,
  collegeName,
  fields,
  result,
}: {
  awardType: AwardType;
  academicYear: string;
  collegeName: string;
  fields: string[];
  result: AwardProcessResult;
}): AwardSubmission => {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    awardType,
    academicYear,
    collegeName: normalizeSubmissionCollegeName(collegeName),
    createdAt: now,
    confirmedAt: now,
    reviewStatus: "confirmed",
    submitStatus: "submitted",
    rowCount: result.passedRows.length,
    awardTypeCounts: buildAwardTypeCounts(result.passedRows, fields),
    fields,
    rows: result.passedRows.map((row) => row.values),
  };
};

const getAcademicYearForDate = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = safeDate.getFullYear();
  const startYear = safeDate.getMonth() >= 7 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
};

export const getCurrentAcademicYear = () => getAcademicYearForDate(new Date());

export const getAwardAcademicYearOptions = (submissions: AwardSubmission[] = []) => {
  const currentStart = Number(getCurrentAcademicYear().slice(0, 4));
  const years = new Set([
    ...Array.from({ length: 6 }, (_, index) => `${currentStart - index}-${currentStart - index + 1}`),
    ...submissions.map((submission) => submission.academicYear),
  ]);
  return [...years].filter(Boolean).sort((left, right) => right.localeCompare(left));
};

const normalizeAwardSubmission = (
  submission: Partial<AwardSubmission> & Pick<AwardSubmission, "id" | "awardType" | "collegeName" | "createdAt" | "rows">
): AwardSubmission => {
  const rows = Array.isArray(submission.rows) ? submission.rows : [];
  const fields =
    Array.isArray(submission.fields) && submission.fields.length > 0
      ? submission.fields
      : Object.keys(rows[0] || {});
  return {
    id: submission.id,
    awardType: submission.awardType,
    academicYear: submission.academicYear || getAcademicYearForDate(submission.createdAt),
    collegeName: normalizeSubmissionCollegeName(submission.collegeName),
    createdAt: submission.createdAt,
    confirmedAt: submission.confirmedAt || submission.createdAt,
    reviewStatus: submission.reviewStatus || "confirmed",
    submitStatus: submission.submitStatus || "submitted",
    rowCount: submission.rowCount ?? rows.length,
    awardTypeCounts: submission.awardTypeCounts || buildAwardTypeCounts(
      rows.map((values, sourceRowIndex) => ({ sourceRowIndex, excelRowNumber: sourceRowIndex + 3, values })),
      fields
    ),
    fields,
    rows,
  };
};

export const getAwardSubmissions = async (awardType: AwardType): Promise<AwardSubmission[]> => {
  return getAwardSubmissionsDb(awardType);
};

export const saveAwardSubmission = async (awardType: AwardType, submission: AwardSubmission) => {
  await saveAwardSubmissionDb(awardType, submission);
};

export const getAllAwardSubmissions = async () => {
  return getAllAwardSubmissionsDb();
};

const pickAwardRowValue = (row: Record<string, unknown>, aliases: string[]) => {
  const normalizedAliases = aliases.map(normalizeHeaderName);
  const match = Object.entries(row).find(([field]) => {
    const normalizedField = normalizeHeaderName(field);
    return normalizedAliases.some(
      (alias) => alias === normalizedField || normalizedField.includes(alias) || alias.includes(normalizedField)
    );
  });
  return toText(match?.[1]);
};

export const getAwardAdminRecords = async (awardType?: AwardType): Promise<AwardAdminRecord[]> => {
  const submissions = awardType ? await getAwardSubmissions(awardType) : await getAllAwardSubmissions();
  return submissions.flatMap((submission) =>
    submission.rows.map((rawData, rowIndex) => ({
      id: `${submission.id}_${rowIndex}`,
      submissionId: submission.id,
      academicYear: submission.academicYear,
      awardType: submission.awardType,
      collegeName:
        pickAwardRowValue(rawData, ["院系名称", "学院", "所在学院"]) || submission.collegeName,
      studentId: pickAwardRowValue(rawData, ["学生学号", "学号"]),
      name: pickAwardRowValue(rawData, ["学生姓名", "姓名"]),
      idCard: pickAwardRowValue(rawData, ["身份证号", "身份证件号", "证件号"]),
      major: pickAwardRowValue(rawData, ["专业名称", "所在专业", "专业"]),
      grade: pickAwardRowValue(rawData, ["年级"]),
      gender: pickAwardRowValue(rawData, ["性别"]),
      status: pickAwardRowValue(rawData, ["状态", "审核状态"]) || "已上载",
      reviewStatus: submission.reviewStatus,
      submitStatus: submission.submitStatus,
      submittedAt: submission.createdAt,
      rawData,
    }))
  );
};

export const exportAwardIssues = (result: AwardProcessResult, awardName = "三大奖") => {
  if (result.issues.length === 0) throw new Error("当前没有可导出的问题说明");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, makeIssueSheet(result.issues), "问题说明");
  XLSX.writeFile(workbook, `${awardName}问题说明_${Date.now()}.xlsx`);
};

export const exportAwardAdminRecords = (records: AwardAdminRecord[], awardName = "三大奖") => {
  if (records.length === 0) throw new Error("当前筛选条件下暂无可导出数据");
  const rows = records.map((record) => ({
    学年: record.academicYear,
    奖项: awardTypeLabels[record.awardType],
    学院: record.collegeName,
    学号: record.studentId,
    姓名: record.name,
    身份证号: record.idCard,
    专业: record.major,
    年级: record.grade,
    性别: record.gender,
    状态: record.status,
    学院确认: record.reviewStatus === "confirmed" ? "已确认" : "待确认",
    上载状态: record.submitStatus === "submitted" ? "已上载" : "待上载",
    上载时间: new Date(record.submittedAt).toLocaleString(),
    ...record.rawData,
  }));
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, `${awardName}汇总`.slice(0, 31));
  XLSX.writeFile(workbook, `${awardName}当前名单_${Date.now()}.xlsx`);
};

export const exportAwardSummary = (submissions: AwardSubmission[], awardName = "三大奖") => {
  const rows = submissions.flatMap((submission) =>
    submission.rows.map((row) => ({
      学院: submission.collegeName,
      上载时间: new Date(submission.createdAt).toLocaleString(),
      ...row,
    }))
  );
  if (rows.length === 0) throw new Error("暂无三大奖汇总数据");

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, `${awardName}汇总`.slice(0, 31));
  XLSX.writeFile(workbook, `${awardName}全校汇总_${Date.now()}.xlsx`);
};

