import type { CSSProperties } from "react";
import MergePanel from "../components/MergePanel";

export default function MergePage() {
  return (
    <div style={styles.databaseLayout}>
      <div style={styles.databasePanel}>
        <div style={styles.windowHeader}>
          <h1 style={styles.title}>全校数据汇总</h1>
          <span style={styles.windowBadge}>学院结果合并</span>
        </div>
        <MergePanel />
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  databaseLayout: {
    height: "calc(100% - 70px)",
    overflowY: "auto",
  },
  databasePanel: {
    background: "#ffffff",
    borderRadius: 24,
    padding: 24,
    maxWidth: 1180,
    margin: "0 auto",
    boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
  },
  windowHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    fontSize: 34,
    margin: 0,
    color: "#1e293b",
  },
  windowBadge: {
    background: "#dbeafe",
    color: "#1d4ed8",
    borderRadius: 999,
    padding: "8px 14px",
    fontSize: 14,
    fontWeight: 700,
  },
};
