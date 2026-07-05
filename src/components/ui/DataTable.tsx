import type { ReactNode } from "react";
import LoadingSpinner from "./LoadingSpinner";
import EmptyState from "./EmptyState";

export type DataColumn = {
  key: string;
  label: string;
  width?: number;
  sticky?: boolean;
  render?: (value: unknown, row: Record<string, unknown>, rowIndex: number) => ReactNode;
};

type DataTableProps = {
  columns: DataColumn[];
  rows: Record<string, unknown>[];
  loading?: boolean;
  emptyText?: string;
  selectable?: boolean;
  selectedKeys?: Set<string>;
  rowKey?: (row: Record<string, unknown>, index: number) => string;
  onSelectAll?: (selected: boolean) => void;
  onSelectRow?: (row: Record<string, unknown>, index: number) => void;
  allSelected?: boolean;
  title?: string;
  titleExtra?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export default function DataTable({
  columns,
  rows,
  loading = false,
  emptyText = "暂无数据",
  selectable = false,
  selectedKeys,
  rowKey,
  onSelectAll,
  onSelectRow,
  allSelected = false,
  title,
  titleExtra,
  footer,
  className = "",
}: DataTableProps) {
  return (
    <section className={`bos-table-card${className ? ` ${className}` : ""}`}>
      {(title || titleExtra) && (
        <div className="bos-table-card-head">
          <div>
            {title && <h2>{title}</h2>}
          </div>
          {titleExtra}
        </div>
      )}
      <div className="bos-table-card-body">
        <div>
          <table className="bos-data-table">
            <thead>
              <tr>
                {selectable && (
                  <th className="bos-data-table__checkbox">
                    <input
                      type="checkbox"
                      aria-label="选择当前全部数据"
                      checked={allSelected}
                      onChange={(e) => onSelectAll?.(e.target.checked)}
                    />
                  </th>
                )}
                {columns.map((col) => (
                  <th key={col.key} style={col.width ? { minWidth: col.width } : undefined}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="bos-empty-cell" colSpan={columns.length + (selectable ? 1 : 0)}>
                    <LoadingSpinner text="正在加载..." />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="bos-empty-cell" colSpan={columns.length + (selectable ? 1 : 0)}>
                    <EmptyState text={emptyText} />
                  </td>
                </tr>
              ) : (
                rows.map((row, rowIndex) => {
                  const key = rowKey ? rowKey(row, rowIndex) : String(rowIndex);
                  const isSelected = selectedKeys?.has(key);
                  return (
                    <tr key={key} className={isSelected ? "is-selected" : ""}>
                      {selectable && (
                        <td className="bos-data-table__checkbox">
                          <input
                            type="checkbox"
                            checked={Boolean(isSelected)}
                            onChange={() => onSelectRow?.(row, rowIndex)}
                          />
                        </td>
                      )}
                      {columns.map((col) => (
                        <td key={col.key}>
                          {col.render
                            ? col.render(row[col.key], row, rowIndex)
                            : (row[col.key] as ReactNode) ?? "-"}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {footer && <div className="bos-table-card-foot">{footer}</div>}
    </section>
  );
}
