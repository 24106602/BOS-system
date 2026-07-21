import type { CSSProperties } from "react";
import AdminCollegesPage from "./AdminCollegesPage";

export default function AdminAccountManagePage() {
  return (
    <section>
      <div style={styles.notice}>
        <div style={styles.eyebrow}>基础信息 / 账号管理</div>
        <h1 style={styles.title}>辅导员与学院账号管理</h1>
        <p style={styles.description}>
          页面读取 Supabase user_profiles，并通过受保护的后端 API 更新或停用账号。手机号、登录账号、所属院系和排序号导入后不可原地修改。
        </p>
      </div>
      <AdminCollegesPage />
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  notice: { marginBottom: 14, background: "#fff", borderRadius: 8, padding: 18, border: "1px solid #d7e1ed", boxShadow: "0 4px 14px rgba(15,35,64,0.05)" },
  eyebrow: { color: "#0077d4", fontSize: 12, fontWeight: 800, marginBottom: 5 },
  title: { margin: 0, color: "#172033", fontSize: 24 },
  description: { color: "#63738a", fontSize: 13, lineHeight: 1.7, margin: "8px 0 0" },
};
