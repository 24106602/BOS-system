import type { CSSProperties } from "react";

export default function CollegeHomePage() {
  return (
    <section style={styles.card}>
      <h1 style={styles.title}>学院端首页</h1>
      <p style={styles.text}>请进入“上传数据”页面完成模板上传、治理和提交。</p>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  card: { background: "#fff", borderRadius: 16, padding: 20, border: "1px solid #cbd5e1" },
  title: { margin: 0, color: "#0f172a" },
  text: { color: "#475569" },
};
