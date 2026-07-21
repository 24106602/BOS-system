import { DIFFICULTY_STUDENT_FIELD_BINDINGS } from "./difficultyStudentTemplate.ts";

export const MAX_DIFFICULTY_EXPORT_LIMIT = 5000;
export const DEFAULT_DIFFICULTY_EXPORT_LIMIT = 1000;

export type DifficultyExportColumnDefinition = {
  key: string;
  label: string;
  source: "base" | "template";
  sourceField?: string;
  aliases?: readonly string[];
  sensitive: boolean;
  defaultSelected: boolean;
};

const BASE_COLUMNS: DifficultyExportColumnDefinition[] = [
  { key: "academic_year", label: "学年", source: "base", sourceField: "academic_year", sensitive: false, defaultSelected: true },
  { key: "college_name", label: "学院", source: "base", sourceField: "college_name", sensitive: false, defaultSelected: true },
  { key: "name", label: "姓名", source: "base", sourceField: "name", sensitive: false, defaultSelected: true },
  { key: "student_id", label: "学号", source: "base", sourceField: "student_id", sensitive: false, defaultSelected: true },
  { key: "grade", label: "年级", source: "base", sourceField: "grade", sensitive: false, defaultSelected: true },
  { key: "gender", label: "性别", source: "base", sourceField: "gender", sensitive: false, defaultSelected: true },
  { key: "difficulty_level", label: "困难等级", source: "base", sourceField: "difficulty_level", sensitive: false, defaultSelected: true },
  { key: "status", label: "流程状态", source: "base", sourceField: "status", sensitive: false, defaultSelected: true },
];

const OMITTED_TEMPLATE_KEYS = new Set(["name", "studentId", "finalRecommendLevel"]);
const SENSITIVE_TEMPLATE_KEYS = new Set([
  "nativePlace",
  "idCard",
  "phone",
  "familyAddress",
  "postcode",
  "parentPhone",
  "familyIncome",
  "naturalDisasterDescription",
  "unexpectedEventDescription",
  "familyDisabilityWeakLaborSituation",
  "familyUnemploymentSituation",
  "familyDebtAmount",
  "familyDebtReason",
  "otherSituation",
  "studentStatement",
  "collegeOpinion",
  "schoolOpinion",
]);

const TEMPLATE_COLUMNS: DifficultyExportColumnDefinition[] =
  DIFFICULTY_STUDENT_FIELD_BINDINGS
    .filter((binding) => !OMITTED_TEMPLATE_KEYS.has(binding.canonicalKey))
    .map((binding) => ({
      key: binding.canonicalKey,
      label: binding.fieldName,
      source: "template" as const,
      aliases: [binding.fieldName, ...binding.aliases],
      sensitive: SENSITIVE_TEMPLATE_KEYS.has(binding.canonicalKey),
      defaultSelected: false,
    }));

export const DIFFICULTY_EXPORT_COLUMNS: readonly DifficultyExportColumnDefinition[] = [
  ...BASE_COLUMNS,
  ...TEMPLATE_COLUMNS,
];

export const DEFAULT_DIFFICULTY_EXPORT_COLUMN_KEYS = DIFFICULTY_EXPORT_COLUMNS
  .filter((column) => column.defaultSelected)
  .map((column) => column.key);

export const SENSITIVE_DIFFICULTY_EXPORT_COLUMN_KEYS = DIFFICULTY_EXPORT_COLUMNS
  .filter((column) => column.sensitive)
  .map((column) => column.key);
