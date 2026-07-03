// 模板解析服务：负责读取 Excel、解析模板字段、字典值和源数据表头映射。
import * as XLSX from "xlsx-js-style";
import type {
  ColumnMapItem,
  DataTemplateValidationResult,
  TemplateField,
  TemplateParseResult,
  TemplateValidationResult,
  WorkbookData,
} from "./types";
import { cleanFieldName, normalizeText, parseRuleOptions } from "../utils/validators";
import {
  DIFFICULTY_STUDENT_FIELD_BINDINGS,
  getDifficultyFieldAliases,
  resolveDifficultyFieldBinding,
  type DifficultyStudentCanonicalKey,
} from "../constants/difficultyStudentTemplate";

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

    reader.onerror = () => reject(reader.error || new Error("Excel 文件读取失败"));

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

const STUDENT_HEADER_KEYWORDS = [
  "姓名",
  "学号",
  "身份证",
  "学院",
  "学部",
  "院系",
  "困难",
  "推荐档次",
];

const FAMILY_HEADER_KEYWORDS = [
  "年度",
  "学年",
  "学期",
  "学生身份证",
  "家庭成员",
  "成员姓名",
  "与学生关系",
  "关系",
  "年收入",
  "健康",
];

const toHalfWidthDigits = (value: string) =>
  value.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));

export const normalizeDifficultyHeader = (value: unknown) => {
  const normalized = toHalfWidthDigits(String(value ?? ""))
    .replace(/（[^）]*）|\([^)]*\)/g, "")
    .replace(/[\s\u00a0\u200b-\u200d\u2060\ufeff\u3000]/g, "")
    .replace(/[*＊()（）:：]/g, "")
    .toLowerCase();

  if (/^(?:学生)?姓名$/.test(normalized)) return "姓名";
  if (/^(?:家庭人口|家庭人口数|家庭人数|人口数|家庭人口总数)$/.test(normalized)) return "家庭人口数";
  if (/^(?:劳动力人口|劳动力人口数|劳动人口|劳动人口数|劳动人数)$/.test(normalized)) {
    return "劳动力人口数";
  }
  if (/^(?:赡养人口|赡养人口数|赡养人数|被赡养人口数)$/.test(normalized)) return "赡养人口数";
  if (/^(?:特殊困难类型|特殊群体类型|特殊困难群体类型|困难类型)$/.test(normalized)) {
    return "特殊困难类型";
  }

  return normalized;
};

export const DIFFICULTY_STUDENT_CORE_KEYS: readonly DifficultyStudentCanonicalKey[] = [
  "name",
  "nativePlace",
  "idCard",
  "studentId",
  "familyPopulation",
  "laborPopulation",
  "dependentPopulation",
  "specialDifficultyType",
  "finalRecommendLevel",
  "collegeRecommendLevel",
  "schoolRecommendLevel",
  "studentStatement",
  "agreesReviewGroup",
];

const CORE_FIELD_LABELS: Partial<Record<DifficultyStudentCanonicalKey, string>> = {
  name: "姓名",
  nativePlace: "籍贯",
  idCard: "身份证号",
  studentId: "学号",
  familyPopulation: "家庭人口数",
  laborPopulation: "劳动力人口数",
  dependentPopulation: "赡养人口数",
  specialDifficultyType: "特殊困难类型",
  finalRecommendLevel: "推荐档次",
  collegeRecommendLevel: "院系推荐档次",
  schoolRecommendLevel: "学校推荐档次",
  studentStatement: "陈述理由",
  agreesReviewGroup: "是否同意评议小组意见",
};

const RECOMMEND_LEVEL_KEYS = new Set<DifficultyStudentCanonicalKey>([
  "finalRecommendLevel",
  "collegeRecommendLevel",
  "schoolRecommendLevel",
]);

const WRONG_AWARD_MARKERS = [
  "国家奖学金",
  "上海市奖学金",
  "获奖",
  "奖项类型",
  "银行卡号",
  "开户行",
  "成绩排名",
  "专业排名",
];

const WRONG_FAMILY_MARKERS = [
  "家庭成员姓名",
  "家庭成员年龄",
  "与学生关系",
  "工作或学习单位",
  "健康状况",
  "成员职业",
];

const describeCoreKey = (key: DifficultyStudentCanonicalKey) => CORE_FIELD_LABELS[key] || key;

