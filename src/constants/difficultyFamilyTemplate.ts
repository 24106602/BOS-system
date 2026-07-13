export const DIFFICULTY_FAMILY_TEMPLATE_FIELDS = [
  "年度*",
  "学期*",
  "学生身份证号*",
  "家庭成员姓名*",
  "家庭成员年龄*",
  "与学生关系*",
  "工作或学习单位*",
  "年收入（元）*",
  "职业*",
  "健康状况*",
] as const;

export type DifficultyFamilyTemplateField =
  (typeof DIFFICULTY_FAMILY_TEMPLATE_FIELDS)[number];

export type DifficultyFamilyCanonicalKey =
  | "year"
  | "semester"
  | "studentIdCard"
  | "memberName"
  | "memberAge"
  | "relation"
  | "workUnit"
  | "annualIncome"
  | "occupation"
  | "healthStatus";

export type DifficultyFamilyFieldBinding = {
  fieldName: string;
  canonicalKey: DifficultyFamilyCanonicalKey;
  aliases: readonly string[];
};

export const DIFFICULTY_FAMILY_FIELD_BINDINGS = [
  { fieldName: "年度*", canonicalKey: "year", aliases: ["年度*", "年度", "学年", "year"] },
  { fieldName: "学期*", canonicalKey: "semester", aliases: ["学期*", "学期", "semester"] },
  { fieldName: "学生身份证号*", canonicalKey: "studentIdCard", aliases: ["学生身份证号*", "学生身份证号", "学生身份证件号", "身份证号", "身份证件号", "证件号"] },
  { fieldName: "家庭成员姓名*", canonicalKey: "memberName", aliases: ["家庭成员姓名*", "家庭成员姓名", "成员姓名", "家属姓名", "姓名"] },
  { fieldName: "家庭成员年龄*", canonicalKey: "memberAge", aliases: ["家庭成员年龄*", "家庭成员年龄", "年龄", "成员年龄"] },
  { fieldName: "与学生关系*", canonicalKey: "relation", aliases: ["与学生关系*", "与学生关系", "关系", "家庭成员关系"] },
  { fieldName: "工作或学习单位*", canonicalKey: "workUnit", aliases: ["工作或学习单位*", "工作或学习单位", "工作单位", "单位", "学习单位"] },
  { fieldName: "年收入（元）*", canonicalKey: "annualIncome", aliases: ["年收入（元）*", "年收入（元）", "年收入", "收入（元）", "收入"] },
  { fieldName: "职业*", canonicalKey: "occupation", aliases: ["职业*", "职业", "工作"] },
  { fieldName: "健康状况*", canonicalKey: "healthStatus", aliases: ["健康状况*", "健康状况", "健康"] },
] as const satisfies readonly DifficultyFamilyFieldBinding[];

export const normalizeFamilyField = (value: string) =>
  String(value ?? "")
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/（[^）]*）|\([^)]*\)/g, "")
    .replace(/[\s\u00a0\u200b-\u200d\u2060\ufeff\u3000]/g, "")
    .replace(/[*＊()（）:：，,。；;]/g, "")
    .toLowerCase();

export const resolveFamilyFieldBinding = (value: string) => {
  const normalized = normalizeFamilyField(value);
  return DIFFICULTY_FAMILY_FIELD_BINDINGS.find((binding) =>
    [binding.fieldName, ...binding.aliases].some(
      (candidate) => normalizeFamilyField(candidate) === normalized
    )
  );
};

export const getFamilyFieldAliases = (value: string) => {
  const binding = resolveFamilyFieldBinding(value);
  return binding ? [binding.fieldName, ...binding.aliases] : [];
};

export const getFamilyTemplateValue = (
  rawData: Record<string, unknown> | null | undefined,
  field: DifficultyFamilyTemplateField,
  fallback = ""
) => {
  const source = rawData || {};
  const aliases = getFamilyFieldAliases(field).map(normalizeFamilyField);
  const matched = Object.entries(source).find(([key]) =>
    aliases.includes(normalizeFamilyField(key))
  );
  const value = matched?.[1];
  return value === undefined || value === null || String(value).trim() === ""
    ? fallback
    : String(value);
};