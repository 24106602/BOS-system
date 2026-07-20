import * as XLSX from "xlsx-js-style";
import {
  DIFFICULTY_STUDENT_FIELD_BINDINGS,
  SPECIAL_DIFFICULTY_TYPE_ALIASES,
  normalizeDifficultyField,
} from "../../src/constants/difficultyStudentTemplate.ts";
import {
  normalizeDifficultyLevel,
  specialDifficultyList,
} from "../../src/utils/validators.ts";

const MAX_IMPORT_ROWS = 5000;
const IMPORT_TOKEN_LIFETIME_MS = 2 * 60 * 60 * 1000;
const OFFICIAL_SHEET_NAMES = [
  "本专科生信息",
  "本专科困难生信息",
  "家庭经济困难学生认定",
  "困难生认定申请表",
  "困难生信息",
];
const FAMILY_RELATIONS = new Set([
  "父亲", "母亲", "爷爷", "奶奶", "外公", "外婆",
  "哥哥", "姐姐", "弟弟", "妹妹", "妻子", "丈夫",
  "儿子", "女儿", "监护人", "其他",
]);
const REQUIRED_CANONICAL_KEYS = new Set([
  "name",
  "studentId",
  "idCard",
  "phone",
  "specialDifficultyType",
  "familyIncome",
  "finalRecommendLevel",
]);

const text = (value) => String(value ?? "").trim();
const normalizeIdCard = (value) => text(value).replace(/\s|-/g, "").toUpperCase();
const normalizePhone = (value) => text(value).replace(/[^0-9]/g, "");
const normalizeAmount = (value) => text(value).replace(/[,，￥¥元\s]/g, "");

const makeApiError = (message, statusCode = 400, code = "DIFFICULTY_IMPORT_INVALID") => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
};

const toBase64Url = (bytes) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const fromBase64Url = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const digestValue = async (value) => {
  const bytes = new TextEncoder().encode(stableStringify(value));
  return toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
};

const importHmacKey = (secret) => {
  if (!text(secret)) {
    throw makeApiError(
      "服务端未配置困难生导入校验密钥",
      503,
      "IMPORT_TOKEN_SECRET_MISSING"
    );
  }
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
};

const signImportToken = async (payload, secret) => {
  const encodedPayload = toBase64Url(new TextEncoder().encode(stableStringify(payload)));
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload)
  );
  return `${encodedPayload}.${toBase64Url(new Uint8Array(signature))}`;
};

const verifyImportToken = async (token, secret) => {
  const [encodedPayload, encodedSignature, extra] = text(token).split(".");
  if (!encodedPayload || !encodedSignature || extra) {
    throw makeApiError("导入校验凭证格式无效，请重新校验文件", 400, "IMPORT_TOKEN_INVALID");
  }
  const key = await importHmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(encodedSignature),
    new TextEncoder().encode(encodedPayload)
  );
  if (!valid) {
    throw makeApiError("导入校验凭证已失效，请重新校验文件", 400, "IMPORT_TOKEN_INVALID");
  }
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encodedPayload)));
  } catch {
    throw makeApiError("导入校验凭证内容无效，请重新校验文件", 400, "IMPORT_TOKEN_INVALID");
  }
  if (Number(payload?.expiresAt) <= Date.now()) {
    throw makeApiError("导入校验凭证已过期，请重新校验文件", 400, "IMPORT_TOKEN_EXPIRED");
  }
  return payload;
};

