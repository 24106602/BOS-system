import type { ProcessLog } from "../types/process";

function nowTime(): string {
  return new Date().toLocaleTimeString();
}

export function createLog(
  level: ProcessLog["level"],
  module: ProcessLog["module"],
  message: string,
  row?: number,
  field?: string
): ProcessLog {
  return {
    time: nowTime(),
    level,
    module,
    row,
    field,
    message,
  };
}

export function createInfoLog(
  module: ProcessLog["module"],
  message: string,
  row?: number,
  field?: string
): ProcessLog {
  return createLog("info", module, message, row, field);
}

export function createWarnLog(
  module: ProcessLog["module"],
  message: string,
  row?: number,
  field?: string
): ProcessLog {
  return createLog("warn", module, message, row, field);
}

export function createErrorLog(
  module: ProcessLog["module"],
  message: string,
  row?: number,
  field?: string
): ProcessLog {
  return createLog("error", module, message, row, field);
}

export function formatLogText(log: ProcessLog): string {
  const rowText = log.row ? ` 第${log.row}行` : "";
  const fieldText = log.field ? ` ${log.field}` : "";
  return `[${log.time}] [${log.level}]${rowText}${fieldText} ${log.message}`;
}