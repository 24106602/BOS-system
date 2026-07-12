import type { CSSProperties } from "react";
import PageHeader from "../../components/ui/PageHeader";
import AdminCard from "../../components/ui/AdminCard";

export default function AdminGrantDatabasePage() {
  return (
    <section className="bos-page-stack">
      <PageHeader
        breadcrumb="国家助学金 / 基础数据"
        title="助学金数据库"
        description="集中维护国家助学金数据，支持查询、导入与导出。"
        actions={<span className="bos-status-badge">基础数据维护</span>}
      />

      <AdminCard className="bos-database-card">
        <div style={styles.placeholder}>
          <div style={styles.placeholderIcon}>助</div>
          <h2 style={styles.placeholderTitle}>助学金数据库待启用</h2>
          <p style={styles.placeholderText}>
            学院端上传国家助学金数据后，全校汇总数据将在此处展示。
          </p>
          <p style={styles.placeholderHint}>
            支持按学院、学年、助学金等级（一级/二级/三级）查询与导出。
          </p>
        </div>
      </AdminCard>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  placeholder: {
    padding: "60px 20px",
    textAlign: "center",
  },
  placeholderIcon: {
    width: 64,
    height: 64,
    margin: "0 auto 16px",
    display: "grid",
    placeItems: "center",
    borderRadius: 12,
    background: "#e8f1fb",
    color: "#0077d4",
    fontSize: 28,
    fontWeight: 900,
  },
  placeholderTitle: {
    margin: "0 0 8px",
    color: "#172033",
    fontSize: 20,
    fontWeight: 600,
  },
  placeholderText: {
    margin: "0 0 6px",
    color: "#63738a",
    fontSize: 14,
  },
  placeholderHint: {
    margin: 0,
    color: "#909399",
    fontSize: 13,
  },
};