const resolveHeaderBinding = (rawHeader: string) => {
  const direct = resolveDifficultyFieldBinding(rawHeader);
  if (direct) return direct;

  const normalizedHeader = normalizeDifficultyHeader(rawHeader);
  if (!normalizedHeader) return undefined;

  const candidates = DIFFICULTY_STUDENT_FIELD_BINDINGS.flatMap((binding) =>
    [binding.fieldName, ...binding.aliases].map((alias) => ({
      binding,
      normalizedAlias: normalizeDifficultyHeader(alias),
    }))
  ).filter((item) => item.normalizedAlias)
    .sort((a, b) => b.normalizedAlias.length - a.normalizedAlias.length);

  return candidates.find(({ normalizedAlias }) => {
    if (!normalizedHeader.startsWith(normalizedAlias)) return false;
    const suffix = normalizedHeader.slice(normalizedAlias.length);
    return /^(?:填写|填报|说明|备注|要求|必填|选填|最多|不超过|请)/.test(suffix);
  })?.binding;
};

const buildTemplateFields = (row: unknown[]): TemplateField[] =>
  row.map((cell, columnIndex) => {
    const rawHeader = String(cell ?? "").trim();
    const binding = rawHeader ? resolveHeaderBinding(rawHeader) : undefined;
    return {
      rawHeader,
      normalizedHeader: normalizeDifficultyHeader(rawHeader),
      canonicalKey: binding?.canonicalKey,
      validatorKey: binding?.validatorKey,
      columnIndex,
    };
  }).filter((field) => field.rawHeader !== "");

type HeaderCandidate = {
  sheetName: string;
  headerRowIndex: number;
  fields: TemplateField[];
  canonicalCount: number;
};

const findBestStudentHeader = (workbookData: WorkbookData): HeaderCandidate | null => {
  let best: HeaderCandidate | null = null;

  workbookData.sheetNames.forEach((sheetName) => {
    const rows = workbookData.sheets[sheetName] || [];
    rows.slice(0, 10).forEach((row, headerRowIndex) => {
      const fields = buildTemplateFields(row);
      const canonicalCount = new Set(
        fields.map((field) => field.canonicalKey).filter(Boolean)
      ).size;
      if (canonicalCount === 0) return;
      if (
        !best ||
        canonicalCount > best.canonicalCount ||
        (canonicalCount === best.canonicalCount && fields.length > best.fields.length)
      ) {
        best = { sheetName, headerRowIndex, fields, canonicalCount };
      }
    });
  });

  return best;
};

const getWrongTemplateType = (fields: TemplateField[]) => {
  const headers = fields.map((field) => field.normalizedHeader);
  const awardHits = WRONG_AWARD_MARKERS.filter((marker) =>
    headers.some((header) => header.includes(normalizeDifficultyHeader(marker)))
  );
  const familyHits = WRONG_FAMILY_MARKERS.filter((marker) =>
    headers.some((header) => header.includes(normalizeDifficultyHeader(marker)))
  );

  if (awardHits.length >= 2 || awardHits.some((marker) => /奖学金|银行卡号|开户行/.test(marker))) {
    return "award";
  }
  if (familyHits.length >= 2) return "family";
  return "";
};

const getCanonicalKeys = (fields: TemplateField[]) =>
  fields
    .map((field) => field.canonicalKey)
    .filter((key): key is DifficultyStudentCanonicalKey => Boolean(key));

const uniqueInOrder = <T,>(values: T[]) => Array.from(new Set(values));

export const createTemplateSignature = (fields: TemplateField[]) =>
  uniqueInOrder(getCanonicalKeys(fields)).join("|");

const getRequiredCoreErrors = (keySet: Set<DifficultyStudentCanonicalKey>) => {
  const missing: string[] = [];
  if (!keySet.has("name")) missing.push("姓名");
  if (!keySet.has("idCard") && !keySet.has("studentId")) missing.push("身份证号或学号");
  if (![...RECOMMEND_LEVEL_KEYS].some((key) => keySet.has(key))) {
    missing.push("推荐档次/院系推荐档次/学校推荐档次");
  }
  if (!keySet.has("specialDifficultyType")) missing.push("特殊困难类型");
  if (!keySet.has("studentStatement")) missing.push("陈述理由");
  return missing;
};

const withTemplateErrorPrefix = (errors: string[]) => [
  "上传的模板表不是困难生本专科信息模板，请上传正确模板。",
  ...errors,
];

