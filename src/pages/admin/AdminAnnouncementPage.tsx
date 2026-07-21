import { useState, useMemo, type CSSProperties } from "react";
import {
  getAnnouncements,
  saveAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  restoreAnnouncement,
  formatAnnouncementDate,
  priorityLabel,
  type Announcement,
  type AnnouncementPriority,
} from "../../services/announcementService";

type ModalState = {
  mode: "create" | "edit" | null;
  editing?: Announcement | null;
};

export default function AdminAnnouncementPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<AnnouncementPriority | "">("");
  const [modal, setModal] = useState<ModalState>({ mode: null });
  const [detailItem, setDetailItem] = useState<Announcement | null>(null);
  const [showDisabled, setShowDisabled] = useState(false);

  const allAnnouncements = useMemo(
    () => {
      void refreshKey;
      return getAnnouncements({ includeDisabled: showDisabled });
    },
    [refreshKey, showDisabled]
  );

  const filteredList = useMemo(() => {
    let list = allAnnouncements;

    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(kw) ||
          a.content.toLowerCase().includes(kw) ||
          a.publisher.toLowerCase().includes(kw)
      );
    }

    if (priorityFilter) {
      list = list.filter((a) => a.priority === priorityFilter);
    }

    if (startDate) {
      const start = new Date(startDate + "T00:00:00").getTime();
      list = list.filter((a) => new Date(a.publishedAt).getTime() >= start);
    }

    if (endDate) {
      const end = new Date(endDate + "T23:59:59").getTime();
      list = list.filter((a) => new Date(a.publishedAt).getTime() <= end);
    }

    return list;
  }, [allAnnouncements, keyword, priorityFilter, startDate, endDate]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const resetFilters = () => {
    setKeyword("");
    setStartDate("");
    setEndDate("");
    setPriorityFilter("");
  };

  const handleSave = (data: { title: string; content: string; priority: AnnouncementPriority; publisher: string }) => {
    if (modal.mode === "create") {
      saveAnnouncement(data);
    } else if (modal.mode === "edit" && modal.editing) {
      updateAnnouncement(modal.editing.id, data);
    }
    setModal({ mode: null });
    refresh();
  };

  const handleDelete = (id: string) => {
    if (window.confirm("删除后记录将转为已禁用，可由管理员恢复。确定？")) {
      deleteAnnouncement(id);
      refresh();
    }
  };

  const handleRestore = (id: string) => {
    if (!window.confirm("确定恢复此通知吗？")) return;
    restoreAnnouncement(id);
    refresh();
  };

  return (
    <section className="bos-table-page">
      <div style={styles.header}>
        <h1 style={styles.title}>通知公告管理</h1>
        <div style={styles.headerActions}>
          <button style={styles.resetBtn} onClick={() => setShowDisabled((value) => !value)}>
            {showDisabled ? "仅看启用记录" : "查看已禁用记录"}
          </button>
          <button style={styles.primaryBtn} onClick={() => setModal({ mode: "create" })}>+ 发布通知</button>
        </div>
      </div>

      <div style={styles.filterCard}>
        <div style={styles.filterGrid}>
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
      </div>

      <div style={styles.tableCard}>
        <div style={styles.tableHead}>
          <h2 style={styles.tableTitle}>通知列表</h2>
          <span style={styles.tableCount}>共 {filteredList.length} 条</span>
        </div>
        <div style={styles.tableScroll}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>标题</th>
                <th style={{ ...styles.th, width: 80 }}>优先级</th>
                <th style={{ ...styles.th, width: 140 }}>发布人</th>
                <th style={{ ...styles.th, width: 160 }}>发布时间</th>
                <th style={{ ...styles.th, width: 90 }}>状态</th>
                <th style={{ ...styles.th, width: 160 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={6} style={styles.empty}>暂无通知公告</td>
                </tr>
              ) : (
                filteredList.map((item) => (
                  <tr key={item.id}>
                    <td style={styles.tdTitle}>
                      <button style={styles.linkBtn} onClick={() => setDetailItem(item)}>
                        {item.title}
                      </button>
                    </td>
                    <td style={styles.td}>
                      <span style={{ ...styles.priorityTag, ...priorityStyles[item.priority] }}>
                        {priorityLabel[item.priority]}
                      </span>
                    </td>
                    <td style={styles.td}>{item.publisher}</td>
                    <td style={styles.td}>{formatAnnouncementDate(item.publishedAt)}</td>
                    <td style={styles.td}>
                      <span style={item.status === "disabled" ? styles.disabledTag : styles.activeTag}>
                        {item.status === "disabled" ? "已禁用" : "启用"}
                      </span>
                    </td>
                    <td style={styles.td}>
                      {item.status === "disabled" ? (
                        <button style={styles.restoreBtn} onClick={() => handleRestore(item.id)}>恢复</button>
                      ) : (
                        <>
                          <button style={styles.editBtn} onClick={() => setModal({ mode: "edit", editing: item })}>编辑</button>
                          <button style={styles.delBtn} onClick={() => handleDelete(item.id)}>删除</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal.mode && (
        <AnnouncementModal
          mode={modal.mode}
          editing={modal.editing}
          onSave={handleSave}
          onClose={() => setModal({ mode: null })}
        />
      )}

      {detailItem && (
        <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />
      )}
    </section>
  );
}

function AnnouncementModal({
  mode,
  editing,
  onSave,
  onClose,
}: {
  mode: "create" | "edit";
  editing?: Announcement | null;
  onSave: (data: { title: string; content: string; priority: AnnouncementPriority; publisher: string }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(editing?.title || "");
  const [content, setContent] = useState(editing?.content || "");
  const [priority, setPriority] = useState<AnnouncementPriority>(editing?.priority || "normal");
  const [publisher, setPublisher] = useState(editing?.publisher || "学校资助管理中心");

  const handleSubmit = () => {
    if (!title.trim()) {
      window.alert("请填写公告标题");
      return;
    }
    if (!content.trim()) {
      window.alert("请填写公告内容");
      return;
    }
    onSave({ title: title.trim(), content: content.trim(), priority, publisher: publisher.trim() || "学校资助管理中心" });
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>{mode === "create" ? "发布通知" : "编辑通知"}</h2>
          <button style={styles.modalClose} onClick={onClose}>×</button>
        </div>
        <div style={styles.modalBody}>
          <label style={styles.formField}>
            公告标题
            <input style={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="请输入公告标题" />
          </label>
          <label style={styles.formField}>
            优先级
            <select style={styles.input} value={priority} onChange={(e) => setPriority(e.target.value as AnnouncementPriority)}>
              <option value="normal">通知</option>
              <option value="important">重要</option>
              <option value="urgent">紧急</option>
            </select>
          </label>
          <label style={styles.formField}>
            发布人
            <input style={styles.input} value={publisher} onChange={(e) => setPublisher(e.target.value)} placeholder="发布单位/部门" />
          </label>
          <label style={styles.formField}>
            公告内容
            <textarea style={{ ...styles.input, ...styles.textarea }} value={content} onChange={(e) => setContent(e.target.value)} placeholder="请输入公告内容" rows={6} />
          </label>
        </div>
        <div style={styles.modalFoot}>
          <button style={styles.cancelBtn} onClick={onClose}>取消</button>
          <button style={styles.primaryBtn} onClick={handleSubmit}>
            {mode === "create" ? "发布" : "保存"}
          </button>
        </div>
      </div>
    </div>
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
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  headerActions: { display: "flex", gap: 8, alignItems: "center" },
  title: { margin: 0, color: "#172033", fontSize: 22 },
  filterCard: {
    background: "#fff",
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    padding: 16,
    marginBottom: 14,
  },
  filterGrid: { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" },
  filterField: { display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "#63738a" },
  input: {
    padding: "8px 10px",
    border: "1px solid #dcdfe6",
    borderRadius: 4,
    fontSize: 13,
    outline: "none",
    minWidth: 160,
    color: "#172033",
  },
  textarea: { resize: "vertical", minHeight: 100, fontFamily: "inherit" },
  tableCard: { background: "#fff", border: "1px solid #d7e1ed", borderRadius: 8, overflow: "hidden" },
  tableHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #ebeef5" },
  tableTitle: { margin: 0, fontSize: 16, color: "#172033" },
  tableCount: { fontSize: 12, color: "#909399" },
  tableScroll: { maxHeight: 480, overflow: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    position: "sticky",
    top: 0,
    background: "#f5f7fa",
    padding: "10px 12px",
    textAlign: "left",
    fontWeight: 700,
    color: "#303133",
    borderBottom: "1px solid #ebeef5",
    whiteSpace: "nowrap",
  },
  td: { padding: "10px 12px", borderBottom: "1px solid #f0f0f0", color: "#606266", verticalAlign: "middle" },
  tdTitle: { padding: "10px 12px", borderBottom: "1px solid #f0f0f0" },
  empty: { padding: "40px 20px", textAlign: "center", color: "#909399" },
  priorityTag: { padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 700, display: "inline-block" },
  linkBtn: { background: "none", border: "none", color: "#409eff", cursor: "pointer", fontSize: 13, padding: 0, fontWeight: 500 },
  editBtn: { padding: "5px 12px", border: "1px solid #dcdfe6", borderRadius: 4, background: "#fff", color: "#409eff", fontSize: 12, cursor: "pointer", marginRight: 6 },
  delBtn: { padding: "5px 12px", border: "1px solid #fbc4c4", borderRadius: 4, background: "#fff", color: "#f56c6c", fontSize: 12, cursor: "pointer" },
  restoreBtn: { padding: "5px 12px", border: "1px solid #b7eb8f", borderRadius: 4, background: "#f6ffed", color: "#389e0d", fontSize: 12, cursor: "pointer" },
  activeTag: { display: "inline-flex", padding: "2px 8px", borderRadius: 999, background: "#e8f7f1", color: "#087b5b", fontSize: 12, fontWeight: 700 },
  disabledTag: { display: "inline-flex", padding: "2px 8px", borderRadius: 999, background: "#f2f4f7", color: "#667085", fontSize: 12, fontWeight: 700 },
  primaryBtn: { padding: "8px 18px", border: "none", borderRadius: 4, background: "#409eff", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  cancelBtn: { padding: "8px 18px", border: "1px solid #dcdfe6", borderRadius: 4, background: "#fff", color: "#606266", fontSize: 13, cursor: "pointer" },
  resetBtn: { padding: "8px 14px", border: "1px solid #dcdfe6", borderRadius: 4, background: "#fff", color: "#606266", fontSize: 13, cursor: "pointer" },
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
  modalBody: { padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 },
  formField: { display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "#63738a" },
  modalFoot: { display: "flex", justifyContent: "flex-end", gap: 10, padding: "12px 20px", borderTop: "1px solid #ebeef5" },
  detailTag: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
  detailMeta: { fontSize: 12, color: "#909399" },
  detailTitle: { margin: "0 0 12px", fontSize: 18, color: "#172033" },
  detailContent: { fontSize: 14, color: "#4a5568", lineHeight: 1.8, whiteSpace: "pre-wrap" },
};
