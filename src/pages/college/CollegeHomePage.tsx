import { useState, useMemo, useEffect, type CSSProperties } from "react";
import {
  queryAnnouncements,
  formatAnnouncementDate,
  formatAnnouncementTime,
  priorityLabel,
  type Announcement,
  type AnnouncementPriority,
} from "../../services/announcementService";

type CollegeHomePageProps = {
  onNavigate?: (to: string) => void;
};

export default function CollegeHomePage({ onNavigate }: CollegeHomePageProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<AnnouncementPriority | "">("");
  const [detailItem, setDetailItem] = useState<Announcement | null>(null);

  const allAnnouncements = useMemo(() => queryAnnouncements({}), [refreshKey]);

  const filteredList = useMemo(() => {
    return queryAnnouncements({
      keyword,
      startDate,
      endDate,
      priority: priorityFilter,
    });
  }, [allAnnouncements, keyword, startDate, endDate, priorityFilter]);

  useEffect(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const resetFilters = () => {
    setKeyword("");
    setStartDate("");
    setEndDate("");
    setPriorityFilter("");
  };

  const hasAnnouncements = allAnnouncements.length > 0;

  return (
    <section>
      <div style={styles.hero}>
        <div>
          <h1 style={styles.title}>业务工作台</h1>
          <p style={styles.text}>请选择需要办理的业务模块，进入对应工作区进行数据处理。</p>
        </div>
      </div>

      <div style={styles.noticeCard}>
        <div style={styles.noticeHead}>
          <h2 style={styles.noticeTitle}>通知公告</h2>
          <span style={styles.noticeCount}>共 {filteredList.length} 条通知</span>
        </div>

        <div style={styles.noticeFilter}>
          <label style={styles.filterField}>
            公告名称
            <input
              style={styles.input}
              placeholder="输入公告标题或内容关键词"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </label>
          <label style={styles.filterField}>
            开始日期
            <input style={styles.input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label style={styles.filterField}>
            结束日期
            <input style={styles.input} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <label style={styles.filterField}>
            优先级
            <select style={styles.input} value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as AnnouncementPriority | "")}>
              <option value="">全部</option>
              <option value="normal">通知</option>
              <option value="important">重要</option>
              <option value="urgent">紧急</option>
            </select>
          </label>
          <button style={styles.resetBtn} onClick={resetFilters}>重置</button>
        </div>

        <div style={styles.noticeList}>
          {!hasAnnouncements ? (
            <div style={styles.noticeEmpty}>暂无通知公告</div>
          ) : filteredList.length === 0 ? (
            <div style={styles.noticeEmpty}>未找到符合条件的通知</div>
          ) : (
            filteredList.map((item) => (
              <button key={item.id} style={styles.noticeItem} onClick={() => setDetailItem(item)}>
                <span style={{ ...styles.priorityTag, ...priorityStyles[item.priority] }}>
                  {priorityLabel[item.priority]}
                </span>
                <div style={styles.noticeItemBody}>
                  <div style={styles.noticeItemTitle}>{item.title}</div>
                  <div style={styles.noticeItemDesc}>
                    <span>{item.publisher}</span>
                    <span style={styles.noticeItemTime}>{formatAnnouncementTime(item.publishedAt)}</span>
                  </div>
                </div>
                <span style={styles.noticeItemDate}>{formatAnnouncementDate(item.publishedAt)}</span>
              </button>
            ))
          )}
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

      {detailItem && (
        <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />
      )}
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

function DetailModal({ item, onClose }: { item: Announcement; onClose: () => void }) {
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>通知详情</h2>
          <button style={styles.modalClose} onClick={onClose}>×</button>
        </div>
        <div style={styles.modalBody}>
          <div style={styles.detailTag}>
            <span style={{ ...styles.priorityTag, ...priorityStyles[item.priority] }}>
              {priorityLabel[item.priority]}
            </span>
            <span style={styles.detailMeta}>{item.publisher} · {formatAnnouncementDate(item.publishedAt)}</span>
          </div>
          <h3 style={styles.detailTitle}>{item.title}</h3>
          <div style={styles.detailContent}>{item.content}</div>
        </div>
        <div style={styles.modalFoot}>
          <button style={styles.primaryBtn} onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}

const priorityStyles: Record<AnnouncementPriority, CSSProperties> = {
  normal: { color: "#409eff", background: "#ecf5ff" },
  important: { color: "#e6a23c", background: "#fdf6ec" },
  urgent: { color: "#f56c6c", background: "#fef0f0" },
};

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
  noticeCard: {
    marginTop: 14,
    background: "#fff",
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    overflow: "hidden",
  },
  noticeHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid #ebeef5" },
  noticeTitle: { margin: 0, fontSize: 16, color: "#172033" },
  noticeCount: { fontSize: 12, color: "#909399" },
  noticeFilter: { display: "flex", flexWrap: "wrap", gap: 12, padding: "14px 18px", borderBottom: "1px solid #f5f5f5", alignItems: "flex-end" },
  filterField: { display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "#63738a" },
  input: {
    padding: "7px 10px",
    border: "1px solid #dcdfe6",
    borderRadius: 4,
    fontSize: 13,
    outline: "none",
    minWidth: 150,
    color: "#172033",
  },
  resetBtn: { padding: "7px 14px", border: "1px solid #dcdfe6", borderRadius: 4, background: "#fff", color: "#606266", fontSize: 13, cursor: "pointer" },
  noticeList: { maxHeight: 380, overflowY: "auto" },
  noticeEmpty: { padding: "40px 20px", textAlign: "center", color: "#909399", fontSize: 14 },
  noticeItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "12px 18px",
    border: "none",
    borderBottom: "1px solid #f5f5f5",
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
    transition: "background 0.15s ease",
  },
  priorityTag: { padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 700, flex: "0 0 auto" },
  noticeItemBody: { flex: 1, minWidth: 0 },
  noticeItemTitle: { fontSize: 14, fontWeight: 500, color: "#172033", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  noticeItemDesc: { display: "flex", gap: 10, marginTop: 3, fontSize: 12, color: "#a0a8b3" },
  noticeItemTime: { color: "#c0c4cc" },
  noticeItemDate: { flex: "0 0 auto", fontSize: 12, color: "#a0a8b3" },
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
  modalOverlay: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.4)",
    display: "grid",
    placeItems: "center",
    zIndex: 1000,
  },
  modalBox: { background: "#fff", borderRadius: 8, width: "min(560px, 90vw)", maxHeight: "85vh", display: "flex", flexDirection: "column" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #ebeef5" },
  modalTitle: { margin: 0, fontSize: 17, color: "#172033" },
  modalClose: { border: "none", background: "none", fontSize: 22, color: "#909399", cursor: "pointer", lineHeight: 1 },
  modalBody: { padding: 20, overflowY: "auto" },
  detailTag: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
  detailMeta: { fontSize: 12, color: "#909399" },
  detailTitle: { margin: "0 0 12px", fontSize: 18, color: "#172033" },
  detailContent: { fontSize: 14, color: "#4a5568", lineHeight: 1.8, whiteSpace: "pre-wrap" },
  modalFoot: { display: "flex", justifyContent: "flex-end", gap: 10, padding: "12px 20px", borderTop: "1px solid #ebeef5" },
  primaryBtn: { padding: "8px 18px", border: "none", borderRadius: 4, background: "#409eff", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" },
};
