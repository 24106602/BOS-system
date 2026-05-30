import type { CSSProperties } from "react";

export type ValidationError = {
  row: number;
  column: string;
  field: string;
  value: string;
  reason: string;
  level: "error" | "warning";
};

type ErrorReportTableProps = {
  errors: ValidationError[];
};

export default function ErrorReportTable({ errors }: ErrorReportTableProps) {
  if (errors.length === 0) {
    return <div style={styles.empty}>暂无错误</div>;
  }

  return (
    <div style={styles.wrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>行号</th>
            <th style={styles.th}>列名</th>
            <th style={styles.th}>字段</th>
            <th style={styles.th}>原值</th>
            <th style={styles.th}>错误原因</th>
            <th style={styles.th}>严重程度</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((item, index) => (
            <tr key={`${item.row}-${item.field}-${index}`}>
              <td style={styles.td}>{item.row}</td>
              <td style={styles.td}>{item.column}</td>
              <td style={styles.td}>{item.field}</td>
              <td style={styles.td}>{item.value}</td>
              <td style={styles.td}>{item.reason}</td>
              <td style={{ ...styles.td, color: item.level === "error" ? "#dc2626" : "#f97316" }}>{item.level}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    maxHeight: 240,
    overflow: "auto",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    border: "1px solid #cbd5e1",
    background: "#e2e8f0",
    padding: 8,
    position: "sticky",
    top: 0,
    whiteSpace: "nowrap",
  },
  td: {
    border: "1px solid #cbd5e1",
    padding: 8,
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  empty: {
    color: "#64748b",
    padding: 12,
  },
};
