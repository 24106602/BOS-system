import type { CSSProperties } from "react";
import AdminCollegesPage from "./AdminCollegesPage";

export default function AdminAccountManagePage() {
  return (
    <section>
      <div style={styles.notice}>
        <div style={styles.eyebrow}>基础信息 / 账号管理</div>
        <h1 style={styles.title}>账号管理</h1>
        <p style={styles.description}>
          账号密码后续接入正式权限系统，目前只做账号基础配置预留。页面不会展示、保存或写入任何真实密码。
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
