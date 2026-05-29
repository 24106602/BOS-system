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
