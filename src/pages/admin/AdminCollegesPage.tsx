import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getMergeBatches } from "../../db/localMergeDb";
import {
  IMMUTABLE_FIELD_TIP,
  disableCounselor,
  importCounselors,
  listCounselors,
  parseCounselorImportFile,
  updateCounselor,
  type CounselorInfo,
} from "../../services/baseInfoService";
import type { CollegeProcessedBatch } from "../../types/merge";
import { isSameSubmissionCollege, normalizeSubmissionCollegeName } from "../../utils/collegeDetector";

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "操作失败，请稍后重试";

export default function AdminCollegesPage() {
  const [batches, setBatches] = useState<CollegeProcessedBatch[]>([]);
  const [counselors, setCounselors] = useState<CounselorInfo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<CounselorInfo | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("正在读取辅导员账号信息");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getMergeBatches().then(setBatches);
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listCounselors();
      setCounselors(rows);
      setMessage(`已从后端读取 ${rows.length} 条辅导员/学院账号记录`);
    } catch (error) {
      setMessage(`读取失败：${errorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRows(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRows]);

  const rows = useMemo(() => counselors.map((counselor) => {
    const collegeBatches = batches.filter((batch) => isSameSubmissionCollege(batch.collegeName, counselor.college_name));
    return {
      counselor,
      lastSubmittedAt: collegeBatches.map((batch) => batch.createdAt).sort().at(-1) || "",
      submitted: collegeBatches.length > 0,
    };
  }), [batches, counselors]);

  const activeIds = useMemo(() => counselors.filter((item) => item.enabled).map((item) => item.id), [counselors]);
  const allSelected = activeIds.length > 0 && activeIds.every((id) => selectedIds.has(id));
  const recentLogs = useMemo(() => [...batches].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8), [batches]);

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm("删除后需重新导入，确定？")) return;
    setBusy(true);
    try {
      await Promise.all([...selectedIds].map((id) => disableCounselor(id)));
      setSelectedIds(new Set());
      setMessage(`已软删除 ${selectedIds.size} 条辅导员账号，认证和历史关联记录未物理删除`);
      await loadRows();
    } catch (error) {
      window.alert(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.display_name.trim()) {
      window.alert("辅导员姓名不能为空");
      return;
    }
    setBusy(true);
    try {
      await updateCounselor(editing.id, { display_name: editing.display_name });
      setEditing(null);
      setMessage("辅导员姓名已更新；关联字段保持锁定");
      await loadRows();
    } catch (error) {
      window.alert(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleImportFile = async (file: File) => {
    setBusy(true);
    try {
      const importedRows = await parseCounselorImportFile(file);
      const result = await importCounselors(importedRows);
      setMessage(`导入完成：新增 ${result.inserted} 条，重新启用 ${result.reactivated} 条`);
      setShowImportModal(false);
      await loadRows();
    } catch (error) {
      window.alert(errorMessage(error));
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const downloadTemplate = () => {
    const template = [
      ["辅导员姓名*", "所属院系*", "手机号*", "登录账号*", "排序号*"],
      ["张老师", "测试院系", "13800138000", "teacher@bos.local", "1"],
    ];
    const csv = template.map((row) => row.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "辅导员信息模板.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section style={styles.card}>
      <h1 style={styles.title}>辅导员信息与学院账号</h1>
      <p style={styles.description}>所属院系、手机号、登录账号和排序号导入后不可原地修改；删除为停用账号，重新导入后方可调整。</p>

      <div className="bos-status-row">
        <span className="bos-status-badge">账号总数：{counselors.length}</span>
        <span className="bos-status-badge is-success">启用：{counselors.filter((item) => item.enabled).length}</span>
        <span className="bos-status-badge">已删除：{counselors.filter((item) => !item.enabled).length}</span>
      </div>
      <div className="bos-action-toolbar">
        <button onClick={() => void loadRows()} disabled={loading || busy}>{loading ? "读取中..." : "刷新"}</button>
        <button className="is-primary" onClick={() => setShowImportModal(true)} disabled={busy}>数据导入</button>
        <button className="is-danger" onClick={() => void handleDelete()} disabled={selectedIds.size === 0 || busy} title="删除后需重新导入">删除</button>
        <button onClick={downloadTemplate}>下载模板</button>
      </div>
      <div style={loading ? styles.infoStatus : styles.status}>{message}</div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead><tr>
            <th style={styles.th}><input type="checkbox" checked={allSelected} onChange={() => setSelectedIds(allSelected ? new Set() : new Set(activeIds))} /></th>
            <th style={styles.th}>辅导员姓名</th><th style={styles.th}>所属院系</th><th style={styles.th}>手机号</th>
            <th style={styles.th}>登录账号</th><th style={styles.th}>排序号</th><th style={styles.th}>状态</th>
            <th style={styles.th}>最近提交时间</th><th style={styles.th}>提交状态</th><th style={styles.th}>操作</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td style={styles.empty} colSpan={10}>{loading ? "正在读取" : "暂无辅导员记录，请先导入"}</td></tr>
            ) : rows.map(({ counselor, lastSubmittedAt, submitted }) => (
              <tr key={counselor.id}>
                <td style={styles.td}><input type="checkbox" disabled={!counselor.enabled} checked={selectedIds.has(counselor.id)} onChange={() => {
                  const next = new Set(selectedIds);
                  if (next.has(counselor.id)) next.delete(counselor.id); else next.add(counselor.id);
                  setSelectedIds(next);
                }} /></td>
                <td style={styles.nameCell}>{counselor.display_name || "-"}</td><td style={styles.td}>{counselor.college_name}</td>
                <td style={styles.td}>{counselor.phone || "-"}</td><td style={styles.td}>{counselor.login_email || "-"}</td><td style={styles.td}>{counselor.sort_order || "-"}</td>
                <td style={styles.td}><span style={counselor.enabled ? styles.submitted : styles.pending}>{counselor.enabled ? "启用" : "已删除"}</span></td>
                <td style={styles.td}>{lastSubmittedAt ? new Date(lastSubmittedAt).toLocaleString() : "-"}</td>
                <td style={styles.td}><span style={submitted ? styles.submitted : styles.pending}>{submitted ? "已提交" : "未提交"}</span></td>
                <td style={styles.td}><button style={styles.actionButton} disabled={!counselor.enabled} onClick={() => setEditing({ ...counselor })}>编辑</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section style={styles.section}>
        <h2 style={styles.subTitle}>最近上载日志</h2>
        <div style={styles.tableWrap}><table style={styles.table}>
          <thead><tr><th style={styles.th}>提交单位</th><th style={styles.th}>上载时间</th><th style={styles.th}>上载类型</th><th style={styles.th}>行数</th></tr></thead>
          <tbody>{recentLogs.length === 0 ? <tr><td style={styles.empty} colSpan={4}>暂无上载日志</td></tr> : recentLogs.map((item) => <tr key={item.id}>
            <td style={styles.nameCell}>{normalizeSubmissionCollegeName(item.collegeName)}</td><td style={styles.td}>{new Date(item.createdAt).toLocaleString()}</td>
            <td style={styles.td}>{item.dataType === "student" ? "本专科信息" : "家庭成员信息"}</td><td style={styles.td}>{item.rowCount}</td>
          </tr>)}</tbody>
        </table></div>
      </section>

      {showImportModal && <div style={styles.modalOverlay} onClick={() => !busy && setShowImportModal(false)}><div style={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div style={styles.modalHeader}><h2 style={styles.modalTitle}>导入辅导员信息</h2><button style={styles.closeButton} onClick={() => setShowImportModal(false)}>×</button></div>
        <div style={styles.modalBody}>
          <p style={styles.description}>登录账号必须已存在于 Supabase Auth。重新导入已删除账号时允许调整此前锁定字段。</p>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleImportFile(file); }} />
          <div style={styles.uploadArea}><button className="is-primary" disabled={busy} onClick={() => fileInputRef.current?.click()}>{busy ? "导入中..." : "选择文件并导入"}</button><button onClick={downloadTemplate}>下载标准模板</button></div>
        </div>
      </div></div>}

      {editing && <div style={styles.modalOverlay} onClick={() => !busy && setEditing(null)}><div style={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div style={styles.modalHeader}><h2 style={styles.modalTitle}>编辑辅导员信息</h2><button style={styles.closeButton} onClick={() => setEditing(null)}>×</button></div>
        <div style={styles.modalBody}><div style={styles.formGrid}>
          <EditField label="辅导员姓名" value={editing.display_name || ""} onChange={(value) => setEditing({ ...editing, display_name: value })} />
          <EditField label="所属院系" value={editing.college_name || ""} immutable />
          <EditField label="手机号" value={editing.phone || ""} immutable />
          <EditField label="登录账号" value={editing.login_email || ""} immutable />
          <EditField label="排序号" value={String(editing.sort_order || "")} immutable />
        </div></div>
        <div style={styles.modalFooter}><button onClick={() => setEditing(null)}>取消</button><button className="is-primary" disabled={busy} onClick={() => void handleSave()}>{busy ? "保存中..." : "保存"}</button></div>
      </div></div>}
    </section>
  );
}

function EditField({ label, value, immutable = false, onChange }: { label: string; value: string; immutable?: boolean; onChange?: (value: string) => void }) {
  return <div style={styles.formRow} title={immutable ? IMMUTABLE_FIELD_TIP : undefined}>
    <label style={styles.formLabel}>{label}</label>
    <input style={immutable ? styles.readOnlyInput : styles.formInput} value={value} readOnly={immutable} aria-readonly={immutable} onChange={(event) => onChange?.(event.target.value)} />
    {immutable && <small style={styles.immutableHint}>{IMMUTABLE_FIELD_TIP}</small>}
  </div>;
}

const styles: Record<string, CSSProperties> = {
  card: { background: "#fff", borderRadius: 8, padding: 20, border: "1px solid #d7e1ed", boxShadow: "0 4px 14px rgba(15,35,64,.05)" },
  title: { margin: "0 0 8px", color: "#172033", fontSize: 24 }, description: { color: "#63738a", fontSize: 13, margin: "0 0 12px", lineHeight: 1.7 },
  status: { border: "1px solid #d7e1ed", borderRadius: 6, padding: "9px 10px", color: "#52647b", background: "#f8fbfe", fontSize: 13, marginBottom: 12 },
  infoStatus: { border: "1px solid #bcd9f5", borderRadius: 6, padding: "9px 10px", color: "#0879c5", background: "#f3f9ff", fontSize: 13, marginBottom: 12 },
  section: { marginTop: 16, paddingTop: 14, borderTop: "1px solid #e3ebf3" }, subTitle: { margin: "0 0 10px", color: "#172033", fontSize: 17 },
  tableWrap: { overflow: "auto", border: "1px solid #d7e1ed", borderRadius: 6 }, table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { border: "1px solid #cbd5e1", background: "#edf4fa", padding: 8, whiteSpace: "nowrap", position: "sticky", top: 0 },
  td: { border: "1px solid #cbd5e1", padding: 8, textAlign: "center", whiteSpace: "nowrap" }, nameCell: { border: "1px solid #cbd5e1", padding: 8, color: "#26364e", whiteSpace: "nowrap" },
  submitted: { display: "inline-flex", padding: "3px 7px", borderRadius: 999, background: "#e8f7f1", color: "#087b5b", fontWeight: 700, fontSize: 12 },
  pending: { display: "inline-flex", padding: "3px 7px", borderRadius: 999, background: "#f2f5f8", color: "#728197", fontWeight: 700, fontSize: 12 },
  empty: { padding: 18, color: "#8190a4", textAlign: "center" }, actionButton: { border: "none", borderRadius: 4, padding: "5px 9px", background: "#0077d4", color: "#fff" },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal: { width: "min(680px,90vw)", maxHeight: "85vh", overflow: "auto", background: "#fff", borderRadius: 8 }, modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottom: "1px solid #e1e8f0" },
  modalTitle: { margin: 0, color: "#172033", fontSize: 18 }, closeButton: { border: "none", background: "none", fontSize: 24, color: "#63738a" }, modalBody: { padding: 16 }, modalFooter: { display: "flex", justifyContent: "flex-end", gap: 10, padding: 16, borderTop: "1px solid #e1e8f0" },
  uploadArea: { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 120, border: "1px dashed #cbd5e1", borderRadius: 8, background: "#f8fbfe" },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }, formRow: { display: "flex", flexDirection: "column", gap: 4 }, formLabel: { fontSize: 12, color: "#52647b", fontWeight: 700 },
  formInput: { padding: 8, border: "1px solid #d9e2ec", borderRadius: 6, fontSize: 13, background: "#fff" }, readOnlyInput: { padding: 8, border: "1px solid #d4dce5", borderRadius: 6, fontSize: 13, background: "#eef2f6", color: "#6b7788", cursor: "not-allowed" }, immutableHint: { color: "#8a5a12", fontSize: 11, lineHeight: 1.4 },
};