export const validateTemplateFile = (templateWorkbook: WorkbookData): TemplateValidationResult => {
  const candidate = findBestStudentHeader(templateWorkbook);
  const emptyResult: TemplateValidationResult = {
    ok: false,
    templateFields: [],
    templateSignature: "",
    headerRowIndex: -1,
    sheetName: "",
    matchedFieldCount: 0,
    coreMatchedCount: 0,
    errors: withTemplateErrorPrefix(["未能在前10行识别出困难生字段表头。"]),
    warnings: [],
  };
  if (!candidate) return emptyResult;

  const canonicalKeys = getCanonicalKeys(candidate.fields);
  const uniqueCanonicalKeys = uniqueInOrder(canonicalKeys);
  const keySet = new Set(uniqueCanonicalKeys);
  const coreMatchedCount = DIFFICULTY_STUDENT_CORE_KEYS.filter((key) => keySet.has(key)).length;
  const minimumCoreCount = Math.ceil(DIFFICULTY_STUDENT_CORE_KEYS.length * 0.7);
  const errors: string[] = [];
  const warnings: string[] = [];
  const wrongTemplateType = getWrongTemplateType(candidate.fields);
  const missingRequired = getRequiredCoreErrors(keySet);
  const duplicateKeys = canonicalKeys.filter((key, index) => canonicalKeys.indexOf(key) !== index);

  if (wrongTemplateType === "award") errors.push("检测到三奖、获奖或银行卡相关字段。");
  if (wrongTemplateType === "family") errors.push("检测到家庭成员信息表字段。");
  if (coreMatchedCount < minimumCoreCount) {
    errors.push(`核心字段仅匹配 ${coreMatchedCount}/${DIFFICULTY_STUDENT_CORE_KEYS.length}，低于70%要求。`);
  }
  if (missingRequired.length > 0) errors.push(`缺少必需核心字段：${missingRequired.join("、")}。`);
  if (duplicateKeys.length > 0) {
    errors.push(`存在重复字段绑定：${uniqueInOrder(duplicateKeys).map(describeCoreKey).join("、")}。`);
  }

  const unknownHeaders = candidate.fields.filter((field) => !field.canonicalKey).map((field) => field.rawHeader);
  if (unknownHeaders.length > 0) {
    warnings.push(`检测到 ${unknownHeaders.length} 个非标准字段：${unknownHeaders.slice(0, 6).join("、")}。`);
  }

  return {
    ok: errors.length === 0,
    templateFields: candidate.fields,
    templateSignature: createTemplateSignature(candidate.fields),
    headerRowIndex: candidate.headerRowIndex,
    sheetName: candidate.sheetName,
    matchedFieldCount: uniqueCanonicalKeys.length,
    coreMatchedCount,
    errors: errors.length > 0 ? withTemplateErrorPrefix(errors) : [],
    warnings,
  };
};

const longestCommonSubsequenceLength = (left: DifficultyStudentCanonicalKey[], right: DifficultyStudentCanonicalKey[]) => {
  const table = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let i = 1; i <= left.length; i++) {
    for (let j = 1; j <= right.length; j++) {
      table[i][j] = left[i - 1] === right[j - 1]
        ? table[i - 1][j - 1] + 1
        : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }
  return table[left.length][right.length];
};