const decodeWorkbookBytes = (fileBase64) => {
  const encoded = text(fileBase64).replace(/^data:[^;]+;base64,/i, "");
  if (!encoded) throw makeApiError("未收到待校验的 Excel 文件", 400, "IMPORT_FILE_REQUIRED");
  let binary;
  try {
    binary = atob(encoded);
  } catch {
    throw makeApiError("Excel 文件编码无效，请重新选择文件", 400, "IMPORT_FILE_INVALID");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const countHeaderMatches = (row) => new Set(
  row.map((cell) => {
    const normalized = normalizeDifficultyField(text(cell));
    const binding = DIFFICULTY_STUDENT_FIELD_BINDINGS.find((candidate) =>
      [candidate.fieldName, ...candidate.aliases]
        .some((alias) => normalizeDifficultyField(alias) === normalized)
    );
    return binding?.canonicalKey || "";
  }).filter(Boolean)
).size;

const findSheetAndHeader = (workbook) => {
  let best = null;
  const orderedSheetNames = [
    ...OFFICIAL_SHEET_NAMES.filter((name) => workbook.SheetNames.includes(name)),
    ...workbook.SheetNames.filter((name) => !OFFICIAL_SHEET_NAMES.includes(name)),
  ];

  orderedSheetNames.forEach((sheetName, sheetOrder) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: false,
    });
    rows.slice(0, 20).forEach((row, headerRowIndex) => {
      const matched = countHeaderMatches(Array.isArray(row) ? row : []);
      const official = OFFICIAL_SHEET_NAMES.includes(sheetName);
      if (!best
        || matched > best.matched
        || (matched === best.matched && official && !best.official)
        || (matched === best.matched && official === best.official && sheetOrder < best.sheetOrder)) {
        best = { sheetName, headerRowIndex, matched, official, sheetOrder, rows };
      }
    });
  });

  if (!best || best.matched < 4) {
    throw makeApiError(
      "未能识别困难生模板表头，请使用系统模板并检查 Sheet",
      400,
      "IMPORT_TEMPLATE_NOT_RECOGNIZED"
    );
  }
  return best;
};

const rowToObject = (headers, row) => {
  const result = {};
  headers.forEach((header, index) => {
    const key = text(header) || `空字段${index + 1}`;
    let uniqueKey = key;
    let suffix = 2;
    while (Object.hasOwn(result, uniqueKey)) {
      uniqueKey = `${key}_${suffix}`;
      suffix += 1;
    }
    result[uniqueKey] = row[index] ?? "";
  });
  return result;
};

export const parseDifficultyStudentImportFile = ({ fileBase64, rows }) => {
  if (Array.isArray(rows)) {
    return rows.map((data, index) => ({
      rowNumber: Number(data?.["原始行号"]) || Number(data?.__rowNumber) || index + 2,
      data: data && typeof data === "object" ? { ...data } : {},
    }));
  }

  let workbook;
  try {
    workbook = XLSX.read(decodeWorkbookBytes(fileBase64), {
      type: "array",
      cellDates: false,
      raw: false,
    });
  } catch (error) {
    throw makeApiError(
      `Excel 文件解析失败：${error instanceof Error ? error.message : "文件内容无效"}`,
      400,
      "IMPORT_FILE_PARSE_FAILED"
    );
  }
  if (!workbook.SheetNames.length) {
    throw makeApiError("Excel 文件中没有可读取的 Sheet", 400, "IMPORT_SHEET_MISSING");
  }

  const candidate = findSheetAndHeader(workbook);
  const headers = candidate.rows[candidate.headerRowIndex].map(text);
  const parsedRows = candidate.rows
    .slice(candidate.headerRowIndex + 1)
    .map((row, index) => {
      const data = rowToObject(headers, Array.isArray(row) ? row : []);
      return {
        rowNumber: Number(data["原始行号"]) || candidate.headerRowIndex + index + 2,
        data,
      };
    })
    .filter(({ data }) => Object.values(data).some((value) => text(value)));

  if (parsedRows.length === 0) {
    throw makeApiError("Excel 文件中没有有效数据行", 400, "IMPORT_ROWS_MISSING");
  }
  if (parsedRows.length > MAX_IMPORT_ROWS) {
    throw makeApiError(
      `单次最多校验 ${MAX_IMPORT_ROWS} 条困难生数据`,
      413,
      "IMPORT_ROW_LIMIT_EXCEEDED"
    );
  }
  return parsedRows;
};

const getBindingValue = (data, canonicalKey) => {
  const binding = DIFFICULTY_STUDENT_FIELD_BINDINGS.find(
    (candidate) => candidate.canonicalKey === canonicalKey
  );
  if (!binding) return "";
  const aliases = [binding.fieldName, ...binding.aliases].map(normalizeDifficultyField);
  const entry = Object.entries(data).find(([key]) => aliases.includes(normalizeDifficultyField(key)));
  return entry?.[1] ?? "";
};

const getAnyValue = (data, aliases) => {
  const normalizedAliases = aliases.map(normalizeDifficultyField);
  const entry = Object.entries(data).find(([key]) =>
    normalizedAliases.includes(normalizeDifficultyField(key))
  );
  return entry?.[1] ?? "";
};

