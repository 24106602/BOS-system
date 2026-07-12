import type { CSSProperties } from "react";

type AdminDifficultyPageProps = {
  onNavigate?: (to: string) => void;
};

export default function AdminDifficultyPage({ onNavigate }: AdminDifficultyPageProps) {
  return (
    <section>
      <div style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>学校管理员端 / 困难生业务</div>
          <h1 style={styles.title}>困难生数据治理平台</h1>
          <p style={styles.text}>管理全校困难生数据，配置在校生数据库，查看学院上报数据汇总。</p>
        </div>
        <div style={styles.heroBadge}>困难生业务已启用</div>
      </div>

      <div style={styles.businessGrid}>
        <BusinessCard
          icon="库"
          title="困难生数据库"
          description="查看和管理全校困难生数据，支持查询、导出和汇总统计。"
          status="已启用"
          statusTone="enabled"
          metrics={["本专科信息汇总", "家庭成员信息关联", "困难等级统计"]}
          actionText="进入管理"
          onClick={() => onNavigate?.("/admin/difficulty/database")}
        />
        <BusinessCard
          icon="在"
          title="在校生数据库"
          description="维护全校在校生基础信息，学院端导入困难生数据时将自动校验学生是否在校。"
          status="已启用"
          statusTone="enabled"
          metrics={["在校生数据导入", "学生身份校验", "按学院/专业查询"]}
          actionText="进入管理"
          onClick={() => onNavigate?.("/admin/difficulty/enrolled")}
        />
      </div>

      <div style={styles.infoCard}>
        <h2 style={styles.infoTitle}>业务流程说明</h2>
        <div style={styles.infoSteps}>
          <div style={styles.infoStep}>
            <span style={styles.infoNumber}>1</span>
            <div>
              <strong>配置在校生数据库</strong>
              <p>在"在校生数据库"中导入全校在校生基础信息（学号、姓名、身份证号等）。</p>
            </div>
          </div>
          <div style={styles.infoStep}>
            <span style={styles.infoNumber}>2</span>
            <div>
              <strong>学院端导入数据</strong>
              <p>各学院登录学院端，上传困难生本专科信息和家庭成员信息。</p>
            </div>
          </div>
          <div style={styles.infoStep}>
            <span style={styles.infoNumber}>3</span>
            <div>
              <strong>系统自动校验</strong>
              <p>系统自动校验学生身份是否在校，未在校学生无法导入成功。</p>
            </div>
          </div>
          <div style={styles.infoStep}>
            <span style={styles.infoNumber}>4</span>
            <div>
              <strong>学校端汇总审核</strong>
              <p>在"困难生数据库"中查看全校汇总数据，进行审核和统计分析。</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BusinessCard({
  icon,
  title,
  description,
  status,
  statusTone,
  metrics,
  actionText,
  onClick,
}: {
  icon: string;
  title: string;
  description: string;
  status: string;
  statusTone: "enabled" | "pending";
  metrics: string[];
  actionText: string;
  onClick?: () => void;
}) {
  return (
    <section style={styles.businessCard}>
      <div style={styles.cardTop}>
        <div style={statusTone === "enabled" ? styles.cardIcon : styles.cardIconMuted}>{icon}</div>
        <span style={statusTone === "enabled" ? styles.enabledBadge : styles.pendingBadge}>{status}</span>
      </div>
      <h2 style={styles.cardTitle}>{title}</h2>
      <p style={styles.cardText}>{description}</p>
      <div style={styles.metricList}>
        {metrics.map((item) => (
          <span key={item} style={styles.metricPill}>{item}</span>
        ))}
      </div>
      <button style={styles.primaryButton} onClick={onClick}>
        {actionText}
      </button>
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
  businessGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 14,
    marginBottom: 14,
  },
  businessCard: {
    padding: 18,
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    background: "#fff",
    boxShadow: "0 4px 14px rgba(15, 35, 64, 0.05)",
  },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  cardIcon: {
    width: 44,
    height: 44,
    display: "grid",
    placeItems: "center",
    borderRadius: 8,
    background: "#0077d4",
    color: "#fff",
    fontWeight: 900,
  },
  cardIconMuted: {
    width: 44,
    height: 44,
    display: "grid",
    placeItems: "center",
    borderRadius: 8,
    background: "#e8eef5",
    color: "#6b7c92",
    fontWeight: 900,
  },
  enabledBadge: {
    padding: "4px 8px",
    borderRadius: 999,
    background: "#e9f8f2",
    color: "#087b5b",
    fontSize: 12,
    fontWeight: 800,
  },
  pendingBadge: {
    padding: "4px 8px",
    borderRadius: 999,
    background: "#f2f5f8",
    color: "#728197",
    fontSize: 12,
    fontWeight: 800,
  },
  cardTitle: { margin: "14px 0 8px", color: "#172033", fontSize: 20 },
  cardText: { margin: 0, minHeight: 45, color: "#63738a", fontSize: 13, lineHeight: 1.7 },
  metricList: { display: "flex", flexWrap: "wrap", gap: 7, margin: "14px 0" },
  metricPill: {
    padding: "5px 8px",
    borderRadius: 999,
    background: "#f3f8fd",
    color: "#52647b",
    fontSize: 12,
  },
  primaryButton: {
    width: "100%",
    border: "none",
    borderRadius: 6,
    padding: "10px 12px",
    background: "#0077d4",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  },
  infoCard: {
    padding: 18,
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    background: "#fff",
    boxShadow: "0 4px 14px rgba(15, 35, 64, 0.05)",
  },
  infoTitle: {
    margin: "0 0 14px",
    color: "#172033",
    fontSize: 18,
    fontWeight: 600,
  },
  infoSteps: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
  },
  infoStep: {
    display: "flex",
    gap: 10,
    padding: 12,
    background: "#f8fafc",
    borderRadius: 6,
  },
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
