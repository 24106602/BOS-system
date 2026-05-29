// Excel 导出辅助：复制模板工作表、设置标色样式并按模板写入处理结果。
import * as XLSX from "xlsx-js-style";
import type { HighlightInfo } from "./types";

export const cloneWorksheet = (worksheet: XLSX.WorkSheet) => {
  const copy: XLSX.WorkSheet = {};

  Object.keys(worksheet).forEach((key) => {
    const value: unknown = (worksheet as Record<string, unknown>)[key];

    if (Array.isArray(value)) (copy as Record<string, unknown>)[key] = JSON.parse(JSON.stringify(value));
    else if (value && typeof value === "object") (copy as Record<string, unknown>)[key] = { ...value };
    else (copy as Record<string, unknown>)[key] = value;
  });

  return copy;
};

export const yellowStyle = { fill: { patternType: "solid", fgColor: { rgb: "FFFF00" } } };
export const redStyle = {
  fill: { patternType: "solid", fgColor: { rgb: "FF0000" } },
  font: { color: { rgb: "FFFFFF" }, bold: true },
};
export const purpleStyle = {
  fill: { patternType: "solid", fgColor: { rgb: "B084F5" } },
  font: { color: { rgb: "FFFFFF" }, bold: true },
};

export const applyHighlightStyle = (
  cell: Record<string, unknown>,
  mark: HighlightInfo | undefined
) => {
  if (!mark) return cell;

  return {
    ...cell,
    s: {
      ...((cell.s as Record<string, unknown>) || {}),
      ...(mark.color === "red" ? redStyle : mark.color === "purple" ? purpleStyle : yellowStyle),
    },
  };
};
