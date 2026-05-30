import type { CSSProperties } from "react";

export default function AdminHomePage() {
  return (
    <section style={styles.card}>
      <h1 style={styles.title}>学校管理员首页</h1>
      <p style={styles.text}>这里用于查看全校困难生治理总览与任务状态。</p>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  card: { background: "#fff", borderRadius: 16, padding: 20, border: "1px solid #cbd5e1" },
  title: { margin: 0, color: "#0f172a" },
  text: { color: "#475569" },
};
