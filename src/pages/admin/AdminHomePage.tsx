import type { CSSProperties } from "react";

type AdminHomePageProps = {
  onNavigate?: (to: string) => void;
};

export default function AdminHomePage({ onNavigate }: AdminHomePageProps) {
  return (
    <section className="bos-admin-home">
      {/* Welcome Banner */}
      <div className="bos-admin-home__welcome">
        <div>
          <h1 style={{ margin: 0, color: "var(--text, #172033)", fontSize: 22, fontWeight: 800 }}>
            欢迎回来，管理员
          </h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted, #63738a)", fontSize: 13 }}>
            2025-2026 学年 · 数据治理平台
          </p>
        </div>
        <div style={{
          padding: "7px 10px",
          borderRadius: 999,
          background: "var(--success-bg, #e9f8f2)",
          color: "var(--success, #0b9b6f)",
          fontSize: 12,
          fontWeight: 800,
          whiteSpace: "nowrap",
          border: "1px solid var(--success-border, #a7e3ca)",
        }}>
          ✓ 平台运行正常
        </div>
      </div>

      {/* Quick Stats */}
      <div className="bos-admin-home__stats">
        <QuickStat icon="困" label="困难生总数" value="1,286" tone="blue" />
        <QuickStat icon="审" label="待审核" value="42" tone="amber" />
        <QuickStat icon="上" label="已上报" value="1,105" tone="green" />
        <QuickStat icon="奖" label="三奖总人数" value="856" tone="purple" />
      </div>

      {/* Business Modules Grid */}
      <div className="bos-admin-home__grid">
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
        <BusinessCard
          icon="助"
          title="助学金业务"
          description="国家助学金数据管理、查询与汇总统计。"
          status="已启用"
          statusTone="enabled"
          metrics={["助学金数据库", "助学金汇总"]}
          actionText="进入业务"
          onClick={() => onNavigate?.("/admin/grant")}
        />
        <BusinessCard
          icon="告"
          title="通知公告"
          description="发布和管理平台通知公告，支持面向全校或指定学院。"
          status="已启用"
          statusTone="enabled"
          metrics={["公告发布", "公告管理"]}
          actionText="进入管理"
          onClick={() => onNavigate?.("/admin/announcement")}
        />
        <BusinessCard
          icon="校"
          title="学校基础信息"
          description="维护学校基本信息、院系信息和账号管理。"
          status="已启用"
          statusTone="enabled"
          metrics={["学校信息", "院系管理", "账号维护"]}
          actionText="进入管理"
          onClick={() => onNavigate?.("/admin/base-info")}
        />
        <BusinessCard
          icon="在"
          title="在校生数据库"
          description="在校生学籍数据库查询与检索。"
          status="已启用"
          statusTone="enabled"
          metrics={["学籍查询", "数据检索"]}
          actionText="进入查询"
          onClick={() => onNavigate?.("/admin/enrolled")}
        />
      </div>

      {/* Inline styles for new classes */}
      <style>{`
        .bos-admin-home {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .bos-admin-home__welcome {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 20px 24px;
          border: 1px solid var(--line, #d7e1ed);
          border-radius: var(--radius-lg, 12px);
          background: var(--panel-bg, #fff);
          box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05));
        }
        .bos-admin-home__stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }
        @media (max-width: 1024px) {
          .bos-admin-home__stats {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        .bos-admin-home__grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 14px;
        }
      `}</style>
    </section>
  );
}

function QuickStat({ icon, label, value, tone }: {
  icon: string;
  label: string;
  value: string;
  tone: "blue" | "amber" | "green" | "purple";
}) {
  const toneColors: Record<string, { bg: string; color: string; border: string }> = {
    blue: { bg: "var(--brand-blue-light, #DBEAFE)", color: "var(--brand-blue, #0077d4)", border: "#BFDBFE" },
    amber: { bg: "#FEF3C7", color: "#B45309", border: "#FDE68A" },
    green: { bg: "var(--success-bg, #e9f8f2)", color: "var(--success, #0b9b6f)", border: "var(--success-border, #a7e3ca)" },
    purple: { bg: "#F3E8FF", color: "#7C3AED", border: "#E9D5FF" },
  };
  const colors = toneColors[tone] || toneColors.blue;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "16px 20px",
      border: `1px solid ${colors.border}`,
      borderRadius: "var(--radius-lg, 12px)",
      background: "var(--panel-bg, #fff)",
      boxShadow: "var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05))",
    }}>
      <div style={{
        width: 44,
        height: 44,
        display: "grid",
        placeItems: "center",
        borderRadius: 10,
        background: colors.bg,
        color: colors.color,
        fontWeight: 900,
        fontSize: 18,
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ display: "grid", gap: 2 }}>
        <span style={{ color: "var(--muted, #63738a)", fontSize: 12, fontWeight: 600 }}>{label}</span>
        <strong style={{ color: "var(--text, #172033)", fontSize: 24, lineHeight: 1 }}>{value}</strong>
      </div>
    </div>
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
    <section style={{
      padding: 18,
      border: "1px solid var(--line, #d7e1ed)",
      borderRadius: "var(--radius-lg, 12px)",
      background: "var(--panel-bg, #fff)",
      boxShadow: "var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05))",
      transition: "box-shadow 200ms ease, transform 200ms ease",
    }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-md, 0 4px 6px rgba(0,0,0,0.07))";
        (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05))";
        (e.currentTarget as HTMLElement).style.transform = "none";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 44,
          height: 44,
          display: "grid",
          placeItems: "center",
          borderRadius: 10,
          background: statusTone === "enabled" ? "var(--brand-blue, #0077d4)" : "var(--line, #d7e1ed)",
          color: statusTone === "enabled" ? "#fff" : "var(--muted, #63738a)",
          fontWeight: 900,
        }}>{icon}</div>
        <span style={{
          padding: "4px 8px",
          borderRadius: 999,
          background: statusTone === "enabled" ? "var(--success-bg, #e9f8f2)" : "var(--panel-soft, #f7fafd)",
          color: statusTone === "enabled" ? "var(--success, #0b9b6f)" : "var(--muted, #63738a)",
          fontSize: 12,
          fontWeight: 800,
          border: `1px solid ${statusTone === "enabled" ? "var(--success-border, #a7e3ca)" : "var(--line, #d7e1ed)"}`,
        }}>{status}</span>
      </div>
      <h2 style={{ margin: "14px 0 8px", color: "var(--text, #172033)", fontSize: 18, fontWeight: 700 }}>{title}</h2>
      <p style={{ margin: 0, minHeight: 40, color: "var(--muted, #63738a)", fontSize: 13, lineHeight: 1.7 }}>{description}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, margin: "14px 0" }}>
        {metrics.map((item) => (
          <span key={item} style={{
            padding: "5px 8px",
            borderRadius: 999,
            background: "var(--panel-soft, #f7fafd)",
            color: "var(--muted, #63738a)",
            fontSize: 12,
            border: "1px solid var(--line, #d7e1ed)",
          }}>{item}</span>
        ))}
      </div>
      <button
        style={{
          width: "100%",
          border: "none",
          borderRadius: "var(--radius-md, 8px)",
          padding: "10px 12px",
          background: disabled ? "var(--line, #d7e1ed)" : "var(--brand-blue, #0077d4)",
          color: "#fff",
          fontWeight: 800,
          cursor: disabled ? "not-allowed" : "pointer",
          fontSize: 14,
          transition: "background-color 150ms ease",
        }}
        disabled={disabled}
        onClick={onClick}
      >
        {actionText}
      </button>
    </section>
  );
}
