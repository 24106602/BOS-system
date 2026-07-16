import { useState, useEffect, type CSSProperties } from "react";
import {
  getAnnouncements,
  formatAnnouncementTime,
  type Announcement,
  type AnnouncementPriority,
} from "../../services/announcementService";

type CollegeHomePageProps = {
  onNavigate?: (to: string) => void;
};

export default function CollegeHomePage({ onNavigate }: CollegeHomePageProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setAnnouncements(getAnnouncements());
  }, []);

  const priorityLabel: Record<AnnouncementPriority, string> = {
    normal: "通知",
    important: "重要",
    urgent: "紧急",
  };

  const hasAnnouncements = announcements.length > 0;
  const current = hasAnnouncements ? announcements[Math.min(activeIndex, announcements.length - 1)] : null;

  return (
    <section>
      {hasAnnouncements && current && !collapsed && (
        <div className="bos-announcement-bar" data-priority={current.priority}>
          <div className="bos-announcement-tag">{priorityLabel[current.priority]}</div>
          <div className="bos-announcement-body">
            <div className="bos-announcement-title">{current.title}</div>
            <div className="bos-announcement-content">{current.content}</div>
            <div className="bos-announcement-meta">
              <span>{current.publisher}</span>
              <span>{formatAnnouncementTime(current.publishedAt)}</span>
            </div>
          </div>
          <div className="bos-announcement-actions">
            {announcements.length > 1 && (
              <>
                <button
                  className="bos-announcement-nav"
                  disabled={activeIndex === 0}
                  onClick={() => setActiveIndex(activeIndex - 1)}
                >
                  ‹
                </button>
                <span className="bos-announcement-pager">
                  {activeIndex + 1} / {announcements.length}
                </span>
                <button
                  className="bos-announcement-nav"
                  disabled={activeIndex >= announcements.length - 1}
                  onClick={() => setActiveIndex(activeIndex + 1)}
                >
                  ›
                </button>
              </>
            )}
            <button className="bos-announcement-close" onClick={() => setCollapsed(true)}>
              ×
            </button>
          </div>
        </div>
      )}

      <div style={styles.hero}>
        <div>
          <h1 style={styles.title}>学部（院）业务工作台</h1>
          <p style={styles.text}>请选择需要办理的业务模块，进入对应工作区进行数据处理。</p>
        </div>
      </div>

      <div style={styles.businessGrid}>
        <BusinessCard
          icon="困"
          title="困难生业务"
          description="上传本专科信息与家庭成员信息，完成治理后上载到学校端。"
          status="已启用"
          statusTone="enabled"
          metrics={["本专科信息处理", "家庭成员信息处理"]}
          actionText="进入业务"
          onClick={() => onNavigate?.("/college/difficulty")}
        />
        <BusinessCard
          icon="奖"
          title="三大奖业务"
          description="用于国家奖学金、国家励志奖学金、上海市奖学金数据治理和上载。"
          status="已启用"
          statusTone="enabled"
          metrics={["国家奖学金", "国家励志奖学金", "上海市奖学金"]}
          actionText="进入业务"
          onClick={() => onNavigate?.("/college/awards")}
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
  title: { margin: "5px 0 7px", color: "#172033", fontSize: 26 },
  text: { margin: 0, color: "#63738a", fontSize: 14, lineHeight: 1.7 },
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
