import type { AwardTemplate, AwardType } from "../types/award";
import { createAwardFieldResolver, normalizeHeaderName } from "./awardFieldResolver";

export const awardTypeLabels: Record<AwardType, string> = {
  national: "国家奖学金",
  inspirational: "国家励志奖学金",
  shanghai: "上海市奖学金",
};

export const awardStorageKeys: Record<AwardType, string> = {
  national: "bos_award_national_records",
  inspirational: "bos_award_inspirational_records",
  shanghai: "bos_award_shanghai_records",
};

export const awardTypes: AwardType[] = ["national", "inspirational", "shanghai"];

const isShanghaiFieldStructure = (template: AwardTemplate) => {
  const resolver = createAwardFieldResolver(template.fields);
  const requiredFields = ["学生姓名", "身份证号", "联系电话", "院系名称", "政治面貌", "申请理由", "院系意见"] as const;
  const hasShanghaiAwardGroup = template.fields.some((field) => normalizeHeaderName(field).includes("颁奖单位"));
  return requiredFields.every((field) => resolver.hasField(field)) && hasShanghaiAwardGroup;
};

export const detectAwardTemplateType = (fileName: string, template: AwardTemplate): AwardType | undefined => {
  if (template.outputSheet === "上海市奖学金申请档案") return "shanghai";
  if (isShanghaiFieldStructure(template)) return "shanghai";

  const searchableText = [
    fileName,
    template.outputSheet,
    ...template.fields,
    ...template.requirements.map((item) => String(item ?? "")),
    ...template.sourceRows.slice(0, 8).flat().map((item) => String(item ?? "")),
  ].join(" ");

  if (searchableText.includes(awardTypeLabels.inspirational)) return "inspirational";
  if (searchableText.includes(awardTypeLabels.shanghai)) return "shanghai";
  if (searchableText.includes(awardTypeLabels.national)) return "national";
  return undefined;
};

export const getAwardTemplateValidationError = (
  expectedAwardType: AwardType,
  fileName: string,
  template: AwardTemplate
) => {
  const detectedAwardType = detectAwardTemplateType(fileName, template);
  if (!detectedAwardType) {
    return `无法识别模板类型，请确认上传的是${awardTypeLabels[expectedAwardType]}模板。`;
  }
  if (detectedAwardType !== expectedAwardType) {
    if (expectedAwardType === "shanghai") {
      return "当前页面仅支持上海市奖学金模板，请切换到对应奖项页面处理。";
    }
    return `当前页面仅支持${awardTypeLabels[expectedAwardType]}模板，请切换到${awardTypeLabels[detectedAwardType]}页面处理。`;
  }
  return "";
};
