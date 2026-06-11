import type { CSSProperties } from "react";
import { collegeAccounts } from "../../utils/collegeDetector";

export default function AdminBaseInfoPage() {
  return (
    <section style={styles.card}>
      <div style={styles.eyebrow}>基础信息 / 学院与部门</div>
      <h1 style={styles.title}>学院/部门信息</h1>
      <p style={styles.description}>
        学院名单、学院简称和登录账号映射属于基础信息配置，不属于困难生业务数据。当前仍复用本地学院配置，后续可迁移到正式基础信息表。
      </p>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>提交单位</th>
              <th style={styles.th}>登录账号</th>
              <th style={styles.th}>账号角色</th>
              <th style={styles.th}>是否启用</th>
            </tr>
          </thead>
          <tbody>
            {collegeAccounts.map((college) => (
              <tr key={college.college_code}>
                <td style={styles.nameCell}>{college.college_name}</td>
                <td style={styles.td}>{college.login_email}</td>
                <td style={styles.td}>学院</td>
                <td style={styles.td}>{college.enabled ? "是" : "否"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  card: { background: "#fff", borderRadius: 8, padding: 20, border: "1px solid #d7e1ed", boxShadow: "0 4px 14px rgba(15,35,64,0.05)" },
  eyebrow: { color: "#0077d4", fontSize: 12, fontWeight: 800, marginBottom: 5 },
  title: { margin: 0, color: "#172033", fontSize: 24 },
  description: { color: "#63738a", fontSize: 13, lineHeight: 1.7, margin: "8px 0 14px" },
  tableWrap: { overflow: "auto", border: "1px solid #d7e1ed", borderRadius: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { border: "1px solid #cbd5e1", background: "#edf4fa", padding: 8, whiteSpace: "nowrap" },
  td: { border: "1px solid #cbd5e1", padding: 8, textAlign: "center", whiteSpace: "nowrap" },
  nameCell: { border: "1px solid #cbd5e1", padding: 8, color: "#26364e", whiteSpace: "nowrap" },
};
