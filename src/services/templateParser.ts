// 模板解析服务：负责读取 Excel、解析模板字段、字典值和源数据表头映射。
import * as XLSX from "xlsx-js-style";
import type { ColumnMapItem, TemplateParseResult, WorkbookData } from "./types";
import { cleanFieldName, normalizeText, parseRuleOptions } from "../utils/validators";

export const readWorkbook = (file: File): Promise<WorkbookData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const book = XLSX.read(data, {
          type: "array",
          cellDates: true,
          cellStyles: true,
          cellNF: true,
        });

        const sheets: Record<string, unknown[][]> = {};
        const worksheets: Record<string, XLSX.WorkSheet> = {};

        book.SheetNames.forEach((sheetName) => {
          const worksheet = book.Sheets[sheetName];
          worksheets[sheetName] = worksheet;
          sheets[sheetName] = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: "",
            raw: false,
          }) as unknown[][];
        });

        resolve({ book, sheetNames: book.SheetNames, sheets, worksheets });
      } catch (err) {
        reject(err);
      }
    };

    reader.readAsArrayBuffer(file);
  });
};

export const buildDictionaryFromSheet = (rows: unknown[][]) => {
  const map: Record<string, string[]> = {};

  rows.forEach((row, index) => {
    if (index === 0) return;

    const value = String(row[1] ?? "").trim();
    const type = String(row[2] ?? "").trim();

    if (!value || !type) return;

    if (!map[type]) map[type] = [];
    if (!map[type].includes(value)) map[type].push(value);
  });

  return map;
};

export const inferFieldDictMap = (
  fields: string[],
  firstRow: unknown[],
  dictionaries: Record<string, string[]>
) => {
  const result: Record<string, string> = {};
  const dictTypes = Object.keys(dictionaries);

  fields.forEach((field, index) => {
    const cleanField = cleanFieldName(field);
    const ruleText = String(firstRow[index] ?? "");

    const direct = dictTypes.find((type) => normalizeText(type) === normalizeText(cleanField));
    if (direct) {
      result[field] = direct;
      return;
    }

    const fuzzy = dictTypes.find(
      (type) =>
        normalizeText(cleanField).includes(normalizeText(type)) ||
        normalizeText(type).includes(normalizeText(cleanField))
    );

    if (fuzzy) {
      result[field] = fuzzy;
      return;
    }

    if (cleanField.includes("籍贯") && dictionaries["籍贯"]) result[field] = "籍贯";
    else if (cleanField.includes("收入来源") && dictionaries["收入来源"]) result[field] = "收入来源";
    else if (cleanField.includes("证件类型") && dictionaries["证件类型"]) result[field] = "证件类型";
    else if (cleanField.includes("性别") && dictionaries["性别"]) result[field] = "性别";
    else if (cleanField.includes("户籍性质") && dictionaries["户籍性质"]) result[field] = "户籍性质";
    else if (cleanField.includes("特殊困难") && dictionaries["特殊困难类型"]) result[field] = "特殊困难类型";
    else if (cleanField.includes("残疾类别") && dictionaries["残疾类别"]) result[field] = "残疾类别";
    else if (cleanField.includes("推荐档次") && dictionaries["推荐档次"]) result[field] = "推荐档次";
    else if (cleanField.includes("同意") && dictionaries["是否同意"]) result[field] = "是否同意";
    else if (cleanField.includes("是否") && dictionaries["是否"]) result[field] = "是否";
    else if (ruleText.includes("下拉选择年度") && dictionaries["学年"]) result[field] = "学年";
    else if (ruleText.includes("下拉选择学期") && dictionaries["学期"]) result[field] = "学期";
    else if (ruleText.includes("下拉选择关系") && dictionaries["与学生关系"]) result[field] = "与学生关系";
    else if (ruleText.includes("下拉选择健康") && dictionaries["健康状况"]) result[field] = "健康状况";
  });

  return result;
};

export const getEffectiveColumnCount = (firstRow: unknown[], secondRow: unknown[]) => {
  let count = Math.max(firstRow.length, secondRow.length);

  while (
    count > 0 &&
    String(firstRow[count - 1] ?? "").trim() === "" &&
    String(secondRow[count - 1] ?? "").trim() === ""
  ) {
    count--;
  }

  return Math.max(count, 1);
};