const normalizeSpecialDifficultyType = (value) => {
  const raw = text(value);
  const exact = specialDifficultyList.find(
    (candidate) => normalizeDifficultyField(candidate) === normalizeDifficultyField(raw)
  );
  if (exact) return exact;
  const alias = Object.entries(SPECIAL_DIFFICULTY_TYPE_ALIASES).find(
    ([candidate]) => normalizeDifficultyField(candidate) === normalizeDifficultyField(raw)
  );
  return alias?.[1] || raw;
};

const buildStudentPayload = (parsedRow, { academicYear, collegeName }) => {
  const { data } = parsedRow;
  const rowAcademicYear = text(getAnyValue(data, ["学年", "年度", "academic_year"])) || text(academicYear);
  const rowCollege = text(getAnyValue(data, ["学院", "所属学院", "院系", "college_name"]));
  const resolvedCollege = text(collegeName) || rowCollege;
  const difficultyLevelValue = getBindingValue(data, "finalRecommendLevel");
  return {
    academic_year: rowAcademicYear,
    college_name: resolvedCollege,
    student_id: text(getBindingValue(data, "studentId")),
    name: text(getBindingValue(data, "name")),
    id_card: normalizeIdCard(getBindingValue(data, "idCard")),
    grade: text(getAnyValue(data, ["年级", "所在年级", "grade"])),
    gender: text(getAnyValue(data, ["性别", "gender"])),
    difficulty_level: normalizeDifficultyLevel(difficultyLevelValue) || text(difficultyLevelValue),
    status: "draft",
    photo_uploaded: false,
    photo_url: "",
    raw_data: Object.fromEntries(
      Object.entries(data).filter(([key]) => key !== "__rowNumber" && key !== "原始行号")
    ),
    __rowNumber: parsedRow.rowNumber,
    __rowCollege: rowCollege,
  };
};

const addFailure = (failures, row, field, reason) => {
  failures.push({ row: Number(row) || 0, field, reason });
};

const validateFieldRules = (parsedRow, payload, profileCollege) => {
  const failures = [];
  const { data, rowNumber } = parsedRow;

  DIFFICULTY_STUDENT_FIELD_BINDINGS.forEach((binding) => {
    const value = getBindingValue(data, binding.canonicalKey);
    const headerExists = Object.keys(data).some((key) =>
      [binding.fieldName, ...binding.aliases]
        .some((alias) => normalizeDifficultyField(alias) === normalizeDifficultyField(key))
    );
    const required = REQUIRED_CANONICAL_KEYS.has(binding.canonicalKey)
      || (headerExists && /[*＊]/.test(binding.fieldName));
    if (required && !text(value)) {
      addFailure(failures, rowNumber, binding.fieldName.replace(/[()（）*＊]/g, ""), "该字段为必填项");
    }
  });

  if (!payload.academic_year) addFailure(failures, rowNumber, "学年", "学年为必填项");
  if (!payload.college_name) addFailure(failures, rowNumber, "学院", "学院为必填项");
  if (profileCollege && payload.__rowCollege && text(payload.__rowCollege) !== text(profileCollege)) {
    addFailure(failures, rowNumber, "学院", `该记录不属于当前学院（当前学院：${profileCollege}）`);
  }
  if (payload.id_card && !/^[1-9]\d{16}[\dX]$/.test(payload.id_card)) {
    addFailure(failures, rowNumber, "身份证号", "身份证号必须为18位，最后一位允许 X");
  }

  const phone = normalizePhone(getBindingValue(data, "phone"));
  if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
    addFailure(failures, rowNumber, "手机号码", "手机号码必须为有效的11位中国大陆手机号");
  }
  const parentPhone = normalizePhone(getBindingValue(data, "parentPhone"));
  if (parentPhone && !/^1[3-9]\d{9}$/.test(parentPhone)) {
    addFailure(failures, rowNumber, "家长手机号码", "家长手机号码必须为有效的11位中国大陆手机号");
  }

  const perCapitaIncome = normalizeAmount(getBindingValue(data, "familyIncome"));
  if (perCapitaIncome && !/^\d+(?:\.\d{1,2})?$/.test(perCapitaIncome)) {
    addFailure(failures, rowNumber, "家庭人均年收入", "家庭人均年收入必须为非负数字，最多保留两位小数");
  }
  const annualIncome = normalizeAmount(getAnyValue(data, ["家庭年收入", "家庭年总收入", "年收入（元）", "年收入"]));
  if (annualIncome && !/^\d+$/.test(annualIncome)) {
    addFailure(failures, rowNumber, "年收入", "年收入必须为非负整数");
  }

  [
    ["familyPopulation", "家庭人口数"],
    ["laborPopulation", "劳动力人口数"],
    ["unemployedPopulation", "家庭失业人数"],
    ["dependentPopulation", "赡养人口数"],
  ].forEach(([key, label]) => {
    const value = text(getBindingValue(data, key));
    if (value && !/^\d+$/.test(value)) {
      addFailure(failures, rowNumber, label, `${label}必须为非负整数`);
    }
  });

  const specialType = normalizeSpecialDifficultyType(getBindingValue(data, "specialDifficultyType"));
  if (specialType && !specialDifficultyList.includes(specialType)) {
    addFailure(
      failures,
      rowNumber,
      "特殊困难类型",
      `特殊困难类型必须为：${specialDifficultyList.join("、")}`
    );
  }
  const level = text(getBindingValue(data, "finalRecommendLevel"));
  if (level && !normalizeDifficultyLevel(level)) {
    addFailure(
      failures,
      rowNumber,
      "推荐档次",
      "推荐档次必须为 A.家庭经济一般困难 或 C.家庭经济特别困难"
    );
  }

  const relation = text(getAnyValue(data, ["家庭成员关系", "与学生关系", "关系"]));
  if (relation && !FAMILY_RELATIONS.has(relation)) {
    addFailure(
      failures,
      rowNumber,
      "家庭成员关系",
      `家庭成员关系必须为：${[...FAMILY_RELATIONS].join("、")}`
    );
  }
  return failures;
};

