import StudentDatabasePanel from "../components/StudentDatabasePanel";
import AdminCard from "../components/ui/AdminCard";
import PageHeader from "../components/ui/PageHeader";

export default function DatabasePage() {
  return (
    <section className="bos-page-stack">
      <PageHeader
        breadcrumb="困难生业务 / 基础数据"
        title="困难生数据库"
        description="集中维护困难生基础数据，支持查询、导入与导出。"
        actions={<span className="bos-status-badge">基础数据维护</span>}
      />
      <AdminCard className="bos-database-card">
        <StudentDatabasePanel />
      </AdminCard>
    </section>
  );
}
