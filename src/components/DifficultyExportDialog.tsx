import { useMemo, useState } from "react";
import {
  DEFAULT_DIFFICULTY_EXPORT_COLUMN_KEYS,
  DEFAULT_DIFFICULTY_EXPORT_LIMIT,
  DIFFICULTY_EXPORT_COLUMNS,
  MAX_DIFFICULTY_EXPORT_LIMIT,
} from "../constants/difficultyExportColumns";
import {
  exportDifficultyStudents,
  type DifficultyExportFilters,
  type DifficultyExportFormat,
} from "../services/difficultyStudentApi";

type DifficultyExportDialogProps = {
  academicYear: string;
  filters?: DifficultyExportFilters;
  onClose: () => void;
  onCompleted?: (message: string) => void;
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export default function DifficultyExportDialog({
  academicYear,
  filters,
  onClose,
  onCompleted,
}: DifficultyExportDialogProps) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(DEFAULT_DIFFICULTY_EXPORT_COLUMN_KEYS)
  );
  const [format, setFormat] = useState<DifficultyExportFormat>("xlsx");
  const [limit, setLimit] = useState(DEFAULT_DIFFICULTY_EXPORT_LIMIT);
  const [startIndex, setStartIndex] = useState(1);
  const [sensitiveConfirmed, setSensitiveConfirmed] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [message, setMessage] = useState("");

  const selectedColumns = useMemo(
    () => DIFFICULTY_EXPORT_COLUMNS.filter((column) => selectedKeys.has(column.key)),
    [selectedKeys]
  );
  const selectedSensitiveColumns = useMemo(
    () => selectedColumns.filter((column) => column.sensitive),
    [selectedColumns]
  );

  const toggleColumn = (key: string) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectNonSensitiveColumns = () => {
    setSelectedKeys(new Set(
      DIFFICULTY_EXPORT_COLUMNS
        .filter((column) => !column.sensitive)
        .map((column) => column.key)
    ));
    setSensitiveConfirmed(false);
  };

  const resetColumns = () => {
    setSelectedKeys(new Set(DEFAULT_DIFFICULTY_EXPORT_COLUMN_KEYS));
    setSensitiveConfirmed(false);
  };

  const handleExport = async () => {
    if (selectedColumns.length === 0) {
      setMessage("请至少选择一个导出字段。");
      return;
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_DIFFICULTY_EXPORT_LIMIT) {
      setMessage(`单次导出条数必须为 1 ~ ${MAX_DIFFICULTY_EXPORT_LIMIT} 之间的整数。`);
      return;
    }
    if (!Number.isInteger(startIndex) || startIndex < 1) {
      setMessage("起始条数必须为不小于 1 的整数。");
      return;
    }
    if (selectedSensitiveColumns.length > 0 && !sensitiveConfirmed) {
      setMessage("所选字段包含敏感信息，请先阅读提示并勾选确认。");
      return;
    }

    setIsExporting(true);
    setMessage("");
    try {
      const result = await exportDifficultyStudents({
        academicYear,
        columns: selectedColumns.map((column) => column.key),
        includeSensitive: selectedSensitiveColumns.length > 0 && sensitiveConfirmed,
        limit,
        offset: startIndex - 1,
        format,
        filters,
      });
      downloadBlob(result.blob, result.fileName);
      const resultMessage = result.hasMore
        ? `已导出 ${result.rowCount} 条。仍有后续数据，下一批将从第 ${result.nextOffset + 1} 条开始。`
        : `已导出 ${result.rowCount} 条，当前筛选范围已导出完毕。`;
      setMessage(resultMessage);
      if (result.hasMore) setStartIndex(result.nextOffset + 1);
      onCompleted?.(resultMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "困难生名单导出失败，请稍后重试。");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bos-modal-backdrop difficulty-export-backdrop">
      <section className="bos-modal difficulty-export-modal" role="dialog" aria-modal="true" aria-labelledby="difficulty-export-title">
        <div className="bos-modal-header">
          <div>
            <h2 id="difficulty-export-title">困难生名单导出</h2>
            <p>从后端困难生数据库按当前筛选条件导出，导出行为将写入操作日志。</p>
          </div>
          <button disabled={isExporting} onClick={onClose}>关闭</button>
        </div>

        <div className="bos-modal-body difficulty-export-body">
          <section className="difficulty-export-config">
            <label>
              导出格式
              <select value={format} onChange={(event) => setFormat(event.target.value as DifficultyExportFormat)}>
                <option value="xlsx">Excel（.xlsx）</option>
                <option value="csv">CSV（.csv）</option>
              </select>
            </label>
            <label>
              单次导出条数
              <input
                type="number"
                min={1}
                max={MAX_DIFFICULTY_EXPORT_LIMIT}
                step={1}
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value))}
              />
              <small>上限 {MAX_DIFFICULTY_EXPORT_LIMIT} 条，超出请分批导出</small>
            </label>
            <label>
              从第几条开始
              <input
                type="number"
                min={1}
                step={1}
                value={startIndex}
                onChange={(event) => setStartIndex(Number(event.target.value))}
              />
              <small>首批从第 1 条开始</small>
            </label>
          </section>

          <section className="difficulty-export-columns-section">
            <div className="difficulty-export-section-heading">
              <div>
                <h3>选择导出字段</h3>
                <span>已选择 {selectedColumns.length} 列，敏感字段 {selectedSensitiveColumns.length} 列</span>
              </div>
              <div className="difficulty-export-column-actions">
                <button onClick={resetColumns}>恢复基础列</button>
                <button onClick={selectNonSensitiveColumns}>全选非敏感列</button>
              </div>
            </div>

            <div className="difficulty-export-column-grid">
              {DIFFICULTY_EXPORT_COLUMNS.map((column) => (
                <label
                  key={column.key}
                  className={`difficulty-export-column${column.sensitive ? " is-sensitive" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedKeys.has(column.key)}
                    onChange={() => toggleColumn(column.key)}
                  />
                  <span>{column.label}</span>
                  {column.sensitive && <strong className="difficulty-sensitive-badge">敏感</strong>}
                </label>
              ))}
            </div>
          </section>

          {selectedSensitiveColumns.length > 0 && (
            <section className="difficulty-export-sensitive-warning">
              <strong>敏感信息导出确认</strong>
              <p>
                当前包含：{selectedSensitiveColumns.map((column) => column.label).join("、")}。
                请仅在工作必需且符合数据授权范围时导出，系统将记录操作人、时间、字段和条数。
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={sensitiveConfirmed}
                  onChange={(event) => setSensitiveConfirmed(event.target.checked)}
                />
                我已确认本次导出敏感信息具有工作必要性，并承担数据安全责任
              </label>
            </section>
          )}

          {message && <div className="difficulty-export-message">{message}</div>}
        </div>

        <div className="difficulty-export-footer">
          <span>{academicYear} 学年 · 导出字段与条数将记录到操作日志</span>
          <div>
            <button disabled={isExporting} onClick={onClose}>取消</button>
            <button
              className="is-primary"
              disabled={isExporting || selectedColumns.length === 0}
              onClick={() => void handleExport()}
            >
              {isExporting ? "正在生成文件..." : "确认导出"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