const assertQuerySucceeded = (result) => {
  if (result.error) throw result.error;
  return result.data || [];
};

const queryDatabaseReferences = async (admin, payloads) => {
  const studentIds = [...new Set(payloads.map((row) => text(row.student_id)).filter(Boolean))];
  const academicYears = [...new Set(payloads.map((row) => text(row.academic_year)).filter(Boolean))];
  const enrollmentPromise = studentIds.length
    ? admin.from("enrolled_students").select("student_id,name,college").in("student_id", studentIds)
    : Promise.resolve({ data: [], error: null });
  const existingPromise = academicYears.length
    ? admin.from("students").select("id,student_id,academic_year,name,college_name,raw_data").in("academic_year", academicYears)
    : Promise.resolve({ data: [], error: null });
  const [enrollmentResult, existingResult] = await Promise.all([enrollmentPromise, existingPromise]);
  return {
    enrollments: assertQuerySucceeded(enrollmentResult),
    existingStudents: assertQuerySucceeded(existingResult),
  };
};

const studentYearKey = (row) => `${text(row.student_id)}::${text(row.academic_year)}`;
const payloadPhone = (row) => normalizePhone(getBindingValue(row.raw_data || {}, "phone"));

export const collectDifficultyStudentImportFailures = async (
  admin,
  payloads,
  { reservedRows = [] } = {}
) => {
  if (!payloads.length) return [];
  const { enrollments, existingStudents } = await queryDatabaseReferences(admin, payloads);
  const enrollmentIds = new Set(enrollments.map((row) => text(row.student_id)));
  const existingByKey = new Map(existingStudents.map((row) => [studentYearKey(row), row]));
  const existingByPhone = new Map(
    existingStudents
      .map((row) => [payloadPhone(row), row])
      .filter(([phone]) => phone)
  );
  const combinedRows = [...reservedRows, ...payloads];
  const studentIdCounts = new Map();
  const phoneCounts = new Map();
  combinedRows.forEach((row) => {
    const studentId = text(row.student_id);
    const phone = payloadPhone(row);
    if (studentId) studentIdCounts.set(studentId, (studentIdCounts.get(studentId) || 0) + 1);
    if (phone) phoneCounts.set(phone, (phoneCounts.get(phone) || 0) + 1);
  });

  return payloads.flatMap((row) => {
    const failures = [];
    const rowNumber = Number(row.__rowNumber) || 0;
    const studentId = text(row.student_id);
    const phone = payloadPhone(row);
    if (!studentId || !enrollmentIds.has(studentId)) {
      addFailure(failures, rowNumber, "学号", "该学生没有学籍记录");
    }
    if (studentId && (studentIdCounts.get(studentId) || 0) > 1) {
      addFailure(failures, rowNumber, "学号", `学号 ${studentId} 在本次导入中重复`);
    }
    if (phone && (phoneCounts.get(phone) || 0) > 1) {
      addFailure(failures, rowNumber, "手机号码", `手机号码 ${phone} 在本次导入中重复`);
    }
    const existing = existingByKey.get(studentYearKey(row));
    if (existing) {
      addFailure(
        failures,
        rowNumber,
        "学号",
        `学号 ${studentId} 在 ${row.academic_year} 学年已存在困难生认定记录（姓名：${text(existing.name) || "未填写姓名"}）`
      );
    }
    const phoneOwner = phone ? existingByPhone.get(phone) : null;
    if (phoneOwner && text(phoneOwner.student_id) !== studentId) {
      addFailure(
        failures,
        rowNumber,
        "手机号码",
        `手机号码 ${phone} 已被学生 ${text(phoneOwner.name) || text(phoneOwner.student_id)} 使用`
      );
    }
    return failures;
  });
};

