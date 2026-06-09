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
  | "院系日期";

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
  曾获何种奖励: ["曾获何种奖励", "获奖情况", "奖励情况"],
  申请理由: ["申请理由"],
  申请日期: ["申请日期"],
  辅导员推荐理由: ["辅导员推荐理由", "辅导员意见", "推荐理由"],
  辅导员推荐日期: ["辅导员推荐日期"],
  院系意见: ["院系意见", "院(系)意见", "院（系）意见", "院意见"],
  院系日期: ["院系日期", "院(系)日期", "院（系）日期", "院日期"],
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

  orderedStandardFields.forEach((standardField) => {
    const normalizedAliases = awardFieldAliases[standardField].map(normalizeHeaderName);
    let match = normalizedFields.find((item) => !columnToField.has(item.index) && normalizedAliases.includes(item.normalized));

    if (!match) {
      match = normalizedFields.find((item) =>
        !columnToField.has(item.index) &&
        normalizedAliases.some((alias) => alias && (item.normalized.includes(alias) || alias.includes(item.normalized)))
      );
    }

    if (match && !fieldToColumn.has(standardField)) {
      fieldToColumn.set(standardField, match.index);
      if (!columnToField.has(match.index)) columnToField.set(match.index, standardField);
    }
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
