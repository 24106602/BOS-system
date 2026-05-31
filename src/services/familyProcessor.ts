// 家庭成员处理服务：负责家庭成员信息规则校验、困难生库匹配、待复核标记和导出。
import * as XLSX from "xlsx-js-style";
import type {
  CheckResult,
  FamilyProcessingStats,
  FamilyReviewRow,
  HighlightInfo,
  ProcessLog,
  WorkbookData,
} from "./types";
import { buildColumnMap, findHeaderRowIndex, parseRuleOptions } from "./templateParser";
import { applyHighlightStyle, cloneWorksheet } from "./excelExport";
import {
  cleanFieldName,
  extractMaxLength,
  fixHealthStatus,
  fixRelation,
  fixSchoolYear,
  fixTerm,
  isRequiredByRule,
  isValidIdCard,
  isZeroLikeText,
  normalizeText,
  parseAmountToNumber,
  shouldBeNumber,
} from "../utils/validators";

type FamilyProcessorInput = {
  familyTemplateFields: string[];
  familyTemplateFirstRow: unknown[];
  familyDictionaryMap: Record<string, string[]>;
  familyFieldDictMap: Record<string, string>;
  familySourceRows: unknown[][];
  databaseIdSet?: Set<string>;
  onLog?: (log: ProcessLog) => void;
  onProgress?: (stats: FamilyProcessingStats, status: string) => void;
};

export type FamilyProcessorResult = {
  familyProcessedData: Record<string, unknown>[];
  familyHighlightCellMap: Record<string, HighlightInfo>;
  familyReviewRows: FamilyReviewRow[];
  familyAnalysis: Record<string, number>;
  familyStats: FamilyProcessingStats;
};