export const FIELD_ALIASES: Record<string, string[]> = {
  "姓名(*)": ["姓名", "学生姓名", "姓名(*)"],
  "籍贯(*)": ["籍贯", "生源地", "户籍地", "籍贯(*)"],
  "身份证号(*)": ["身份证号", "身份证件号", "证件号", "学生身份证号", "身份证号(*)"],
  "家庭人口数(*)": ["家庭人口数", "人口数", "家庭人数", "家庭人口数(*)"],
  "手机号码(*)": ["手机号码", "手机号", "联系电话", "学生联系电话", "手机号码(*)"],
  "辅导员姓名": ["辅导员姓名", "辅导员"],
  "申请日期(*)": ["申请日期", "日期", "申请日期(*)"],
  "家庭地址(*)": ["家庭地址", "家庭住址", "通讯地址", "家庭地址(*)"],
  "邮政编码(*)": ["邮政编码", "邮编", "邮政编码(*)"],
  "家长手机号码(*)": ["家长手机号码", "家长手机号", "监护人电话", "联系电话"],
  "特殊困难类型(*)": ["特殊困难类型", "困难类型", "特殊困难类型(*)"],
  "家庭年均收入(*)": ["家庭年均收入", "家庭年收入", "年收入", "收入"],
  "突发意外事件具体描述(*)": ["突发意外事件具体描述", "突发事件描述", "意外事件描述", "突发事件"],
  "家庭欠债金额(*)": ["家庭欠债金额", "欠债金额", "负债金额", "债务金额"],
  "学生家庭欠债原因": ["学生家庭欠债原因", "欠债原因", "负债原因", "家庭欠债原因"],
  "其它影响家庭经济信息": ["其它影响家庭经济信息", "其他影响家庭经济信息", "重大经济信息", "其他经济信息"],
  "陈述理由(*)": ["陈述理由", "申请理由", "困难陈述", "理由"],
  "收入来源(*)": ["收入来源", "家庭收入来源", "收入来源(*)"],
  "户籍性质(*)": ["户籍性质", "户口性质", "户籍性质(*)"],
  "劳动人口数(*)": ["劳动人口数", "劳动人数", "劳动力人口数"],
  "赡养人口数(*)": ["赡养人口数", "赡养人数", "被赡养人口数"],
  "残疾类别(*)": ["残疾类别", "残疾类型", "残疾情况"],
  "性别(*)": ["性别", "性别(*)"],
  "证件类型(*)": ["证件类型", "证件类别", "身份证件类型", "证件类型(*)"],
  "年度*": ["年度", "学年", "认定年度", "家庭成员年度"],
  "学期*": ["学期", "认定学期", "家庭成员学期"],
  "学生身份证号*": ["学生身份证号", "学生身份证件号", "身份证号", "身份证件号", "证件号"],
  "家庭成员姓名*": ["家庭成员姓名", "成员姓名", "家属姓名", "姓名"],
  "家庭成员年龄*": ["家庭成员年龄", "成员年龄", "年龄"],
  "与学生关系*": ["与学生关系", "成员关系", "家庭关系", "关系"],
  "工作或学习单位*": ["工作或学习单位", "工作单位", "学习单位", "单位", "学校"],
  "年收入（元）*": ["年收入（元）", "年收入", "个人年收入", "家庭成员年收入", "收入"],
  "职业*": ["职业", "成员职业", "工作职业"],
  "健康状况*": ["健康状况", "健康情况", "身体状况"],
};

export const headerMatchScore = (templateField: string, sourceHeader: string) => {
  const target = cleanFieldName(templateField);
  const source = cleanFieldName(sourceHeader);

  if (!target || !source) return 0;
  if (target === source) return 100;
  if (target.includes(source) || source.includes(target)) return 85;

  const aliases = FIELD_ALIASES[templateField] || FIELD_ALIASES[target] || [];
  for (const alias of aliases) {
    const a = cleanFieldName(alias);
    if (a === source || source.includes(a) || a.includes(source)) return 95;
  }

  return 0;
};

