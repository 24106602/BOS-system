// 本专科困难生单列规则：集中处理 L、P、S、T、U、W、AK 等列的专项校验和修复。

import type { CheckResult } from "./types";
import {
  compressText,
  disabilityCategoryList,
  fixDisabilityCategory,
  formatIncomeNumber,
  isZeroLikeText,
  normalizeText,
  parseAmountToNumber,
  trimIntegerToSixDigits,
} from "../utils/validators";

export const checkFamilyIncomeLColumn = (originalRawValue: unknown): CheckResult => {
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

export const checkUnexpectedEventPColumn = (originalRawValue: unknown): CheckResult => {
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

export const checkDebtAmountSColumn = (originalRawValue: unknown): CheckResult => {
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

export const checkDebtReasonTColumn = (originalRawValue: unknown): CheckResult => {
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

export const checkOtherEconomicInfoUColumn = (originalRawValue: unknown): CheckResult => {
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

export const checkWColumnOnlyLength = (originalRawValue: unknown): CheckResult => {
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

export const checkDisabilityCategoryAKColumn = (originalRawValue: unknown): CheckResult => {
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
