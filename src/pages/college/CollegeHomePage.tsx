import type { CSSProperties } from "react";

type CollegeHomePageProps = {
  onNavigate?: (to: string) => void;
};

export default function CollegeHomePage({ onNavigate }: CollegeHomePageProps) {
  return (
    <section>
      <div style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>学院端 / 业务模块入口</div>
          <h1 style={styles.title}>学生事务业务工作台</h1>
          <p style={styles.text}>学院只处理本学院业务数据。困难生业务已启用，三大奖业务保留后续扩展入口。</p>
        </div>
        <div style={styles.heroBadge}>学院数据治理</div>
      </div>

      <div style={styles.businessGrid}>
        <BusinessCard
          icon="困"
          title="困难生业务"
          description="上传本专科信息与家庭成员信息，完成治理后上载到学校端。"
          status="已启用"
          statusTone="enabled"
          metrics={["数据处理", "不通过预览", "提交记录"]}
          actionText="进入业务"
          onClick={() => onNavigate?.("/college/difficulty")}
        />
        <BusinessCard
          icon="奖"
          title="三大奖业务"
          description="后续用于三大奖申报、审核和学院数据上载。"
          status="暂未开放"
          statusTone="pending"
          metrics={["国家奖学金", "国家励志奖学金", "上海市奖学金"]}
          actionText="敬请期待"
          disabled
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
        {metrics.map((item) => <span key={item} style={styles.metricPill}>{item}</span>)}
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
    boxShadow: "0 4px 14px rgba(15,35,64,0.05)",
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
    boxShadow: "0 4px 14px rgba(15,35,64,0.05)",
  },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  cardIcon: { width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 8, background: "#0077d4", color: "#fff", fontWeight: 900 },
  cardIconMuted: { width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 8, background: "#e8eef5", color: "#6b7c92", fontWeight: 900 },
  enabledBadge: { padding: "4px 8px", borderRadius: 999, background: "#e9f8f2", color: "#087b5b", fontSize: 12, fontWeight: 800 },
  pendingBadge: { padding: "4px 8px", borderRadius: 999, background: "#f2f5f8", color: "#728197", fontSize: 12, fontWeight: 800 },
  cardTitle: { margin: "14px 0 8px", color: "#172033", fontSize: 20 },
  cardText: { margin: 0, minHeight: 45, color: "#63738a", fontSize: 13, lineHeight: 1.7 },
  metricList: { display: "flex", flexWrap: "wrap", gap: 7, margin: "14px 0" },
  metricPill: { padding: "5px 8px", borderRadius: 999, background: "#f3f8fd", color: "#52647b", fontSize: 12 },
  primaryButton: { width: "100%", border: "none", borderRadius: 6, padding: "10px 12px", background: "#0077d4", color: "#fff", fontWeight: 800, cursor: "pointer" },
  disabledButton: { width: "100%", border: "none", borderRadius: 6, padding: "10px 12px", background: "#a7b3c2", color: "#fff", fontWeight: 800, cursor: "not-allowed" },
};
