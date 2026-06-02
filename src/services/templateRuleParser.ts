import type { AwardDateFormat, AwardFieldRule, AwardRuleKind } from "../types/award";

const compact = (value: unknown) => String(value ?? "").replace(/\s+/g, "").trim();

const normalizePunctuation = (value: string) =>
  value
    .replace(/[，,；;]/g, "、")
    .replace(/[：:]/g, "：")
    .replace(/[（(]/g, "（")
    .replace(/[）)]/g, "）");

const parseMaxLength = (text: string) => {
  const matched = text.match(/(?:最多|不超过|限|限制|最大)\s*(\d+)\s*(?:个)?字/);
  return matched ? Number(matched[1]) : undefined;
};

const parseDateFormat = (text: string): AwardDateFormat => {
  const upper = text.toUpperCase();
  if (/YYYY\s*[-－]\s*MM\s*[-－]\s*DD/.test(upper) || /\d{4}-\d{1,2}-\d{1,2}/.test(text)) {
    return "YYYY-MM-DD";
  }
  if (/YYYY\s*[/／]\s*MM\s*[/／]\s*DD/.test(upper) || /\d{4}\/\d{1,2}\/\d{1,2}/.test(text)) {
    return "YYYY/MM/DD";
  }
  return "YYYYMMDD";
};

const parseEnumValues = (text: string) => {
  const normalized = normalizePunctuation(text);
  const matched = normalized.match(/(?:只能是|只能填写|仅限(?:填写)?|可选(?:值)?(?:为|是)?)[：]?\s*([^。；\n]+)/);
  if (!matched) return [];

  return matched[1]
    .split(/[、，,/／|]/)
    .map((item) => item.replace(/[。；;]+$/, "").trim())
    .filter(Boolean);
};

const inferRuleKind = (field: string, requirement: string, enumValues: string[]): AwardRuleKind => {
  const text = `${field} ${requirement}`;
  if (/身份证|居民身份证|证件号码/.test(text)) return "idCard";
  if (/学号|学生编号/.test(text)) return "studentId";
  if (/日期|时间|YYYY|年.?月.?日/i.test(text)) return "date";
  if (/是否|是\s*[/／、]\s*否|只能(?:填写|是)?\s*是[、，,/／]否/.test(text)) return "yesNo";
  if (enumValues.length > 0) return "enum";
  if (/填写数字|数字填写|金额|人数|数量|人次|分数|名额|总数|小计/.test(text)) return "number";
  return "text";
};

const isRequired = (field: string, requirement: string) => {
  if (/非必填|选填|可不填|无需填写|非必须/.test(requirement)) return false;
  return /必填|必须填写|不能为空|不得为空/.test(requirement) || /[（(]?\*[）)]?/.test(field);
};

export const parseTemplateRule = (
  field: string,
  requirement: unknown,
  columnIndex: number
): AwardFieldRule => {
  const requirementText = String(requirement ?? "").trim();
  const enumValues = parseEnumValues(requirementText);
  const kind = inferRuleKind(field, requirementText, enumValues);

  return {
    field,
    columnIndex,
    requirement: requirementText,
    required: isRequired(field, requirementText),
    kind,
    maxLength: parseMaxLength(compact(requirementText)),
    enumValues: kind === "enum" ? enumValues : undefined,
    dateFormat: kind === "date" ? parseDateFormat(requirementText) : undefined,
  };
};

export const parseTemplateRules = (requirements: unknown[], fields: string[]) =>
  fields.map((field, columnIndex) => parseTemplateRule(field, requirements[columnIndex], columnIndex));
