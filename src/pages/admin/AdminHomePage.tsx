import type { CSSProperties } from "react";

type AdminHomePageProps = {
  onNavigate?: (to: string) => void;
};

export default function AdminHomePage({ onNavigate }: AdminHomePageProps) {
  return (
    <section>
      <div style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>\u5b66\u6821\u7ba1\u7406\u5458\u7aef / \u4e1a\u52a1\u6a21\u5757\u5165\u53e3</div>
          <h1 style={styles.title}>\u5b66\u751f\u4e8b\u52a1\u6570\u636e\u6cbb\u7406\u5e73\u53f0</h1>
          <p style={styles.text}>\u6309\u4e1a\u52a1\u6a21\u5757\u8fdb\u5165\u5bf9\u5e94\u5de5\u4f5c\u533a\u3002\u56f0\u96be\u751f\u4e1a\u52a1\u5df2\u542f\u7528\uff0c\u540e\u7eed\u4e1a\u52a1\u4f1a\u6cbf\u7528\u540c\u4e00\u5957\u4e0a\u8f7d\u3001\u6cbb\u7406\u3001\u6c47\u603b\u548c\u603b\u5e93\u6846\u67b6\u3002</p>
        </div>
        <div style={styles.heroBadge}>\u5e73\u53f0\u8fd0\u884c\u6b63\u5e38</div>
      </div>

      <div style={styles.businessGrid}>
        <BusinessCard
          icon="\u56f0"
          title="\u56f0\u96be\u751f\u4e1a\u52a1"
          description="\u56f0\u96be\u751f\u6570\u636e\u6cbb\u7406\u3001\u5b66\u9662\u4e0a\u8f7d\u3001\u5168\u6821\u6c47\u603b\u4e0e\u5bb6\u5ead\u6210\u5458\u5173\u8054\u3002"
          status="\u5df2\u542f\u7528"
          statusTone="enabled"
          metrics={["\u672c\u4e13\u79d1\u4fe1\u606f\u6c47\u603b", "\u5bb6\u5ead\u6210\u5458\u4fe1\u606f\u6c47\u603b", "\u56f0\u96be\u751f\u6570\u636e\u5e93"]}
          actionText="\u8fdb\u5165\u4e1a\u52a1"
          onClick={() => onNavigate?.("/admin/difficulty")}
        />
        <BusinessCard
          icon="\u5956"
          title="\u4e09\u5927\u5956\u4e1a\u52a1"
          description="\u7528\u4e8e\u4e09\u5927\u5956\u7533\u62a5\u6570\u636e\u6cbb\u7406\u3001\u5b66\u9662\u4e0a\u8f7d\u5ba1\u6838\u548c\u5b66\u6821\u7aef\u6c47\u603b\u3002"
          status="\u5df2\u542f\u7528"
          statusTone="enabled"
          metrics={["\u56fd\u5bb6\u5956\u5b66\u91d1", "\u56fd\u5bb6\u52b1\u5fd7\u5956\u5b66\u91d1", "\u4e0a\u6d77\u5e02\u5956\u5b66\u91d1"]}
          actionText="\u8fdb\u5165\u4e1a\u52a1"
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