const stripInternalPayloadFields = (row) => Object.fromEntries(
  Object.entries(row).filter(([key]) => !key.startsWith("__"))
);

const groupFailures = (parsedRows, payloads, failures) => {
  const failureMap = new Map();
  failures.forEach((failure) => {
    const list = failureMap.get(failure.row) || [];
    list.push({ field: failure.field, reason: failure.reason });
    failureMap.set(failure.row, list);
  });
  const passedRows = [];
  const failedRows = [];
  parsedRows.forEach((parsedRow, index) => {
    const errors = failureMap.get(parsedRow.rowNumber) || [];
    if (errors.length) {
      failedRows.push({ row: parsedRow.rowNumber, data: parsedRow.data, errors });
    } else {
      passedRows.push(stripInternalPayloadFields(payloads[index]));
    }
  });
  return { passedRows, failedRows };
};

const assertImportRole = (profile) => {
  if (!profile || !["college", "admin"].includes(profile.role)) {
    throw makeApiError("当前账号无权导入困难生数据", 403, "IMPORT_FORBIDDEN");
  }
};

const assertTokenOwner = (payload, context) => {
  if (text(payload.userId) !== text(context.user?.id)) {
    throw makeApiError("导入校验凭证不属于当前账号", 403, "IMPORT_TOKEN_FORBIDDEN");
  }
  if (context.profile?.role === "college"
    && text(payload.collegeName) !== text(context.profile.college_name)) {
    throw makeApiError("导入校验凭证不属于当前学院", 403, "IMPORT_TOKEN_FORBIDDEN");
  }
};

export const validateDifficultyStudentImport = async ({
  context,
  body,
  secret,
}) => {
  assertImportRole(context.profile);
  const parsedRows = parseDifficultyStudentImportFile({
    fileBase64: body?.fileBase64,
    rows: body?.rows,
  });
  const retryToken = text(body?.retryToken);
  let acceptedRows = [];
  let originalTotal = parsedRows.length;
  let tokenCollege = text(context.profile.college_name) || text(body?.collegeName);

  if (retryToken) {
    const prior = await verifyImportToken(retryToken, secret);
    assertTokenOwner(prior, context);
    acceptedRows = Array.isArray(body?.acceptedRows) ? body.acceptedRows : [];
    if (await digestValue(acceptedRows) !== prior.digest) {
      throw makeApiError("已通过数据与上次校验结果不一致，请重新校验完整文件", 400, "IMPORT_DATA_CHANGED");
    }
    const allowedRows = new Set((prior.retryRows || []).map(Number));
    const retryRows = parsedRows.map((row) => Number(row.rowNumber));
    const retryRowSet = new Set(retryRows);
    if (retryRows.length === 0
      || retryRowSet.size !== retryRows.length
      || retryRowSet.size !== allowedRows.size
      || retryRows.some((row) => !allowedRows.has(row))) {
      throw makeApiError(
        "重新校验文件必须包含上次全部失败数据，并须保留“原始行号”列",
        400,
        "IMPORT_RETRY_SCOPE_INVALID"
      );
    }
    originalTotal = Number(prior.total) || (acceptedRows.length + parsedRows.length);
    tokenCollege = text(prior.collegeName);
  }

  const profileCollege = context.profile.role === "college"
    ? text(context.profile.college_name)
    : tokenCollege;
  const payloads = parsedRows.map((row) => buildStudentPayload(row, {
    academicYear: text(body?.academicYear),
    collegeName: profileCollege,
  }));
  const fieldFailures = parsedRows.flatMap((row, index) =>
    validateFieldRules(row, payloads[index], profileCollege)
  );
  const databaseFailures = await collectDifficultyStudentImportFailures(
    context.admin,
    payloads,
    { reservedRows: acceptedRows }
  );
  const failures = [...fieldFailures, ...databaseFailures];
  const grouped = groupFailures(parsedRows, payloads, failures);
  const allPassedRows = [...acceptedRows, ...grouped.passedRows];
  const retryRows = grouped.failedRows.map((row) => row.row);
  const collegeNames = [...new Set(allPassedRows.map((row) => text(row.college_name)).filter(Boolean))];
  if (collegeNames.length > 1) {
    throw makeApiError("一次导入只能包含一个学院的数据", 400, "IMPORT_MULTIPLE_COLLEGES");
  }
  tokenCollege = tokenCollege || collegeNames[0] || profileCollege;
  const tokenPayload = {
    version: 1,
    userId: context.user.id,
    collegeName: tokenCollege,
    total: originalTotal,
    count: allPassedRows.length,
    retryRows,
    digest: await digestValue(allPassedRows),
    expiresAt: Date.now() + IMPORT_TOKEN_LIFETIME_MS,
  };

  return {
    validationToken: await signImportToken(tokenPayload, secret),
    total: originalTotal,
    passed: allPassedRows.length,
    failed: grouped.failedRows.length,
    failures,
    passedRows: allPassedRows,
    failedRows: grouped.failedRows,
  };
};

