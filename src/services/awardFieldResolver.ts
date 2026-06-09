export type AwardStructuredField =
  | `获奖年份${1 | 2 | 3 | 4}`
  | `获奖月份${1 | 2 | 3 | 4}`
  | `获奖名称${1 | 2 | 3 | 4}`
  | `颁奖单位${1 | 2 | 3 | 4}`;

export type AwardStandardField =
  | "学生姓名"
  | "身份证号"
  | "联系电话"
  | "院系名称"
  | "政治面貌"
  | "专业"
  | "必修课程数量"
  | "及格课程数量"
  | "成绩排名总人数"
  | "成绩排名名次"
  | "实行综合排名"
  | "排名总人数"
  | "排名名次"
  | "曾获何种奖励"
  | "申请理由"
  | "申请日期"
  | "辅导员推荐理由"
  | "辅导员推荐日期"
  | "院系意见"
  | "院系日期"
  | AwardStructuredField;

export type AwardFieldResolver = {
  getColumn: (field: AwardStandardField) => number | null;
  getFieldColumn: (field: AwardStandardField) => number | null;
  getActualFieldName: (field: AwardStandardField) => string;
  getStandardFieldByColumn: (columnIndex: number) => AwardStandardField | undefined;
  hasField: (field: AwardStandardField) => boolean;
};

const normalizeFullWidthSymbols = (value: string) =>
  value
    .replace(/\u3000/g, " ")
    .replace(/[\uFF01-\uFF5E]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/（/g, "(")
    .replace(/）/g, ")");

export const normalizeHeaderName = (header: string): string =>
  normalizeFullWidthSymbols(String(header ?? ""))
    .replace(/[\r\n\t]/g, "")
    .replace(/\s+/g, "")
    .replace(/\*/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[（）()]/g, "")
    .trim();

export const awardFieldAliases: Record<AwardStandardField, string[]> = {
  学生姓名: ["学生姓名", "姓名"],
  身份证号: ["身份证号", "身份证件号", "证件号"],
  联系电话: ["联系电话", "手机号码", "手机号", "手机"],
  院系名称: ["院系名称", "院系", "学院", "学部", "所在院系", "所在学院"],
  政治面貌: ["政治面貌"],
  专业: ["专业", "专业名称", "所在专业", "学生专业"],
  必修课程数量: ["必修课程数量"],
  及格课程数量: ["及格课程数量"],
  成绩排名总人数: ["成绩排名总人数", "成绩排名人数"],
  成绩排名名次: ["成绩排名名次", "成绩名次", "成绩排名"],
  实行综合排名: ["实行综合排名", "是否实行综合排名"],
  排名总人数: ["排名总人数", "综合排名总人数"],
  排名名次: ["排名名次", "综合排名名次"],
  曾获何种奖励: ["曾获何种奖励", "获奖情况", "奖励情况", "获得奖励", "所获奖励"],
  申请理由: ["申请理由"],
  申请日期: ["申请日期", "学生申请日期"],
  辅导员推荐理由: ["辅导员推荐理由", "辅导员意见", "推荐理由"],
  辅导员推荐日期: ["辅导员推荐日期"],
  院系意见: ["院系意见", "院(系)意见", "院（系）意见", "院意见"],
  院系日期: ["院系日期", "院(系)日期", "院（系）日期", "院日期"],
  获奖年份1: ["获奖年份1", "获奖年份一"],
  获奖月份1: ["获奖月份1", "获奖月份一"],
  获奖名称1: ["获奖名称1", "获奖名称一"],
  颁奖单位1: ["颁奖单位1", "颁奖单位一"],
  获奖年份2: ["获奖年份2", "获奖年份二"],
  获奖月份2: ["获奖月份2", "获奖月份二"],
  获奖名称2: ["获奖名称2", "获奖名称二"],
  颁奖单位2: ["颁奖单位2", "颁奖单位二"],
  获奖年份3: ["获奖年份3", "获奖年份三"],
  获奖月份3: ["获奖月份3", "获奖月份三"],
  获奖名称3: ["获奖名称3", "获奖名称三"],
  颁奖单位3: ["颁奖单位3", "颁奖单位三"],
  获奖年份4: ["获奖年份4", "获奖年份四"],
  获奖月份4: ["获奖月份4", "获奖月份四"],
  获奖名称4: ["获奖名称4", "获奖名称四"],
  颁奖单位4: ["颁奖单位4", "颁奖单位四"],
};

const orderedStandardFields = Object.keys(awardFieldAliases) as AwardStandardField[];

export const createAwardFieldResolver = (fields: string[]): AwardFieldResolver => {
  const normalizedFields = fields.map((field, index) => ({
    index,
    field,
    normalized: normalizeHeaderName(field),
  }));
  const fieldToColumn = new Map<AwardStandardField, number>();
  const columnToField = new Map<number, AwardStandardField>();

  const assignFieldColumn = (standardField: AwardStandardField, columnIndex: number) => {
    if (fieldToColumn.has(standardField) || columnToField.has(columnIndex)) return;
    fieldToColumn.set(standardField, columnIndex);
    columnToField.set(columnIndex, standardField);
  };

  orderedStandardFields.forEach((standardField) => {
    const normalizedAliases = awardFieldAliases[standardField].map(normalizeHeaderName);
    const match = normalizedFields.find((item) => !columnToField.has(item.index) && normalizedAliases.includes(item.normalized));
    if (match) assignFieldColumn(standardField, match.index);
  });

  orderedStandardFields.forEach((standardField) => {
    if (fieldToColumn.has(standardField)) return;
    const normalizedAliases = awardFieldAliases[standardField].map(normalizeHeaderName);
    const match = normalizedFields.find((item) =>
        !columnToField.has(item.index) &&
        normalizedAliases.some((alias) => alias && (item.normalized.includes(alias) || alias.includes(item.normalized)))
    );
    if (match) assignFieldColumn(standardField, match.index);
  });

  return {
    getColumn: (field) => fieldToColumn.get(field) ?? null,
    getFieldColumn: (field) => fieldToColumn.get(field) ?? null,
    getActualFieldName: (field) => {
      const columnIndex = fieldToColumn.get(field);
      return columnIndex === undefined ? field : fields[columnIndex] || field;
    },
    getStandardFieldByColumn: (columnIndex) => columnToField.get(columnIndex),
    hasField: (field) => fieldToColumn.has(field),
  };
};

export const getMissingAwardFields = (
  resolver: AwardFieldResolver,
  fields: AwardStandardField[]
) => fields.filter((field) => !resolver.hasField(field));
