import * as XLSX from "xlsx-js-style";
import { applyHighlightStyle, cloneWorksheet } from "./excelExport";
import type { WorkbookData } from "./types";
import { parseTemplateRules } from "./templateRuleParser";
import { awardStorageKeys } from "./awardConfig";
import type {
  AwardDateFormat,
  AwardFieldRule,
  AwardIssue,
  AwardProcessResult,
  AwardProcessedRow,
  AwardRepairLog,
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
};

const getBusinessField = (context: AwardBusinessContext, columnIndex: number) =>
  context.fields[columnIndex] || `第${columnIndex + 1}列`;

const getBusinessValue = (context: AwardBusinessContext, columnIndex: number) =>
  context.values[getBusinessField(context, columnIndex)];

const hasBusinessIssue = (context: AwardBusinessContext, columnIndex: number) =>
  context.issues.some((issue) => issue.columnIndex === columnIndex);

const addBusinessIssue = (
  context: AwardBusinessContext,
  columnIndex: number,
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

  const field = getBusinessField(context, columnIndex);
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

const setBusinessValue = (
  context: AwardBusinessContext,
  columnIndex: number,
  value: unknown,
  reason: string
) => {
  const field = getBusinessField(context, columnIndex);
  const currentValue = context.values[field];
  context.values[field] = value;
  if (valuesEqual(currentValue, value)) return;

  context.logs.push({
    rowIndex: context.sourceRowIndex,
    rowNumber: context.excelRowNumber,
    columnIndex,
    field,
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
  columnIndex: number,
  label: string,
  required = true
) => {
  const value = getBusinessValue(context, columnIndex);
  if (isBlank(value)) {
    if (required && !hasBusinessIssue(context, columnIndex)) {
      addBusinessIssue(context, columnIndex, `${label}必须填写整数`, `请填写${label}整数值`);
    }
    return null;
  }

  const parsed = parseInteger(value);
  if (parsed === null) {
    if (!hasBusinessIssue(context, columnIndex)) {
      addBusinessIssue(context, columnIndex, `${label}必须为整数`, `请将${label}修改为整数`);
    }
    return null;
  }

  setBusinessValue(context, columnIndex, parsed, `${label}已规范为整数`);
  return parsed;
};

const ensureYesNo = (context: AwardBusinessContext, columnIndex: number, label: string) => {
  const value = getBusinessValue(context, columnIndex);
  const text = toText(value);
  let normalized = "";

  if (NEGATIVE_VALUES.has(text)) normalized = "否";
  else if (POSITIVE_VALUES.has(text)) normalized = "是";

  if (!normalized) {
    if (!hasBusinessIssue(context, columnIndex)) {
      addBusinessIssue(context, columnIndex, `${label}只能填写“是”或“否”`, `请将${label}修改为“是”或“否”`);
    }
    return "";
  }

  setBusinessValue(context, columnIndex, normalized, `${label}已规范为“${normalized}”`);
  return normalized;
};

const ensureDate = (context: AwardBusinessContext, columnIndex: number, label: string) => {
  const value = getBusinessValue(context, columnIndex);
  const parts = parseDateParts(value);

  if (!parts) {
    if (!hasBusinessIssue(context, columnIndex)) {
      addBusinessIssue(context, columnIndex, `${label}无法解析为有效日期`, `请填写有效的${label}`);
    }
    return null;
  }

  const formatted = formatDate(parts, "YYYYMMDD");
  setBusinessValue(context, columnIndex, formatted, `${label}已统一为 YYYYMMDD 格式`);
  return Number(formatted);
};

const ensureTextLength = (
  context: AwardBusinessContext,
  columnIndex: number,
  label: string,
  minLength: number,
  maxLength: number
) => {
  const text = toText(getBusinessValue(context, columnIndex));
  if (!text) {
    if (!hasBusinessIssue(context, columnIndex)) {
      addBusinessIssue(context, columnIndex, `${label}必填`, `请填写${label}`);
    }
    return;
  }

  if (text.length < minLength || text.length > maxLength) {
    addBusinessIssue(
      context,
      columnIndex,
      `${label}字数必须为 ${minLength}~${maxLength} 字`,
      `请将${label}调整为 ${minLength}~${maxLength} 字`
    );
  }
};

const appendEnding = (
  context: AwardBusinessContext,
  columnIndex: number,
  ending: string,
  label: string
) => {
  const text = toText(getBusinessValue(context, columnIndex));
  if (!text || text.endsWith(ending)) return;
  setBusinessValue(context, columnIndex, `${text}${ending}`, `${label}已自动追加固定结尾`);
};

const validateRankingRules = (
  context: AwardBusinessContext,
  forceComprehensiveRanking: boolean
) => {
  const courseCount = ensureInteger(context, 6, "必修课程数量");
  const passedCourseCount = ensureInteger(context, 7, "及格课程数量");
  const gradeTotal = ensureInteger(context, 8, "成绩排名总人数");
  const gradeRank = ensureInteger(context, 9, "成绩排名名次");

  const comprehensiveRanking = forceComprehensiveRanking
    ? (setBusinessValue(context, 10, "是", "实行综合排名已自动修复为“是”"), "是")
    : ensureYesNo(context, 10, "实行综合排名");

  const comprehensiveTotal = ensureInteger(context, 11, "排名总人数", comprehensiveRanking === "是");
  const comprehensiveRank = ensureInteger(context, 12, "排名名次", comprehensiveRanking === "是");

  if (courseCount !== null && passedCourseCount !== null && courseCount !== passedCourseCount) {
    const reason = "必修课程数量必须等于及格课程数量";
    addBusinessIssue(context, 6, reason, "请核对必修课程数量");
    addBusinessIssue(context, 7, reason, "请核对及格课程数量");
  }
  if (gradeTotal !== null && gradeRank !== null && gradeRank > gradeTotal) {
    addBusinessIssue(context, 9, "成绩排名名次不能大于成绩排名总人数", "请核对成绩排名名次");
  }
  if (gradeTotal !== null && comprehensiveTotal !== null && comprehensiveTotal !== gradeTotal) {
    addBusinessIssue(context, 11, "排名总人数必须等于成绩排名总人数", "请将排名总人数与成绩排名总人数保持一致");
  }
  if (
    comprehensiveTotal !== null &&
    comprehensiveRank !== null &&
    comprehensiveRank > comprehensiveTotal
  ) {
    addBusinessIssue(context, 12, "排名名次不能大于排名总人数", "请核对排名名次");
  }
};

const validateNationalAwardGroups = (context: AwardBusinessContext) => {
  [19, 23, 27, 31].forEach((startIndex, groupIndex) => {
    const groupValues = [0, 1, 2, 3].map((offset) => toText(getBusinessValue(context, startIndex + offset)));
    if (groupValues.every((value) => value === "")) return;

    const labels = ["获奖年份", "获奖月份", "获奖名称", "颁奖单位"];
    groupValues.forEach((value, offset) => {
      if (!value) {
        addBusinessIssue(
          context,
          startIndex + offset,
          `第 ${groupIndex + 1} 组获奖信息不完整`,
          `请补充第 ${groupIndex + 1} 组${labels[offset]}`
        );
      }
    });

    if (groupValues[0] && !/^\d{4}$/.test(groupValues[0])) {
      addBusinessIssue(context, startIndex, "获奖年份必须为 4 位年份", "请填写 4 位获奖年份");
    }
    if (
      groupValues[1] &&
      (!/^\d{1,2}$/.test(groupValues[1]) ||
        Number(groupValues[1]) < 1 ||
        Number(groupValues[1]) > 12)
    ) {
      addBusinessIssue(context, startIndex + 1, "获奖月份必须为 1~12", "请填写 1~12 之间的获奖月份");
    }
    [2, 3].forEach((offset) => {
      if (groupValues[offset] && ZERO_LIKE_VALUES.has(groupValues[offset])) {
        addBusinessIssue(
          context,
          startIndex + offset,
          `${labels[offset]}不得只填写“无”“否”“没有”`,
          `请填写有效的${labels[offset]}`
        );
      }
    });
  });
};

const validateNationalRules = (context: AwardBusinessContext) => {
  validateRankingRules(context, true);
  ensureTextLength(context, 13, "申请理由", 100, 180);
  ensureTextLength(context, 15, "辅导员推荐理由", 80, 100);
  ensureTextLength(context, 17, "院系意见", 50, 100);

  const applicationDate = ensureDate(context, 14, "申请日期");
  const counselorDate = ensureDate(context, 16, "辅导员推荐日期");
  const departmentDate = ensureDate(context, 18, "院系日期");
  if (applicationDate !== null && counselorDate !== null && applicationDate > counselorDate) {
    addBusinessIssue(context, 16, "辅导员推荐日期不能早于申请日期", "请核对辅导员推荐日期");
  }
  if (counselorDate !== null && departmentDate !== null && counselorDate > departmentDate) {
    addBusinessIssue(context, 18, "院系日期不能早于辅导员推荐日期", "请核对院系日期");
  }

  validateNationalAwardGroups(context);
};

const estimateRewardCount = (value: unknown) => {
  const text = toText(value);
  if (!text) return 0;
  const splitCount = text.split(/[\r\n；;、]+/).map((item) => item.trim()).filter(Boolean).length;
  const sequenceCount = text.match(/(?:^|[\s；;、])\d+[.、）)]/g)?.length || 0;
  return Math.max(splitCount, sequenceCount, 1);
};

const validateInspirationalRules = (context: AwardBusinessContext) => {
  validateRankingRules(context, false);

  if (estimateRewardCount(getBusinessValue(context, 13)) > 2) {
    addBusinessIssue(context, 13, "曾获何种奖励不得超过 2 条", "请将奖励信息精简为不超过 2 条");
  }

  appendEnding(context, 14, "特此申请国家励志奖学金。", "申请理由");
  ensureTextLength(context, 14, "申请理由", 100, 180);
  appendEnding(context, 16, "同意推荐其申请国家励志奖学金。", "院系意见");
  ensureTextLength(context, 16, "院系意见", 10, 50);

  const applicationDate = ensureDate(context, 15, "申请日期");
  const departmentDate = ensureDate(context, 17, "院系日期");
  if (applicationDate !== null && departmentDate !== null && applicationDate > departmentDate) {
    addBusinessIssue(context, 17, "院系日期不能早于申请日期", "请核对院系日期");
  }
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

const SHANGHAI_AWARD_ISSUERS: Record<string, string> = {
  国家奖学金: "教育部",
  国家励志奖学金: "教育部",
  上海市奖学金: "上海市教育委员会",
};

const ensureShanghaiDate = (context: AwardBusinessContext, columnIndex: number, label: string) => {
  const value = getBusinessValue(context, columnIndex);
  const parts = parseDateParts(value);

  if (!parts) {
    if (!hasBusinessIssue(context, columnIndex)) {
      addBusinessIssue(context, columnIndex, `${label}无法解析为有效日期`, `请填写有效的${label}`);
    }
    return null;
  }

  const [year, month, day] = parts;
  const formatted = `${year}/${month}/${day}`;
  setBusinessValue(context, columnIndex, formatted, `${label}已统一为 YYYY/M/D 格式`);
  return Number(`${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`);
};

const validateShanghaiBasicFields = (context: AwardBusinessContext) => {
  const studentName = toText(getBusinessValue(context, 0));
  if (!studentName) {
    addBusinessIssue(context, 0, "学生姓名必填", "请填写学生姓名");
  } else if (!/^[\u4e00-\u9fa5·A-Za-z]{1,20}$/.test(studentName)) {
    addBusinessIssue(
      context,
      0,
      "学生姓名必须为 1~20 个汉字，可包含 · 和大小写字母",
      "请核对学生姓名格式"
    );
  }

  const idCard = toText(getBusinessValue(context, 1)).toUpperCase();
  setBusinessValue(context, 1, idCard, "身份证号中的字母已规范为大写");
  if (!/^\d{17}[\dX]$/.test(idCard) || !isValidIdCard(idCard)) {
    addBusinessIssue(context, 1, "身份证号必须为合法的 18 位号码", "请核对身份证号位数和校验位");
  }

  const phone = normalizeFullWidthSymbols(toText(getBusinessValue(context, 2))).replace(/[\s\-－]/g, "");
  setBusinessValue(context, 2, phone, "联系电话中的空格和横杠已自动移除");
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    addBusinessIssue(context, 2, "联系电话必须为 11 位手机号", "请填写有效的 11 位手机号");
  }

  const department = toText(getBusinessValue(context, 3));
  if (!department) {
    addBusinessIssue(context, 3, "院系名称必填", "请填写院系名称");
  } else if (department.length > 100) {
    addBusinessIssue(context, 3, "院系名称不得超过 100 字符", "请精简院系名称");
  }

  const politicalStatus = toText(getBusinessValue(context, 4));
  if (!politicalStatus) {
    addBusinessIssue(context, 4, "政治面貌必填", "请填写政治面貌");
  } else if (!SHANGHAI_POLITICAL_STATUS.includes(politicalStatus)) {
    addBusinessIssue(
      context,
      4,
      `政治面貌不在允许范围内：${SHANGHAI_POLITICAL_STATUS.join("、")}`,
      "请从允许的政治面貌中选择"
    );
  }
};

const validateShanghaiRankingRules = (context: AwardBusinessContext) => {
  const courseCount = ensureInteger(context, 7, "必修课程数量");
  const passedCourseCount = ensureInteger(context, 8, "及格课程数量");
  const gradeTotal = ensureInteger(context, 9, "成绩排名总人数");
  const gradeRank = ensureInteger(context, 10, "成绩排名名次");
  const comprehensiveRanking = ensureYesNo(context, 11, "实行综合排名");
  const comprehensiveTotal = ensureInteger(context, 12, "排名总人数", comprehensiveRanking === "是");
  const comprehensiveRank = ensureInteger(context, 13, "排名名次", comprehensiveRanking === "是");

  if (courseCount !== null && passedCourseCount !== null && courseCount !== passedCourseCount) {
    const reason = "必修课程数量必须等于及格课程数量";
    addBusinessIssue(context, 7, reason, "请核对必修课程数量");
    addBusinessIssue(context, 8, reason, "请核对及格课程数量");
  }
  if (gradeTotal !== null && gradeRank !== null && gradeRank > gradeTotal) {
    addBusinessIssue(context, 10, "成绩排名名次不能大于成绩排名总人数", "请核对成绩排名名次");
  }
  if (
    comprehensiveRanking === "是" &&
    gradeTotal !== null &&
    comprehensiveTotal !== null &&
    comprehensiveTotal !== gradeTotal
  ) {
    addBusinessIssue(context, 12, "排名总人数必须等于成绩排名总人数", "请将排名总人数与成绩排名总人数保持一致");
  }
  if (
    comprehensiveTotal !== null &&
    comprehensiveRank !== null &&
    comprehensiveRank > comprehensiveTotal
  ) {
    addBusinessIssue(context, 13, "排名名次不能大于排名总人数", "请核对排名名次");
  }
};

const validateShanghaiAwardGroups = (context: AwardBusinessContext) => {
  [20, 24, 28, 32].forEach((startIndex, groupIndex) => {
    const groupValues = [0, 1, 2, 3].map((offset) => toText(getBusinessValue(context, startIndex + offset)));
    if (groupValues.every((value) => value === "")) return;

    const labels = ["获奖年份", "获奖月份", "获奖名称", "颁奖单位"];
    groupValues.forEach((value, offset) => {
      if (!value) {
        addBusinessIssue(
          context,
          startIndex + offset,
          `第 ${groupIndex + 1} 组获奖信息不完整`,
          `请补充第 ${groupIndex + 1} 组${labels[offset]}`
        );
      }
    });

    if (groupValues[0] && !/^\d{4}$/.test(groupValues[0])) {
      addBusinessIssue(context, startIndex, "获奖年份必须为 4 位年份", "请填写 4 位获奖年份");
    }
    if (
      groupValues[1] &&
      (!/^\d{1,2}$/.test(groupValues[1]) ||
        Number(groupValues[1]) < 1 ||
        Number(groupValues[1]) > 12)
    ) {
      addBusinessIssue(context, startIndex + 1, "获奖月份必须为 1~12", "请填写 1~12 之间的获奖月份");
    }

    [2, 3].forEach((offset) => {
      const value = groupValues[offset];
      if (!value) return;
      if (ZERO_LIKE_VALUES.has(value)) {
        addBusinessIssue(
          context,
          startIndex + offset,
          `${labels[offset]}不得只填写“无”“否”“没有”`,
          `请填写有效的${labels[offset]}`
        );
      } else if (value.length <= 1 || value.length > 88) {
        addBusinessIssue(
          context,
          startIndex + offset,
          `${labels[offset]}长度必须大于 1 且不超过 88 字符`,
          `请核对${labels[offset]}长度`
        );
      }
    });

    const expectedIssuer = SHANGHAI_AWARD_ISSUERS[groupValues[2]];
    if (expectedIssuer && groupValues[3] && groupValues[3] !== expectedIssuer) {
      addBusinessIssue(
        context,
        startIndex + 3,
        `${groupValues[2]}的颁奖单位应为“${expectedIssuer}”`,
        `请将颁奖单位修改为“${expectedIssuer}”`
      );
    }
  });
};

const validateShanghaiRules = (context: AwardBusinessContext) => {
  validateShanghaiBasicFields(context);
  validateShanghaiRankingRules(context);

  appendEnding(context, 14, "特此申请上海市奖学金。", "申请理由");
  const applicationReason = toText(getBusinessValue(context, 14));
  if (applicationReason && !/(我|本人)/.test(applicationReason)) {
    addBusinessIssue(context, 14, "申请理由必须使用第一视角", "请使用“我”或“本人”等第一视角表述");
  }
  ensureTextLength(context, 14, "申请理由", 180, 200);

  appendEnding(context, 16, "推荐其申请上海市奖学金。", "辅导员推荐理由");
  ensureTextLength(context, 16, "辅导员推荐理由", 80, 100);

  const departmentOpinion = toText(getBusinessValue(context, 18));
  if (departmentOpinion === "同意" || departmentOpinion === "同意推荐") {
    addBusinessIssue(context, 18, "院系意见不能只写“同意”或“同意推荐”", "请补充完整的院系意见");
  }
  appendEnding(context, 18, "同意推荐其申请上海市奖学金。", "院系意见");
  ensureTextLength(context, 18, "院系意见", 50, 100);

  const applicationDate = ensureShanghaiDate(context, 15, "申请日期");
  const counselorDate = ensureShanghaiDate(context, 17, "辅导员推荐日期");
  const departmentDate = ensureShanghaiDate(context, 19, "院系日期");
  if (applicationDate !== null && counselorDate !== null && applicationDate > counselorDate) {
    addBusinessIssue(context, 17, "辅导员推荐日期不能早于申请日期", "请核对辅导员推荐日期");
  }
  if (counselorDate !== null && departmentDate !== null && counselorDate > departmentDate) {
    addBusinessIssue(context, 19, "院系日期不能早于辅导员推荐日期", "请核对院系日期");
  }

  validateShanghaiAwardGroups(context);
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

export const parseAwardWorkbook = (workbookData: WorkbookData): AwardTemplate => {
  const outputSheet =
    workbookData.sheetNames.find((name) => name === "上海市奖学金申请档案") ||
    workbookData.sheetNames.find((name) => (workbookData.sheets[name] || []).length >= 2) ||
    workbookData.sheetNames[0];
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

  sourceRows.forEach((sourceRow, sourceRowIndex) => {
    if (sourceRow.every((cell) => isBlank(cell))) return;

    const excelRowNumber = sourceRowIndex + 3;
    const values: Record<string, unknown> = {};
    const rowIssues: AwardIssue[] = [];

    rules.forEach((rule) => {
      const originalValue = sourceRow[rule.columnIndex];
      const valueToCheck = awardType === "national" && rule.columnIndex === 10 ? "是" : originalValue;
      if (awardType === "national" && rule.columnIndex === 10 && !valuesEqual(originalValue, "是")) {
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
  template,
  result,
  exportMode,
}: {
  template: AwardTemplate;
  result: AwardProcessResult;
  exportMode: "passed" | "failed";
}) => {
  const workbook = XLSX.utils.book_new();

  if (exportMode === "passed") {
    XLSX.utils.book_append_sheet(workbook, makeAwardSheet({ template, rows: result.passedRows }), "通过名单");
  } else {
    XLSX.utils.book_append_sheet(
      workbook,
      makeAwardSheet({ template, rows: result.failedRows, issues: result.issues }),
      "不通过名单"
    );
    XLSX.utils.book_append_sheet(workbook, makeIssueSheet(result.issues), "问题说明");
  }

  XLSX.writeFile(workbook, `三大奖${exportMode === "passed" ? "通过名单" : "不通过名单"}_${Date.now()}.xlsx`);
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
  collegeName,
  fields,
  result,
}: {
  awardType: AwardType;
  collegeName: string;
  fields: string[];
  result: AwardProcessResult;
}): AwardSubmission => ({
  id: crypto.randomUUID(),
  awardType,
  collegeName,
  createdAt: new Date().toISOString(),
  rowCount: result.passedRows.length,
  awardTypeCounts: buildAwardTypeCounts(result.passedRows, fields),
  rows: result.passedRows.map((row) => row.values),
});

export const getAwardSubmissions = (awardType: AwardType): AwardSubmission[] => {
  try {
    return JSON.parse(localStorage.getItem(awardStorageKeys[awardType]) || "[]") as AwardSubmission[];
  } catch {
    return [];
  }
};

export const saveAwardSubmission = (awardType: AwardType, submission: AwardSubmission) => {
  const submissions = getAwardSubmissions(awardType);
  localStorage.setItem(awardStorageKeys[awardType], JSON.stringify([...submissions, submission]));
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
