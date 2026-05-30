import type { CSSProperties } from "react";
import StudentDatabasePanel from "../components/StudentDatabasePanel";

export default function DatabasePage() {
  return (
    <div style={styles.databaseLayout}>
      <div style={styles.databasePanel}>
        <div style={styles.windowHeader}>
          <h1 style={styles.title}>困难生数据库</h1>
          <span style={styles.windowBadge}>基础数据维护</span>
        </div>
        <StudentDatabasePanel />
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
    borderRadius: 8,
    padding: 18,
    maxWidth: 1180,
    margin: "0 auto",
    border: "1px solid #d7e1ed",
    boxShadow: "0 4px 14px rgba(15,35,64,0.05)",
  },
  windowHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    margin: 0,
    color: "#1e293b",
  },
  windowBadge: {
    background: "#e8f4ff",
    color: "#0077d4",
    borderRadius: 999,
    padding: "6px 9px",
    fontSize: 12,
    fontWeight: 700,
  },
};
