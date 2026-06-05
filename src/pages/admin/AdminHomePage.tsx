import type { CSSProperties } from "react";

type AdminHomePageProps = {
  onNavigate?: (to: string) => void;
};

export default function AdminHomePage({ onNavigate }: AdminHomePageProps) {
  return (
    <section>
      <div style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>学校管理员端 / 业务模块入口</div>
          <h1 style={styles.title}>学生事务数据治理平台</h1>
          <p style={styles.text}>按业务模块进入对应工作区。困难生业务已启用，后续业务会沿用同一套上载、治理、汇总和总库框架。</p>
        </div>
        <div style={styles.heroBadge}>平台运行正常</div>
      </div>

      <div style={styles.businessGrid}>
        <BusinessCard
          icon="困"
          title="困难生业务"
          description="困难生数据治理、学院上载、全校汇总与家庭成员关联。"
          status="已启用"
          statusTone="enabled"
          metrics={["本专科信息汇总", "家庭成员信息汇总", "困难生数据库"]}
          actionText="进入业务"
          onClick={() => onNavigate?.("/admin/difficulty")}
        />
        <BusinessCard
          icon="奖"
          title="三大奖业务"
          description="用于三大奖申报数据治理、学院上载审核和学校端汇总。"
          status="已启用"
          statusTone="enabled"
          metrics={["国家奖学金", "国家励志奖学金", "上海市奖学金"]}
          actionText="进入业务"
          onClick={() => onNavigate?.("/admin/awards")}
        />
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
  disabled,
  onClick,
}: {
  icon: string;
  title: string;
  description: string;
  status: string;
  statusTone: "enabled" | "pending";
  metrics: string[];
  actionText: string;
  disabled?: boolean;
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
      <button style={disabled ? styles.disabledButton : styles.primaryButton} disabled={disabled} onClick={onClick}>
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
    marginTop: 14,
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
  disabledButton: {
    width: "100%",
    border: "none",
    borderRadius: 6,
    padding: "10px 12px",
    background: "#a7b3c2",
    color: "#fff",
    fontWeight: 800,
    cursor: "not-allowed",
  },
};
