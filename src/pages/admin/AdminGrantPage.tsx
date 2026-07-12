import type { CSSProperties } from "react";

type AdminGrantPageProps = {
  onNavigate?: (to: string) => void;
};

export default function AdminGrantPage({ onNavigate }: AdminGrantPageProps) {
  return (
    <section>
      <div style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>学校管理员端 / 国家助学金</div>
          <h1 style={styles.title}>国家助学金数据治理平台</h1>
          <p style={styles.text}>管理全校国家助学金数据，统计学院上传情况，查看助学金申请与发放汇总。</p>
        </div>
        <div style={styles.heroBadge}>助学金业务已启用</div>
      </div>

      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>已提交学院数</span>
          <strong style={styles.statValue}>0</strong>
        </div>
        <div style={{ ...styles.statCard, ...styles.statBlue }}>
          <span style={styles.statLabel}>一级助学金</span>
          <strong style={styles.statValue}>0</strong>
        </div>
        <div style={{ ...styles.statCard, ...styles.statGreen }}>
          <span style={styles.statLabel}>二级助学金</span>
          <strong style={styles.statValue}>0</strong>
        </div>
        <div style={{ ...styles.statCard, ...styles.statAmber }}>
          <span style={styles.statLabel}>三级助学金</span>
          <strong style={styles.statValue}>0</strong>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.tabs}>
            <button style={styles.tabActive}>助学金申请汇总</button>
          </div>
          <button style={styles.primaryButton} onClick={() => onNavigate?.("/admin/grant/database")}>
            进入助学金数据库
          </button>
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>序号</th>
                <th style={styles.th}>学院名称</th>
                <th style={styles.th}>学年</th>
                <th style={styles.th}>一级助学金人数</th>
                <th style={styles.th}>二级助学金人数</th>
                <th style={styles.th}>三级助学金人数</th>
                <th style={styles.th}>合计</th>
                <th style={styles.th}>提交时间</th>
                <th style={styles.th}>状态</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={9} style={styles.empty}>
                  暂无助学金提交数据
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style={styles.infoCard}>
        <h2 style={styles.infoTitle}>业务流程说明</h2>
        <div style={styles.infoSteps}>
          <div style={styles.infoStep}>
            <span style={styles.infoNumber}>1</span>
            <div>
              <strong>配置在校生数据库</strong>
              <p>在侧边栏"在校生数据库"中导入全校在校生基础信息。</p>
            </div>
          </div>
          <div style={styles.infoStep}>
            <span style={styles.infoNumber}>2</span>
            <div>
              <strong>学院端导入数据</strong>
              <p>各学院上传国家助学金申请数据，系统自动校验在校身份和困难生资格。</p>
            </div>
          </div>
          <div style={styles.infoStep}>
            <span style={styles.infoNumber}>3</span>
            <div>
              <strong>学校端汇总统计</strong>
              <p>在本页面查看各学院上传情况，按助学金等级统计人数。</p>
            </div>
          </div>
          <div style={styles.infoStep}>
            <span style={styles.infoNumber}>4</span>
            <div>
              <strong>助学金数据库管理</strong>
              <p>进入助学金数据库查看、导出和审核全校汇总数据。</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  hero: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: 20,
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    background: "#fff",
    boxShadow: "0 4px 14px rgba(15, 35, 64, 0.05)",
    marginBottom: 14,
  },
  eyebrow: { color: "#0077d4", fontSize: 13, fontWeight: 800 },
  title: { margin: "5px 0 7px", color: "#172033", fontSize: 26 },
  text: { margin: 0, color: "#63738a", fontSize: 14, lineHeight: 1.7 },
  heroBadge: {
    padding: "7px 10px",
    borderRadius: 999,
    background: "#e9f8f2",
    color: "#087b5b",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
    marginBottom: 14,
  },
  statCard: {
    padding: 16,
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    background: "#fff",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  statBlue: { borderLeft: "4px solid #409eff" },
  statGreen: { borderLeft: "4px solid #67c23a" },
  statAmber: { borderLeft: "4px solid #e6a23c" },
  statLabel: { color: "#63738a", fontSize: 13 },
  statValue: { color: "#172033", fontSize: 24 },
  card: {
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    background: "#fff",
    overflow: "hidden",
    marginBottom: 14,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid #e4e7ed",
  },
  tabs: { display: "flex", gap: 0 },
  tabActive: {
    padding: "8px 18px",
    border: "1px solid #409eff",
    borderBottom: "none",
    background: "#fff",
    color: "#409eff",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: "4px 4px 0 0",
  },
  primaryButton: {
    padding: "7px 18px",
    border: "none",
    borderRadius: 4,
    background: "#0077d4",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  tableWrap: { overflow: "auto", maxHeight: 400 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    border: "1px solid #cbd5e1",
    padding: "8px 10px",
    background: "#edf4fa",
    textAlign: "center",
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    zIndex: 1,
  },
  empty: {
    padding: 40,
    textAlign: "center",
    color: "#909399",
  },
  infoCard: {
    padding: 18,
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    background: "#fff",
    boxShadow: "0 4px 14px rgba(15, 35, 64, 0.05)",
  },
  infoTitle: { margin: "0 0 14px", color: "#172033", fontSize: 18, fontWeight: 600 },
  infoSteps: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
  },
  infoStep: { display: "flex", gap: 10, padding: 12, background: "#f8fafc", borderRadius: 6 },
  infoNumber: {
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 50,
    background: "#0077d4",
    color: "#fff",
    fontWeight: 800,
    fontSize: 14,
    flexShrink: 0,
  },
};