const makeFamilyStats = (
  total: number,
  repaired: number,
  errors: number,
  missingFields: number,
  removedFields: number,
  highlighted: number,
  review: number,
  databaseMiss: number
): FamilyProcessingStats => ({
  total,
  repaired,
  errors,
  missingFields,
  removedFields,
  highlighted,
  review,
  databaseMiss,
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

const isFamilyRequiredField = (field: string, index: number, firstRow: unknown[]) => {
  const ruleText = String(firstRow[index] ?? "");
  return isRequiredByRule(field, ruleText);
};

const getFamilyValidList = (
  field: string,
  index: number,
  firstRow: unknown[],
  dictionaryMap: Record<string, string[]>,
  fieldDictMap: Record<string, string>
) => {
  const dictType = fieldDictMap[field];
  const dictValues = dictType ? dictionaryMap[dictType] || [] : [];
  const cleanField = cleanFieldName(field);

  if (cleanField.includes("年度") && dictionaryMap["学年"]) return dictionaryMap["学年"];
  if (cleanField.includes("学期") && dictionaryMap["学期"]) return dictionaryMap["学期"];
  if (cleanField.includes("关系") && dictionaryMap["与学生关系"]) return dictionaryMap["与学生关系"];
  if (cleanField.includes("健康") && dictionaryMap["健康状况"]) return dictionaryMap["健康状况"];

  const ruleText = String(firstRow[index] ?? "");
  const ruleOptions = ruleText.includes("下拉选择") ? parseRuleOptions(ruleText) : [];
  return Array.from(new Set([...dictValues, ...ruleOptions].filter(Boolean)));
};

const checkShortRequiredText = (
  field: string,
  columnIndex: number,
  originalRawValue: unknown,
  maxLength: number,
  firstRow: unknown[]
): CheckResult => {
  const raw = String(originalRawValue ?? "").trim();
  const required = isFamilyRequiredField(field, columnIndex, firstRow);

  if (!raw) {
    return {
      value: "",
      valid: !required,
      repaired: false,
      reason: required ? "必填项为空，需要人工补充" : "非必填项为空",
      highlight: required,
      highlightColor: "yellow",
    };
  }

  const fixed = raw.replace(/\s+/g, "").slice(0, maxLength);
  return {
    value: fixed,
    valid: true,
    repaired: fixed !== raw,
    reason: fixed !== raw ? `内容超过${maxLength}个字符或含空格，已按模板要求修正` : "符合文本长度要求",
    highlight: false,
  };
};

const checkFamilyMemberName = (originalRawValue: unknown): CheckResult => {
  const raw = String(originalRawValue ?? "").trim();
  const fixed = raw.replace(/\s+/g, "");

  if (!fixed) {
    return {
      value: "",
      valid: false,
      repaired: false,
      reason: "家庭成员姓名为必填项",
      highlight: true,
      highlightColor: "yellow",
    };
  }

  const valid = /^[\u4e00-\u9fa5·]{1,20}$/.test(fixed);
  return {
    value: fixed,
    valid,
    repaired: fixed !== raw,
    reason: valid ? "姓名符合汉字和长度要求" : "姓名必须为1到20个汉字，可包含·",
    highlight: !valid,
    highlightColor: "yellow",
  };
};

const checkFamilyAge = (originalRawValue: unknown): CheckResult => {
  const raw = String(originalRawValue ?? "").trim();
  const num = parseAmountToNumber(raw);

  if (num === null || Number.isNaN(num)) {
    return {
      value: raw,
      valid: false,
      repaired: false,
      reason: "家庭成员年龄必须填写数字",
      highlight: true,
      highlightColor: "yellow",
    };
  }

  const fixedNumber = Math.floor(num);
  const fixed = String(fixedNumber);
  const valid = fixedNumber >= 0 && fixedNumber <= 120;
  return {
    value: fixed,
    valid,
    repaired: fixed !== raw,
    reason: valid ? "年龄已按整数处理" : "年龄需在0到120之间",
    highlight: !valid,
    highlightColor: "yellow",
  };
};

const checkFamilyIncome = (originalRawValue: unknown): CheckResult => {
  const raw = String(originalRawValue ?? "").trim();

  if (isZeroLikeText(raw)) {
    return {
      value: "0",
      valid: true,
      repaired: raw !== "0",
      reason: "年收入为空或无收入，已填写0",
      highlight: false,
    };
  }

  const num = parseAmountToNumber(raw);

  if (num === null || Number.isNaN(num) || num < 0) {
    return {
      value: raw,
      valid: false,
      repaired: false,
      reason: "年收入必须填写非负整数",
      highlight: true,
      highlightColor: "yellow",
    };
  }

  const fixed = String(Math.floor(num));
  return {
    value: fixed,
    valid: true,
    repaired: fixed !== raw,
    reason: fixed !== raw ? "年收入已按整数金额处理" : "年收入符合整数要求",
    highlight: false,
  };
};

const checkFamilyCellByRule = (
  field: string,
  columnIndex: number,
  originalRawValue: unknown,
  firstRow: unknown[],
  dictionaryMap: Record<string, string[]>,
  fieldDictMap: Record<string, string>
): CheckResult => {
  const cleanField = cleanFieldName(field);
  const validList = getFamilyValidList(field, columnIndex, firstRow, dictionaryMap, fieldDictMap);
  let value = String(originalRawValue ?? "").trim();

  if (cleanField.includes("年度")) {
    const fixed = fixSchoolYear(value, validList);
    const valid = validList.length === 0 || validList.some((item) => normalizeText(item) === normalizeText(fixed));
    return {
      value: fixed,
      valid,
      repaired: fixed !== value,
      reason: valid ? "年度符合字典要求" : `年度不在允许字典中：${validList.join("、")}`,
      highlight: !valid,
      highlightColor: "yellow",
    };
  }

  if (cleanField.includes("学期")) {
    const fixed = fixTerm(value, validList);
    const valid = validList.length === 0 || validList.some((item) => normalizeText(item) === normalizeText(fixed));
    return {
      value: fixed,
      valid,
      repaired: fixed !== value,
      reason: valid ? "学期符合字典要求" : `学期不在允许字典中：${validList.join("、")}`,
      highlight: !valid,
      highlightColor: "yellow",
    };
  }

  if (cleanField.includes("身份证")) {
    const fixed = value.replace(/\s+/g, "").toUpperCase();
    const valid = isValidIdCard(fixed);
    return {
      value: fixed,
      valid,
      repaired: fixed !== value,
      reason: valid ? "学生身份证号符合18位规则" : "学生身份证号必须为18位，最后一位允许X",
      highlight: !valid,
      highlightColor: "yellow",
    };
  }

  if (cleanField.includes("姓名")) return checkFamilyMemberName(value);
  if (cleanField.includes("年龄")) return checkFamilyAge(value);

  if (cleanField.includes("关系")) {
    const fixed = fixRelation(value, validList);
    const valid = validList.length === 0 || validList.some((item) => normalizeText(item) === normalizeText(fixed));
    return {
      value: fixed,
      valid,
      repaired: fixed !== value,
      reason: valid ? "与学生关系符合字典要求" : `与学生关系只能填写：${validList.join("、")}`,
      highlight: !valid,
      highlightColor: "yellow",
    };
  }

  if (cleanField.includes("工作或学习单位")) return checkShortRequiredText(field, columnIndex, value, 30, firstRow);
  if (cleanField.includes("年收入")) return checkFamilyIncome(value);
  if (cleanField.includes("职业")) return checkShortRequiredText(field, columnIndex, value, 30, firstRow);

  if (cleanField.includes("健康")) {
    const fixed = fixHealthStatus(value, validList);
    const valid = validList.length === 0 || validList.some((item) => normalizeText(item) === normalizeText(fixed));
    return {
      value: fixed,
      valid,
      repaired: fixed !== value,
      reason: valid ? "健康状况符合字典要求" : `健康状况只能填写：${validList.join("、")}`,
      highlight: !valid,
      highlightColor: "yellow",
    };
  }

  if (value === "" && isFamilyRequiredField(field, columnIndex, firstRow)) {
    return {
      value: "",
      valid: false,
      repaired: false,
      reason: "必填项为空",
      highlight: true,
      highlightColor: "yellow",
    };
  }

  const ruleText = String(firstRow[columnIndex] ?? "");
  const maxLength = extractMaxLength(ruleText);
  if (maxLength && value.length > maxLength) {
    value = value.slice(0, maxLength);
    return {
      value,
      valid: true,
      repaired: true,
      reason: `超过${maxLength}个字符，已截断`,
      highlight: false,
    };
  }

  return {
    value,
    valid: true,
    repaired: value !== String(originalRawValue ?? "").trim(),
    reason: "符合家庭成员模板规则",
    highlight: false,
  };
};

const finalFamilyRequiredValidation = (
  result: Record<string, unknown>[],
  highlightMap: Record<string, HighlightInfo>,
  fieldErrors: Record<string, number>,
  familyTemplateFields: string[],
  familyTemplateFirstRow: unknown[]
) => {
  let marked = 0;

  result.forEach((row, rowIndex) => {
    familyTemplateFields.forEach((field, colIndex) => {
      const value = String(row[field] ?? "").trim();
      if (!isFamilyRequiredField(field, colIndex, familyTemplateFirstRow) || value !== "") return;
      const key = `${rowIndex}_${colIndex}`;
      if (!highlightMap[key]) marked++;
      addMark(highlightMap, rowIndex, colIndex, "yellow", "最终复检：必填项处理后仍为空，需要人工复核");
      fieldErrors[field] = (fieldErrors[field] || 0) + 1;
    });
  });

  return marked;
};

const markFamilyDuplicates = (
  result: Record<string, unknown>[],
  highlightMap: Record<string, HighlightInfo>,
  fieldErrors: Record<string, number>,
  familyTemplateFields: string[]
) => {
  const seen = new Map<string, number>();
  let marked = 0;

  result.forEach((row, rowIndex) => {
    const studentId = normalizeText(row[familyTemplateFields[2]]);
    const memberName = normalizeText(row[familyTemplateFields[3]]);
    const relation = normalizeText(row[familyTemplateFields[5]]);
    if (!studentId || !memberName || !relation) return;

    const key = `${studentId}|${memberName}|${relation}`;
    const firstIndex = seen.get(key);
    if (firstIndex === undefined) {
      seen.set(key, rowIndex);
      return;
    }

    const reason = `疑似重复家庭成员：第${firstIndex + 1}行已出现同一学生、姓名和关系`;
    [2, 3, 5].forEach((colIndex) => {
      const markKey = `${rowIndex}_${colIndex}`;
      if (!highlightMap[markKey]) marked++;
      addMark(highlightMap, rowIndex, colIndex, "yellow", reason);
      fieldErrors[familyTemplateFields[colIndex]] = (fieldErrors[familyTemplateFields[colIndex]] || 0) + 1;
    });
  });

  return marked;
};

const buildFamilyReviewListFromHighlights = (
  result: Record<string, unknown>[],
  highlightMap: Record<string, HighlightInfo>,
  familyTemplateFields: string[]
) => {
  const list: FamilyReviewRow[] = [];

  result.forEach((row, rowIndex) => {
    const entries = Object.entries(highlightMap).filter(([key]) => key.startsWith(`${rowIndex}_`));
    if (entries.length === 0) return;

    const reasons = entries.map(([key, info]) => {
      const colIndex = Number(key.split("_")[1]);
      const fieldName = familyTemplateFields[colIndex] || `第${colIndex + 1}列`;
      return `${fieldName}：${info.reason}`;
    });

    list.push({
      rowNumber: rowIndex + 1,
      studentId: String(row[familyTemplateFields[2]] ?? ""),
      memberName: String(row[familyTemplateFields[3]] ?? ""),
      relation: String(row[familyTemplateFields[5]] ?? ""),
      reason: Array.from(new Set(reasons)).join("；"),
    });
  });

  return list;
};

export const processFamilyRows = async ({
  familyTemplateFields,
  familyTemplateFirstRow,
  familyDictionaryMap,
  familyFieldDictMap,
  familySourceRows,
  databaseIdSet,
  onLog,
  onProgress,
}: FamilyProcessorInput): Promise<FamilyProcessorResult> => {
  const headerIndex = findHeaderRowIndex(familySourceRows, familyTemplateFields);
  const headers = (familySourceRows[headerIndex] || []).map((item) => String(item ?? "").trim());
  const sourceDataRows = familySourceRows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
  const { columnMap, removedHeaders } = buildColumnMap(headers, familyTemplateFields);

  onLog?.({
    type: "info",
    message: `开始执行【家庭成员信息处理】

本次规则：
按模板10列输出；
按字典修正年度、学期、关系、健康状况；
提供困难生数据库时会检索学生身份证号；
重复家庭成员会标记为待复核。`,
  });

  if (databaseIdSet) {
    if (databaseIdSet.size === 0) {
      onLog?.({ type: "error", message: "困难生数据库为空，本次无法校验学生是否已入库，只执行模板字段规则。" });
    } else {
      onLog?.({ type: "success", message: `已读取困难生数据库：${databaseIdSet.size} 个身份证号可用于检索。` });
    }
  }

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
  let databaseMissCount = 0;
  const fieldErrors: Record<string, number> = {};
  const result: Record<string, unknown>[] = [];
  const highlightMap: Record<string, HighlightInfo> = {};

  for (let i = 0; i < sourceDataRows.length; i++) {
    const sourceRow = sourceDataRows[i];
    const outputRow: Record<string, unknown> = {};

    for (const mapItem of columnMap) {
      const field = mapItem.templateField;
      const colIndex = mapItem.templateIndex;
      const required = isFamilyRequiredField(field, colIndex, familyTemplateFirstRow);

      if (mapItem.sourceIndex < 0) {
        missingFieldCount++;
        outputRow[field] = "";
        if (required) {
          errorCount++;
          fieldErrors[field] = (fieldErrors[field] || 0) + 1;
          addMark(highlightMap, i, colIndex, "yellow", "源数据缺少该必填字段");
        }
        continue;
      }

      const originalValue = sourceRow[mapItem.sourceIndex];
      const checked = checkFamilyCellByRule(
        field,
        colIndex,
        originalValue,
        familyTemplateFirstRow,
        familyDictionaryMap,
        familyFieldDictMap
      );
      outputRow[field] = checked.value;

      if (checked.repaired) {
        repairedCount++;
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
        onLog?.({
          type: "error",
          message: `第 ${i + 1} 行 第 ${colIndex + 1} 列 ${field}
问题值：${String(originalValue ?? "").trim()}
原因：${checked.reason}`,
        });
      }

      if (checked.highlight) addMark(highlightMap, i, colIndex, checked.highlightColor || "yellow", checked.reason);
    }

    const studentIdField = familyTemplateFields[2];
    const studentId = normalizeText(outputRow[studentIdField]);
    if (databaseIdSet && databaseIdSet.size > 0 && studentId && !databaseIdSet.has(studentId)) {
      databaseMissCount++;
      errorCount++;
      fieldErrors[studentIdField] = (fieldErrors[studentIdField] || 0) + 1;
      addMark(highlightMap, i, 2, "red", "学生身份证号未在困难生数据库中检索到，需要核对是否属于困难生名单");
      onLog?.({ type: "error", message: `第 ${i + 1} 行 学生身份证号未命中困难生数据库：${outputRow[studentIdField]}` });
    }

    result.push(outputRow);
    onProgress?.(
      makeFamilyStats(
        sourceDataRows.length,
        repairedCount,
        errorCount,
        missingFieldCount,
        removedHeaders.length,
        Object.keys(highlightMap).length,
        buildFamilyReviewListFromHighlights(result, highlightMap, familyTemplateFields).length,
        databaseMissCount
      ),
      `处理中 ${i + 1} / ${sourceDataRows.length}`
    );
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  const duplicateMarked = markFamilyDuplicates(result, highlightMap, fieldErrors, familyTemplateFields);
  const emptyMarked = finalFamilyRequiredValidation(result, highlightMap, fieldErrors, familyTemplateFields, familyTemplateFirstRow);
  errorCount += duplicateMarked + emptyMarked;
  const reviewRows = buildFamilyReviewListFromHighlights(result, highlightMap, familyTemplateFields);
  const stats = makeFamilyStats(
    sourceDataRows.length,
    repairedCount,
    errorCount,
    missingFieldCount,
    removedHeaders.length,
    Object.keys(highlightMap).length,
    reviewRows.length,
    databaseMissCount
  );

  onLog?.({
    type: "success",
    message: `家庭成员信息处理完成
输出数据行数：${result.length}
自动修复：${repairedCount}
异常问题：${errorCount}
标记单元格：${Object.keys(highlightMap).length}
待复核行数：${reviewRows.length}
数据库未命中：${databaseMissCount}`,
  });

  return {
    familyProcessedData: result,
    familyHighlightCellMap: highlightMap,
    familyReviewRows: reviewRows,
    familyAnalysis: fieldErrors,
    familyStats: stats,
  };
};

const shouldWriteFamilyNumberCell = (field: string, columnIndex: number, firstRow: unknown[]) => {
  const cleanField = cleanFieldName(field);
  const ruleText = String(firstRow[columnIndex] ?? "");
  return cleanField.includes("年龄") || cleanField.includes("年收入") || shouldBeNumber(field, ruleText);
};

export const exportFamilyExcel = ({
  familyProcessedData,
  familyTemplateWorkbook,
  familyTemplateOutputSheet,
  familyTemplateDictSheet,
  familyTemplateFields,
  familyTemplateFirstRow,
  familyHighlightCellMap,
  familyReviewRows,
  familyCollegeName = "",
  exportMode = "all",
}: {
  familyProcessedData: Record<string, unknown>[];
  familyTemplateWorkbook: WorkbookData;
  familyTemplateOutputSheet: string;
  familyTemplateDictSheet: string;
  familyTemplateFields: string[];
  familyTemplateFirstRow: unknown[];
  familyHighlightCellMap: Record<string, HighlightInfo>;
  familyReviewRows: FamilyReviewRow[];
  familyCollegeName?: string;
  exportMode?: "all" | "passed" | "failed";
}) => {
  const originalSheet = familyTemplateWorkbook.worksheets[familyTemplateOutputSheet];
  if (!originalSheet) throw new Error("家庭成员模板输出表不存在");
  const worksheet = cloneWorksheet(originalSheet);

  Object.keys(worksheet).forEach((address) => {
    if (!/^[A-Z]+[0-9]+$/.test(address)) return;
    const cell = XLSX.utils.decode_cell(address);
    if (cell.r >= 2 || cell.c >= familyTemplateFields.length) delete (worksheet as Record<string, unknown>)[address];
  });

  familyProcessedData.forEach((row, rowIndex) => {
    familyTemplateFields.forEach((field, colIndex) => {
      const address = XLSX.utils.encode_cell({ r: rowIndex + 2, c: colIndex });
      const sampleAddress = XLSX.utils.encode_cell({ r: 2, c: colIndex });
      const headerAddress = XLSX.utils.encode_cell({ r: 1, c: colIndex });
      const sampleCell = (originalSheet as Record<string, { s?: unknown }>)[sampleAddress] ||
        (originalSheet as Record<string, { s?: unknown }>)[headerAddress];
      const value = row[field] ?? "";
      let cell: Record<string, unknown> = { v: value, t: "s" };

      if (shouldWriteFamilyNumberCell(field, colIndex, familyTemplateFirstRow) && value !== "" && !Number.isNaN(Number(value))) {
        cell = { ...cell, v: Number(value), t: "n" };
      }
      if (sampleCell?.s) cell.s = { ...(sampleCell.s as Record<string, unknown>) };
      cell = applyHighlightStyle(cell, familyHighlightCellMap[`${rowIndex}_${colIndex}`]);
      (worksheet as Record<string, unknown>)[address] = cell;
    });
  });

  worksheet["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: familyProcessedData.length + 1, c: familyTemplateFields.length - 1 },
  });
  worksheet["!cols"] = originalSheet["!cols"] || familyTemplateFields.map(() => ({ wch: 24 }));
  if (originalSheet["!rows"]) worksheet["!rows"] = JSON.parse(JSON.stringify(originalSheet["!rows"]));

  const workbook = XLSX.utils.book_new();
  if (exportMode === "all") {
    XLSX.utils.book_append_sheet(workbook, worksheet, familyTemplateOutputSheet || "家庭成员处理结果");
  }

  if (exportMode === "all" && familyTemplateDictSheet && familyTemplateWorkbook.worksheets[familyTemplateDictSheet]) {
    XLSX.utils.book_append_sheet(
      workbook,
      cloneWorksheet(familyTemplateWorkbook.worksheets[familyTemplateDictSheet]),
      familyTemplateDictSheet
    );
  }

  const failRowNumberSet = new Set(familyReviewRows.map((item) => item.rowNumber));
  const passedRows = familyProcessedData.filter((_, index) => !failRowNumberSet.has(index + 1));
  const passedSheet = XLSX.utils.json_to_sheet(passedRows, { header: familyTemplateFields });
  passedSheet["!cols"] = familyTemplateFields.map(() => ({ wch: 18 }));
  if (exportMode !== "failed") XLSX.utils.book_append_sheet(workbook, passedSheet, "通过名单");

  const failedRows = familyProcessedData
    .map((row, rowIndex) => ({ row, rowIndex }))
    .filter(({ rowIndex }) => failRowNumberSet.has(rowIndex + 1));
  const failSheet = XLSX.utils.json_to_sheet(failedRows.map(({ row }) => row), { header: familyTemplateFields });
  failSheet["!cols"] = familyTemplateFields.map(() => ({ wch: 18 }));
  failedRows.forEach(({ rowIndex }, failIndex) => {
    familyTemplateFields.forEach((_, colIndex) => {
      if (!familyHighlightCellMap[`${rowIndex}_${colIndex}`]) return;
      const address = XLSX.utils.encode_cell({ r: failIndex + 1, c: colIndex });
      const cell = (failSheet as Record<string, Record<string, unknown>>)[address] || { v: "", t: "s" };
      (failSheet as Record<string, Record<string, unknown>>)[address] = applyHighlightStyle(cell, {
        color: "yellow",
        reason: familyHighlightCellMap[`${rowIndex}_${colIndex}`].reason,
      });
    });
  });
  if (exportMode !== "passed") XLSX.utils.book_append_sheet(workbook, failSheet, "不通过名单");

  const issueEntries = Object.entries(familyHighlightCellMap)
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
          ["行号", "学院", "姓名", "学号", "身份证号", "错误字段", "原值", "错误原因", "严重程度", "修改建议"],
          ...issueEntries.map(({ rowIndex, colIndex, info }) => {
            const fieldName = familyTemplateFields[colIndex] || `第${colIndex + 1}列`;
            return [
              rowIndex + 1,
              familyCollegeName,
              familyProcessedData[rowIndex]?.[familyTemplateFields[3]] ?? "",
              "",
              familyProcessedData[rowIndex]?.[familyTemplateFields[2]] ?? "",
              fieldName,
              familyProcessedData[rowIndex]?.[fieldName] ?? "",
              info.reason,
              "error",
              "请按错误原因核对并修改该字段",
            ];
          }),
        ];
  const issueSheet = XLSX.utils.aoa_to_sheet(issueSheetRows);
  issueSheet["!cols"] = [
    { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 24 },
    { wch: 18 }, { wch: 20 }, { wch: 60 }, { wch: 12 }, { wch: 42 },
  ];
  if (exportMode !== "passed") XLSX.utils.book_append_sheet(workbook, issueSheet, "问题说明");

  XLSX.writeFile(
    workbook,
    `${exportMode === "passed" ? "家庭成员通过名单" : exportMode === "failed" ? "家庭成员不通过名单" : "家庭成员信息处理结果"}_${Date.now()}.xlsx`
  );

  return { reviewCount: familyReviewRows.length };
};