export const confirmDifficultyStudentImport = async ({
  context,
  body,
  secret,
}) => {
  assertImportRole(context.profile);
  const token = await verifyImportToken(body?.validationToken, secret);
  assertTokenOwner(token, context);
  if (Array.isArray(token.retryRows) && token.retryRows.length > 0) {
    throw makeApiError(
      "仍有校验失败数据，不能正式导入，请修正后重新校验",
      400,
      "IMPORT_HAS_FAILURES"
    );
  }
  const rows = Array.isArray(body?.passedRows) ? body.passedRows : [];
  if (!rows.length || rows.length !== Number(token.count)) {
    throw makeApiError("正式导入数据数量与校验结果不一致", 400, "IMPORT_DATA_CHANGED");
  }
  if (await digestValue(rows) !== token.digest) {
    throw makeApiError("正式导入数据已被修改，请重新校验文件", 400, "IMPORT_DATA_CHANGED");
  }
  if (context.profile.role === "college"
    && rows.some((row) => text(row.college_name) !== text(context.profile.college_name))) {
    throw makeApiError("学院账号只能导入本学院困难生数据", 403, "IMPORT_FORBIDDEN");
  }
  const databaseFailures = await collectDifficultyStudentImportFailures(context.admin, rows);
  if (databaseFailures.length) {
    const error = makeApiError(
      "正式导入前数据状态已变化，请根据失败明细重新校验",
      409,
      "IMPORT_CONFLICT"
    );
    error.failures = databaseFailures;
    throw error;
  }

  const { data, error } = await context.admin.rpc("confirm_difficulty_student_import", {
    p_rows: rows,
    p_college_name: text(token.collegeName),
    p_operator_user_id: context.user.id,
    p_operator_role: context.profile.role,
    p_operator_name: text(context.profile.display_name)
      || text(context.profile.college_name)
      || (context.profile.role === "admin" ? "学校管理员" : "学院账号"),
  });
  if (error) {
    if (String(error.code || "") === "23505") {
      throw makeApiError(
        text(error.message) || "存在同一学生同一学年的重复困难生认定记录",
        409,
        "IMPORT_CONFLICT"
      );
    }
    if (/confirm_difficulty_student_import|schema cache/i.test(
      [error.message, error.details, error.hint].filter(Boolean).join(" ")
    )) {
      throw makeApiError(
        "困难生两阶段导入数据库迁移尚未执行，请联系系统管理员",
        503,
        "IMPORT_MIGRATION_REQUIRED"
      );
    }
    throw error;
  }
  return data && typeof data === "object"
    ? data
    : { inserted: rows.length, failed: 0 };
};

export const __testables = {
  digestValue,
  signImportToken,
  verifyImportToken,
  validateFieldRules,
};