export const validateDataAgainstTemplate = (
  dataWorkbook: WorkbookData,
  templateInfo: TemplateValidationResult
): DataTemplateValidationResult => {
  const candidate = findBestStudentHeader(dataWorkbook);
  const invalidResult = (errors: string[]): DataTemplateValidationResult => ({
    ok: false,
    dataFields: candidate?.fields || [],
    dataSignature: candidate ? createTemplateSignature(candidate.fields) : "",
    headerRowIndex: candidate?.headerRowIndex ?? -1,
    sheetName: candidate?.sheetName || "",
    mismatchLevel: "invalid",
    matchedFieldCount: 0,
    templateFieldCount: uniqueInOrder(getCanonicalKeys(templateInfo.templateFields)).length,
    dataFieldCount: candidate?.fields.length || 0,
    matchRate: 0,
    missingCoreFields: [],
    extraFields: [],
    errors: ["数据表与模板表不匹配。请确认上传的是同一个困难生本专科信息模板。", ...errors],
    warnings: [],
  });

  if (!templateInfo.ok) return invalidResult(["模板表尚未通过校验，请重新上传正确模板。"]);
  if (!candidate) return invalidResult(["未能在前10行识别出数据表头。"]);

  const wrongTemplateType = getWrongTemplateType(candidate.fields);
  if (wrongTemplateType === "award") return invalidResult(["检测到三奖、获奖或银行卡相关字段。"]);
  if (wrongTemplateType === "family") return invalidResult(["检测到家庭成员信息表字段。"]);

  const templateKeys = uniqueInOrder(getCanonicalKeys(templateInfo.templateFields));
  const dataKeys = uniqueInOrder(getCanonicalKeys(candidate.fields));
  const templateKeySet = new Set(templateKeys);
  const dataKeySet = new Set(dataKeys);
  const matchedKeys = templateKeys.filter((key) => dataKeySet.has(key));
  const matchRate = templateKeys.length > 0 ? matchedKeys.length / templateKeys.length : 0;
  const templateCoreKeys = DIFFICULTY_STUDENT_CORE_KEYS.filter((key) => templateKeySet.has(key));
  const missingCoreKeys = templateCoreKeys.filter((key) => !dataKeySet.has(key));
  const missingRequired = getRequiredCoreErrors(dataKeySet);
  const missingCoreFields = uniqueInOrder([
    ...missingCoreKeys.map(describeCoreKey),
    ...missingRequired,
  ]);
  const missingNonCoreKeys = templateKeys.filter(
    (key) => !dataKeySet.has(key) && !DIFFICULTY_STUDENT_CORE_KEYS.includes(key)
  );
  const extraFields = candidate.fields
    .filter((field) => !field.canonicalKey || !templateKeySet.has(field.canonicalKey))
    .map((field) => field.rawHeader);
  const warnings: string[] = [];
  const errors: string[] = [];

  if (missingCoreFields.length > 0) errors.push(`缺失核心字段：${missingCoreFields.join("、")}。`);
  if (matchRate < 0.9) errors.push(`字段匹配率为 ${(matchRate * 100).toFixed(1)}%，低于90%要求。`);
  if (missingNonCoreKeys.length > 0) {
    warnings.push(`缺少非核心字段：${missingNonCoreKeys.map(describeCoreKey).join("、")}。`);
  }
  if (extraFields.length > 0) warnings.push(`新增非核心字段：${extraFields.slice(0, 8).join("、")}。`);

  const templateRawByKey = new Map(
    templateInfo.templateFields
      .filter((field): field is TemplateField & { canonicalKey: DifficultyStudentCanonicalKey } => Boolean(field.canonicalKey))
      .map((field) => [field.canonicalKey, field.rawHeader])
  );
  const hasHeaderFormattingDifference = candidate.fields.some((field) =>
    field.canonicalKey &&
    templateRawByKey.has(field.canonicalKey) &&
    templateRawByKey.get(field.canonicalKey) !== field.rawHeader
  );
  if (hasHeaderFormattingDifference) warnings.push("数据表表头存在空格、星号、括号或说明文字差异，已按标准字段识别。");

  const expectedCommonOrder = templateKeys.filter((key) => dataKeySet.has(key));
  const actualCommonOrder = dataKeys.filter((key) => templateKeySet.has(key));
  const orderSimilarity = expectedCommonOrder.length === 0
    ? 0
    : longestCommonSubsequenceLength(expectedCommonOrder, actualCommonOrder) / expectedCommonOrder.length;
  if (orderSimilarity < 0.8) {
    errors.push(`核心结构顺序相似度为 ${(orderSimilarity * 100).toFixed(1)}%，字段存在大面积错位。`);
  } else if (orderSimilarity < 1) {
    warnings.push(`字段顺序存在小幅变化，相似度为 ${(orderSimilarity * 100).toFixed(1)}%。`);
  }

  const hasInvalidError = missingCoreFields.length > 0 || matchRate < 0.9;
  const hasMajorOrderMismatch = orderSimilarity < 0.8;
  const mismatchLevel = hasInvalidError
    ? "invalid"
    : hasMajorOrderMismatch
    ? "major"
    : warnings.length > 0
    ? "minor"
    : "none";

  return {
    ok: errors.length === 0,
    dataFields: candidate.fields,
    dataSignature: createTemplateSignature(candidate.fields),
    headerRowIndex: candidate.headerRowIndex,
    sheetName: candidate.sheetName,
    mismatchLevel,
    matchedFieldCount: matchedKeys.length,
    templateFieldCount: templateKeys.length,
    dataFieldCount: candidate.fields.length,
    matchRate,
    missingCoreFields,
    extraFields,
    errors: errors.length > 0
      ? ["数据表与模板表不匹配。请确认上传的是同一个困难生本专科信息模板。", ...errors]
      : [],
    warnings,
  };
};

const normalizeHeaderText = (value: unknown) => normalizeDifficultyHeader(value);

