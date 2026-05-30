import type { CSSProperties } from "react";

export default function CollegeHomePage() {
  return (
    <section>
      <div style={styles.hero}>
        <div style={styles.eyebrow}>学院（部）端</div>
        <h1 style={styles.title}>困难生业务</h1>
        <p style={styles.text}>进入数据处理页面，完成模板上传、数据治理、不通过预览与学校端上载。</p>
      </div>
      <div style={styles.grid}>
        <div style={styles.card}><strong>1</strong><span>上传模板与待处理数据</span></div>
        <div style={styles.card}><strong>2</strong><span>开始治理并修复异常</span></div>
        <div style={styles.card}><strong>3</strong><span>全部通过后上载学校端</span></div>
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  hero: {
    padding: 20,
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    background: "#fff",
    boxShadow: "0 4px 14px rgba(15,35,64,0.05)",
  },
  eyebrow: { color: "#0077d4", fontSize: 13, fontWeight: 800 },
  title: { margin: "5px 0 7px", color: "#172033", fontSize: 26 },
  text: { margin: 0, color: "#63738a", fontSize: 14 },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginTop: 14,
  },
  card: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: 15,
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    background: "#fff",
    color: "#54657c",
    fontSize: 13,
  },
};