export const findHeaderRowIndex = (rows: unknown[][], fields: string[]) => {
  let bestIndex = 0;
  let bestScore = -1;

  rows.slice(0, 30).forEach((row, index) => {
    let score = 0;

    fields.forEach((field) => {
      const scores = row.map((cell) => headerMatchScore(field, String(cell ?? "")));
      const rowBest = scores.length ? Math.max(...scores) : 0;
      if (rowBest >= 80) score++;
    });

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
};

export const buildColumnMap = (headers: string[], fields: string[]) => {
  const result: ColumnMapItem[] = [];
  const usedSourceIndexes = new Set<number>();

  fields.forEach((field, templateIndex) => {
    let bestIndex = -1;
    let bestScore = 0;
    let bestHeader = "";

    headers.forEach((header, index) => {
      const score = headerMatchScore(field, header);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
        bestHeader = header;
      }
    });

    if (bestIndex >= 0 && bestScore >= 80) {
      usedSourceIndexes.add(bestIndex);
      result.push({
        templateField: field,
        templateIndex,
        sourceIndex: bestIndex,
        sourceHeader: bestHeader,
        mode: "字段匹配",
      });
    } else if (templateIndex < headers.length) {
      usedSourceIndexes.add(templateIndex);
      result.push({
        templateField: field,
        templateIndex,
        sourceIndex: templateIndex,
        sourceHeader: headers[templateIndex] || `第${templateIndex + 1}列`,
        mode: "同列兜底",
      });
    } else {
      result.push({
        templateField: field,
        templateIndex,
        sourceIndex: -1,
        sourceHeader: "",
        mode: "未匹配",
      });
    }
  });

  const removedHeaders = headers
    .map((header, index) => ({ header, index }))
    .filter((item) => String(item.header ?? "").trim() !== "")
    .filter((item) => !usedSourceIndexes.has(item.index));

  return { columnMap: result, removedHeaders };
};

const pickTemplateSheets = (workbookData: WorkbookData) => {
  const dictSheet =
    workbookData.sheetNames.find((name) => name.includes("字典")) ||
    workbookData.sheetNames[1];
  const outputSheet =
    workbookData.sheetNames.find((name) => name !== dictSheet) ||
    workbookData.sheetNames[0];

  return { dictSheet, outputSheet };
};

export const parseStudentTemplate = (workbookData: WorkbookData): TemplateParseResult => {
  const { dictSheet, outputSheet } = pickTemplateSheets(workbookData);
  const outputRows = workbookData.sheets[outputSheet] || [];
  const dictRows = workbookData.sheets[dictSheet] || [];
  const firstRow = outputRows[0] || [];
  const secondRow = outputRows[1] || [];

  const fields = secondRow.slice(0, 40).map((item, index) => {
    const value = String(item ?? "").trim();
    return value || `空字段${index + 1}`;
  });

  const dictionaries = buildDictionaryFromSheet(dictRows);
  const fieldToDict = inferFieldDictMap(fields, firstRow, dictionaries);

  return {
    workbookData,
    outputSheet,
    dictSheet,
    firstRow: firstRow.slice(0, 40),
    secondRow: secondRow.slice(0, 40),
    fields,
    dictionaries,
    fieldToDict,
  };
};

export const parseFamilyTemplate = (workbookData: WorkbookData): TemplateParseResult => {
  const { dictSheet, outputSheet } = pickTemplateSheets(workbookData);
  const outputRows = workbookData.sheets[outputSheet] || [];
  const dictRows = workbookData.sheets[dictSheet] || [];
  const firstRow = outputRows[0] || [];
  const secondRow = outputRows[1] || [];
  const columnCount = getEffectiveColumnCount(firstRow, secondRow);

  const fields = secondRow.slice(0, columnCount).map((item, index) => {
    const value = String(item ?? "").trim();
    return value || `空字段${index + 1}`;
  });

  const dictionaries = buildDictionaryFromSheet(dictRows);
  const fieldToDict = inferFieldDictMap(fields, firstRow, dictionaries);

  return {
    workbookData,
    outputSheet,
    dictSheet,
    firstRow: firstRow.slice(0, columnCount),
    secondRow: secondRow.slice(0, columnCount),
    fields,
    dictionaries,
    fieldToDict,
  };
};

export const makeSourcePreview = (rows: unknown[][], fields: string[]) => {
  if (rows.length === 0 || fields.length === 0) return [];

  const headerIndex = findHeaderRowIndex(rows, fields);
  const headers = (rows[headerIndex] || []).map((item) => String(item ?? "").trim());

  const dataRows = rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));

  return dataRows.slice(0, 30).map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, index) => {
      obj[h || `第${index + 1}列`] = row[index] ?? "";
    });
    return obj;
  });
};

export { parseRuleOptions };
