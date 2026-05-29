export function normalizeText(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, "");
}

export function normalizePhone(value: unknown): string {
  return normalizeText(value).replace(/[^\d]/g, "");
}

export function normalizeIdCard(value: unknown): string {
  return normalizeText(value).toUpperCase();
}

export function normalizePostcode(value: unknown): string {
  return normalizeText(value).replace(/[^\d]/g, "");
}

export function normalizeAmount(value: unknown): number | "" {
  const text = normalizeText(value).replace(/[^\d.-]/g, "");
  if (!text) return "";
  const num = Number(text);
  return Number.isFinite(num) ? num : "";
}

export function normalizeYesNo(value: unknown): string {
  const text = normalizeText(value);
  if (["是", "有", "yes", "Y", "1"].includes(text)) return "是";
  if (["否", "无", "no", "N", "0"].includes(text)) return "否";
  return text;
}