const rowHasMeaningfulCells = (row: unknown[]) =>
  row.some((cell) => String(cell ?? "").trim() !== "");

const getHeaderScore = (row: unknown[], keywords: string[]) => {
  const headers = row.map(normalizeHeaderText).filter(Boolean);
  return keywords.reduce((score, keyword) => (
    headers.some((header) => header.includes(keyword) || keyword.includes(header)) ? score + 1 : score
  ), 0);
};

const findTemplateHeaderRowIndex = (rows: unknown[][], type: "student" | "family") => {
  const keywords = type === "student" ? STUDENT_HEADER_KEYWORDS : FAMILY_HEADER_KEYWORDS;
  let bestIndex = -1;
  let bestScore = -1;

  rows.slice(0, 12).forEach((row, index) => {
    if (!rowHasMeaningfulCells(row)) return;
    const score = getHeaderScore(row, keywords);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestScore >= 2 ? bestIndex : -1;
};

const pickTemplateHeaderRows = (
  rows: unknown[][],
  type: "student" | "family",
  requireDataRows = true
) => {
  if (rows.length === 0) throw new Error("没有找到有效 Sheet");

  const headerIndex = findTemplateHeaderRowIndex(rows, type);
  if (headerIndex < 0) throw new Error("没有找到表头");

  const firstRow = headerIndex > 0 ? rows[headerIndex - 1] || [] : [];
  const secondRow = rows[headerIndex] || [];
  const dataRows = rows
    .slice(headerIndex + 1)
    .filter(rowHasMeaningfulCells)
    .filter((row) => getHeaderScore(row, type === "student" ? STUDENT_HEADER_KEYWORDS : FAMILY_HEADER_KEYWORDS) < 2);

  if (requireDataRows && dataRows.length === 0) throw new Error("没有读取到数据行");
  return { firstRow, secondRow, headerIndex, dataRows };
};

export const FIELD_ALIASES: Record<string, string[]> = {
  "姓名(*)": ["姓名", "学生姓名", "姓名(*)", "姓名（*）", "姓名 *"],
  "籍贯(*)": ["籍贯", "生源地", "户籍地", "籍贯(*)"],
  "身份证号(*)": ["身份证号", "身份证号码", "身份证件号", "证件号码", "证件号", "学生身份证号", "身份证号(*)"],
  "家庭人口数(*)": ["家庭人口数", "家庭人口", "人口数", "家庭人数", "家庭人口数(*)", "家庭人口数（*）"],
  "手机号码(*)": ["手机号码", "手机号", "联系电话", "联系方式", "学生联系电话", "手机号码(*)"],
  "辅导员姓名": ["辅导员姓名", "辅导员"],
  "申请日期(*)": ["申请日期", "日期", "申请日期(*)"],
  "家庭地址(*)": ["家庭地址", "家庭住址", "通讯地址", "详细地址", "家庭地址(*)"],
  "邮政编码(*)": ["邮政编码", "邮编", "家庭邮编", "邮政编码(*)"],
  "家长手机号码(*)": ["家长手机号码", "家长手机号", "监护人电话", "联系电话", "联系方式"],
  "特殊困难类型(*)": ["特殊困难类型", "特殊群体类型", "特殊困难群体类型", "困难类型", "特殊困难类型(*)", "特殊困难类型（*）"],
  "家庭年均收入(*)": ["家庭年均收入", "家庭年收入", "年收入", "收入"],
  "突发意外事件具体描述(*)": ["突发意外事件具体描述", "突发事件描述", "意外事件描述", "突发事件"],
  "家庭欠债金额(*)": ["家庭欠债金额", "欠债金额", "负债金额", "债务金额"],
  "学生家庭欠债原因": ["学生家庭欠债原因", "欠债原因", "负债原因", "家庭欠债原因"],
  "其它影响家庭经济信息": ["其它影响家庭经济信息", "其他影响家庭经济信息", "重大经济信息", "其他经济信息"],
  "推荐档次(*)": ["推荐档次", "困难等级", "困难认定等级", "认定等级"],
  "院系推荐档次(*)": ["院系推荐档次", "院系认定结果", "院系困难等级", "院系认定档次", "院系推荐结果"],
  "学校推荐档次(*)": ["学校推荐档次", "学校认定结果", "学校困难等级", "学校认定档次", "学校推荐结果"],
  "陈述理由(*)": ["陈述理由", "申请理由", "困难陈述", "理由"],
  "收入来源(*)": ["收入来源", "家庭收入来源", "收入来源(*)"],
  "户籍性质(*)": ["户籍性质", "户口性质", "户籍性质(*)"],
  "劳动人口数(*)": ["劳动人口", "劳动人口数", "劳动人数", "劳动力人口", "劳动力人口数"],
  "劳动力人口数（*）": ["劳动人口", "劳动人口数", "劳动人数", "劳动力人口", "劳动力人口数"],
  "赡养人口数(*)": ["赡养人口", "赡养人口数", "赡养人数", "被赡养人口数"],
  "赡养人口数（*）": ["赡养人口", "赡养人口数", "赡养人数", "被赡养人口数"],
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

export const headerMatchScore = (templateField: string, sourceHeader: string, strict = false) => {
  const target = normalizeDifficultyHeader(templateField);
  const source = normalizeDifficultyHeader(sourceHeader);

  if (!target || !source) return 0;
  if (target === source) return 100;

  const bindingAliases = getDifficultyFieldAliases(templateField);
  const aliases = bindingAliases.length > 0
    ? bindingAliases
    : FIELD_ALIASES[templateField] || FIELD_ALIASES[cleanFieldName(templateField)] || [];
  for (const alias of aliases) {
    const a = normalizeDifficultyHeader(alias);
    if (a === source) return 95;
    if (!strict && (source.includes(a) || a.includes(source))) return 90;
  }

  if (!strict && (target.includes(source) || source.includes(target))) return 85;
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

export const buildColumnMap = (headers: string[], fields: string[], strictFields: string[] = []) => {
  const result: ColumnMapItem[] = [];
  const usedSourceIndexes = new Set<number>();
  const strictFieldSet = new Set(strictFields.map(normalizeDifficultyHeader));

  fields.forEach((field, templateIndex) => {
    let bestIndex = -1;
    let bestScore = 0;
    let bestHeader = "";
    const binding = resolveDifficultyFieldBinding(field);
    const strict = Boolean(binding) || strictFieldSet.has(normalizeDifficultyHeader(field));

    headers.forEach((header, index) => {
      if (usedSourceIndexes.has(index)) return;
      const score = headerMatchScore(field, header, strict);
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
        canonicalKey: binding?.canonicalKey,
        validatorKey: binding?.validatorKey,
      });
    } else if (!strict && templateIndex < headers.length && !usedSourceIndexes.has(templateIndex)) {
      usedSourceIndexes.add(templateIndex);
      result.push({
        templateField: field,
        templateIndex,
        sourceIndex: templateIndex,
        sourceHeader: headers[templateIndex] || `第${templateIndex + 1}列`,
        mode: "同列兜底",
        canonicalKey: binding?.canonicalKey,
        validatorKey: binding?.validatorKey,
      });
    } else {
      result.push({
        templateField: field,
        templateIndex,
        sourceIndex: -1,
        sourceHeader: "",
        mode: "未匹配",
        canonicalKey: binding?.canonicalKey,
        validatorKey: binding?.validatorKey,
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
  const validation = validateTemplateFile(workbookData);
  if (!validation.ok) throw new Error(validation.errors.join("\n"));

  const outputSheet = validation.sheetName;
  const dictSheet = workbookData.sheetNames.find(
    (name) => name !== outputSheet && name.includes("字典")
  ) || workbookData.sheetNames.find((name) => name !== outputSheet) || "";
  const outputRows = workbookData.sheets[outputSheet] || [];
  const dictRows = workbookData.sheets[dictSheet] || [];
  const secondRow = outputRows[validation.headerRowIndex] || [];
  const firstRow = validation.headerRowIndex > 0
    ? outputRows[validation.headerRowIndex - 1] || []
    : [];
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

export const parseFamilyTemplate = (workbookData: WorkbookData): TemplateParseResult => {
  const { dictSheet, outputSheet: initialOutputSheet } = pickTemplateSheets(workbookData);
  const outputSheet =
    findTemplateHeaderRowIndex(workbookData.sheets[initialOutputSheet] || [], "family") >= 0
      ? initialOutputSheet
      : workbookData.sheetNames.find((name) => name !== dictSheet && findTemplateHeaderRowIndex(workbookData.sheets[name] || [], "family") >= 0) || initialOutputSheet;
  const outputRows = workbookData.sheets[outputSheet] || [];
  const dictRows = workbookData.sheets[dictSheet] || [];
  const { firstRow, secondRow } = pickTemplateHeaderRows(outputRows, "family");
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
