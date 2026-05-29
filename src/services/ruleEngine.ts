import type { RuleResult } from "../types/process";
import {
  normalizeAmount,
  normalizeIdCard,
  normalizePhone,
  normalizePostcode,
  normalizeText,
} from "../utils/formatters";
import {
  isRequiredByRule,
  isValidIdCard,
  isValidPhone,
  isValidPostcode,
  shouldBeNumber,
} from "../utils/validators";

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

export function evaluateCellRule(
  fieldName: string,
  ruleText: string,
  value: unknown,
  rowIndex: number
): RuleResult {
  const field = normalizeText(fieldName);
  const rule = normalizeText(ruleText);
  const textValue = normalizeText(value);

if (isRequiredByRule(field, rule) && !textValue) {
    return {
      valid: false,
      fixedValue: value,
      level: "error",
      color: "red",
      message: "必填项为空",
      issue: {
        rowIndex,
        fieldName,
        originalValue: value,
        fixedValue: value,
        level: "error",
        color: "red",
        message: "必填项为空",
        action: "blocked",
      },
    };
  }

  if (includesAny(field + rule, ["身份证", "证件号"])) {
    const fixed = normalizeIdCard(value);
    const valid = isValidIdCard(fixed);
    return {
      valid,
      fixedValue: fixed,
      level: valid ? (fixed !== textValue ? "fixed" : "pass") : "error",
      color: valid ? (fixed !== textValue ? "yellow" : undefined) : "red",
      message: valid ? "身份证号校验通过" : "身份证号格式或校验码错误",
    };
  }

  if (includesAny(field + rule, ["手机", "联系电话", "电话"])) {
    const fixed = normalizePhone(value);
    const valid = isValidPhone(fixed);
    return {
      valid,
      fixedValue: fixed,
      level: valid ? (fixed !== textValue ? "fixed" : "pass") : "error",
      color: valid ? (fixed !== textValue ? "yellow" : undefined) : "red",
      message: valid ? "手机号校验通过" : "手机号应为11位有效数字",
    };
  }

  if (includesAny(field + rule, ["邮编", "邮政编码"])) {
    const fixed = normalizePostcode(value);
    const valid = isValidPostcode(fixed);
    return {
      valid,
      fixedValue: fixed,
      level: valid ? (fixed !== textValue ? "fixed" : "pass") : "error",
      color: valid ? (fixed !== textValue ? "yellow" : undefined) : "red",
      message: valid ? "邮政编码校验通过" : "邮政编码应为6位数字",
    };
  }

if (shouldBeNumber(field, rule)) {
    const fixed = normalizeAmount(value);
    if (fixed === "") {
      return {
        valid: false,
        fixedValue: value,
        level: "error",
        color: "red",
        message: "数字字段无法转换",
      };
    }

    return {
      valid: true,
      fixedValue: fixed,
      level: String(fixed) !== textValue ? "fixed" : "pass",
      color: String(fixed) !== textValue ? "yellow" : undefined,
      message: "数字字段校验通过",
    };
  }

  return {
    valid: true,
    fixedValue: value,
    level: "pass",
    message: "无需特殊处理",
  };
}