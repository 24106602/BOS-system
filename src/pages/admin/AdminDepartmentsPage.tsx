import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  IMMUTABLE_FIELD_TIP,
  disableDepartment,
  importDepartments,
  listDepartments,
  parseDepartmentImportFile,
  updateDepartment,
  type DepartmentInfo,
} from "../../services/baseInfoService";

const emptyDepartment = (sortOrder: number): DepartmentInfo => ({
  id: "",
  department_name: "",
  school_name: "上海应用技术大学",
  department_type: "本专科",
  contact_person: "",
  contact_phone: "",
  login_account: "",
  contact_address: "",
  contact_postcode: "",
  contact_fax: "",
  sort_order: sortOrder,
  status: "active",
});

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "操作失败，请稍后重试";

export default function AdminDepartmentsPage() {
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [currentDepartment, setCurrentDepartment] = useState<DepartmentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("正在读取院系基础信息");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listDepartments();
      setDepartments(rows);
      setMessage(`已从后端读取 ${rows.length} 条院系记录`);
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

  const activeDepartments = useMemo(
    () => departments.filter((department) => department.status === "active"),
    [departments]
  );
  const selectableIds = useMemo(() => activeDepartments.map((department) => department.id), [activeDepartments]);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const handleAdd = () => {
    setCurrentDepartment(emptyDepartment(Math.max(0, ...departments.map((item) => item.sort_order)) + 1));
    setShowDetailModal(true);
  };

  const handleEdit = (department: DepartmentInfo) => {
    setCurrentDepartment({ ...department });
    setShowDetailModal(true);
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm("删除后需重新导入，确定？")) return;
    setBusy(true);
    try {
      await Promise.all([...selectedIds].map((id) => disableDepartment(id)));
      setSelectedIds(new Set());
      setMessage(`已软删除 ${selectedIds.size} 条院系记录，历史关联数据仍保留`);
      await loadRows();
    } catch (error) {
      window.alert(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveDetail = async () => {
    if (!currentDepartment) return;
    if (!currentDepartment.department_name.trim()) {
      window.alert("院系名称不能为空");
      return;
    }
    setBusy(true);
    try {
      if (currentDepartment.id) {
        await updateDepartment(currentDepartment.id, {
          department_type: currentDepartment.department_type,
          contact_person: currentDepartment.contact_person,
          contact_address: currentDepartment.contact_address,
          contact_postcode: currentDepartment.contact_postcode,
          contact_fax: currentDepartment.contact_fax,
        });
        setMessage("院系可编辑信息已更新");
      } else {
        await importDepartments([currentDepartment]);
        setMessage("院系记录已导入；关联字段现已锁定");
      }
      setShowDetailModal(false);
      setCurrentDepartment(null);
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
      const rows = await parseDepartmentImportFile(file);
      const result = await importDepartments(rows);
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
      ["学校名称", "院系名称*", "院系类型", "联系人", "联系电话", "登录账号", "联系邮编", "联系地址", "联系传真", "排序号*"],
      ["上海应用技术大学", "测试院系", "本专科", "张老师", "13800138000", "test@bos.local", "201418", "上海市", "", "1"],
    ];
    const csv = template.map((row) => row.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "院系基础信息模板.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const patchCurrent = (changes: Partial<DepartmentInfo>) => {
    setCurrentDepartment((current) => current ? { ...current, ...changes } : current);
  };
  const isImported = Boolean(currentDepartment?.id);

  return (
    <section className="bos-table-page difficulty-workspace">
      <header className="bos-page-title-row">
        <div>
          <h1>院系基础信息</h1>
          <p>院系名称、联系电话、登录账号和排序号导入后锁定；如需调整，请软删除后重新导入。</p>
        </div>
      </header>

      <div className="bos-status-row">
        <span className="bos-status-badge">院系总数：{departments.length}</span>
        <span className="bos-status-badge is-success">启用：{activeDepartments.length}</span>
        <span className="bos-status-badge">禁用：{departments.length - activeDepartments.length}</span>
      </div>

      <div className="bos-action-toolbar">
        <button onClick={() => void loadRows()} disabled={loading || busy}>{loading ? "读取中..." : "刷新"}</button>
        <button className="is-primary" onClick={handleAdd} disabled={busy}>新建并导入</button>
        <button onClick={() => setShowImportModal(true)} disabled={busy}>数据导入</button>
        <button className="is-danger" onClick={() => void handleDelete()} disabled={selectedIds.size === 0 || busy} title="删除后需重新导入">
          删除
        </button>
        <button onClick={downloadTemplate}>下载模板</button>
      </div>

      <div style={loading ? styles.infoStatus : styles.status}>{message}</div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead><tr>
            <th style={styles.th}><input type="checkbox" checked={allSelected} onChange={() => setSelectedIds(allSelected ? new Set() : new Set(selectableIds))} /></th>
            <th style={styles.th}>院系名称*</th><th style={styles.th}>学校名称</th><th style={styles.th}>院系类型</th>
            <th style={styles.th}>联系人</th><th style={styles.th}>联系电话</th><th style={styles.th}>登录账号</th>
            <th style={styles.th}>状态</th><th style={styles.th}>排序号</th><th style={styles.th}>操作</th>
          </tr></thead>
          <tbody>
            {departments.length === 0 ? (
              <tr><td style={styles.empty} colSpan={10}>{loading ? "正在读取" : "暂无院系记录，请先导入"}</td></tr>
            ) : departments.map((department) => (
              <tr key={department.id}>
                <td style={styles.td}><input type="checkbox" disabled={department.status === "disabled"} checked={selectedIds.has(department.id)} onChange={() => {
                  const next = new Set(selectedIds);
                  if (next.has(department.id)) next.delete(department.id); else next.add(department.id);
                  setSelectedIds(next);
                }} /></td>
                <td style={styles.nameCell}>{department.department_name}</td>
                <td style={styles.td}>{department.school_name}</td><td style={styles.td}>{department.department_type}</td>
                <td style={styles.td}>{department.contact_person || "-"}</td><td style={styles.td}>{department.contact_phone || "-"}</td>
                <td style={styles.td}>{department.login_account}</td>
                <td style={styles.td}><span style={department.status === "active" ? styles.enabled : styles.disabled}>{department.status === "active" ? "启用" : "已删除"}</span></td>
                <td style={styles.td}>{department.sort_order}</td>
                <td style={styles.td}><button style={styles.actionButton} onClick={() => handleEdit(department)}>编辑</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showImportModal && (
        <div style={styles.modalOverlay} onClick={() => !busy && setShowImportModal(false)}>
          <div style={styles.modal} onClick={(event) => event.stopPropagation()}>
            <div style={styles.modalHeader}><h2 style={styles.modalTitle}>导入院系基础信息</h2><button style={styles.closeButton} onClick={() => setShowImportModal(false)}>×</button></div>
            <div style={styles.modalBody}>
              <p style={styles.tip}>支持 xlsx、xls、csv。重新导入已删除记录时，可调整此前锁定的关联字段。</p>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleImportFile(file);
              }} />
              <div style={styles.fileUploadArea}>
                <span style={styles.uploadLabel}>院系基础信息文件</span>
                <button style={styles.uploadButton} disabled={busy} onClick={() => fileInputRef.current?.click()}>{busy ? "导入中..." : "选择文件并导入"}</button>
                <button style={styles.downloadButton} onClick={downloadTemplate}>下载标准模板</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDetailModal && currentDepartment && (
        <div style={styles.modalOverlay} onClick={() => !busy && setShowDetailModal(false)}>
          <div style={styles.modal} onClick={(event) => event.stopPropagation()}>
            <div style={styles.modalHeader}><h2 style={styles.modalTitle}>{isImported ? "编辑院系信息" : "新建并导入院系信息"}</h2><button style={styles.closeButton} onClick={() => setShowDetailModal(false)}>×</button></div>
            <div style={styles.modalBody}>
              <div style={styles.formGrid}>
                <Field label="学校名称" value={currentDepartment.school_name} immutable={isImported} onChange={(value) => patchCurrent({ school_name: value })} />
                <Field label="院系名称 *" value={currentDepartment.department_name} immutable={isImported} onChange={(value) => patchCurrent({ department_name: value })} />
                <div style={styles.formRow}><label style={styles.formLabel}>院系类型</label><select style={styles.formSelect} value={currentDepartment.department_type} onChange={(event) => patchCurrent({ department_type: event.target.value })}><option value="本专科">本专科</option><option value="本科">本科</option><option value="专科">专科</option></select></div>
                <Field label="联系人" value={currentDepartment.contact_person || ""} onChange={(value) => patchCurrent({ contact_person: value })} />
                <Field label="联系电话" value={currentDepartment.contact_phone || ""} immutable={isImported} onChange={(value) => patchCurrent({ contact_phone: value })} />
                <Field label="登录账号（联系邮箱）" value={currentDepartment.login_account} immutable={isImported} onChange={(value) => patchCurrent({ login_account: value })} />
                <Field label="联系地址" value={currentDepartment.contact_address || ""} onChange={(value) => patchCurrent({ contact_address: value })} />
                <Field label="联系邮编" value={currentDepartment.contact_postcode || ""} onChange={(value) => patchCurrent({ contact_postcode: value })} />
                <Field label="联系传真" value={currentDepartment.contact_fax || ""} onChange={(value) => patchCurrent({ contact_fax: value })} />
                <Field label="排序号 *" value={String(currentDepartment.sort_order)} type="number" immutable={isImported} onChange={(value) => patchCurrent({ sort_order: Number.parseInt(value, 10) || 0 })} />
                <Field label="状态" value={currentDepartment.status === "active" ? "启用" : "已删除"} immutable />
              </div>
            </div>
            <div style={styles.modalFooter}><button style={styles.cancelButton} onClick={() => setShowDetailModal(false)}>取消</button><button style={styles.saveButton} disabled={busy || currentDepartment.status === "disabled"} onClick={() => void handleSaveDetail()}>{busy ? "保存中..." : "保存"}</button></div>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({ label, value, onChange, immutable = false, type = "text" }: { label: string; value: string; onChange?: (value: string) => void; immutable?: boolean; type?: string }) {
  return <div style={styles.formRow} title={immutable ? IMMUTABLE_FIELD_TIP : undefined}>
    <label style={styles.formLabel}>{label}</label>
    <input style={immutable ? styles.readOnlyInput : styles.formInput} type={type} value={value} readOnly={immutable} aria-readonly={immutable} onChange={(event) => onChange?.(event.target.value)} />
    {immutable && <small style={styles.immutableHint}>{IMMUTABLE_FIELD_TIP}</small>}
  </div>;
}

const styles: Record<string, CSSProperties> = {
  tableWrap: { overflow: "auto", border: "1px solid #d7e1ed", borderRadius: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { border: "1px solid #cbd5e1", background: "#edf4fa", padding: 8, whiteSpace: "nowrap", textAlign: "center", position: "sticky", top: 0 },
  td: { border: "1px solid #cbd5e1", padding: 8, textAlign: "center", whiteSpace: "nowrap" },
  nameCell: { border: "1px solid #cbd5e1", padding: 8, color: "#26364e", whiteSpace: "nowrap", textAlign: "left" },
  actionButton: { padding: "4px 8px", border: "none", borderRadius: 4, background: "#0077d4", color: "#fff", fontSize: 12, cursor: "pointer" },
  enabled: { padding: "3px 7px", borderRadius: 999, background: "#e9f8f2", color: "#087b5b", fontSize: 12, fontWeight: 700 },
  disabled: { padding: "3px 7px", borderRadius: 999, background: "#f2f5f8", color: "#728197", fontSize: 12, fontWeight: 700 },
  status: { border: "1px solid #d7e1ed", borderRadius: 6, padding: "9px 10px", color: "#52647b", background: "#f8fbfe", fontSize: 13, marginBottom: 12 },
  infoStatus: { border: "1px solid #bcd9f5", borderRadius: 6, padding: "9px 10px", color: "#0879c5", background: "#f3f9ff", fontSize: 13, marginBottom: 12 },
  empty: { padding: 24, textAlign: "center", color: "#8190a4" },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal: { background: "#fff", borderRadius: 8, width: "90%", maxWidth: 720, maxHeight: "85vh", overflow: "auto" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottom: "1px solid #e1e8f0" },
  modalTitle: { margin: 0, fontSize: 18, color: "#172033" }, closeButton: { border: "none", background: "none", fontSize: 24, cursor: "pointer", color: "#63738a" },
  modalBody: { padding: 16 }, modalFooter: { display: "flex", justifyContent: "flex-end", gap: 10, padding: 16, borderTop: "1px solid #e1e8f0" },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }, formRow: { display: "flex", flexDirection: "column", gap: 4 },
  formLabel: { fontSize: 12, color: "#52647b", fontWeight: 700 }, formInput: { padding: 8, border: "1px solid #d9e2ec", borderRadius: 6, fontSize: 13, background: "#fff" },
  readOnlyInput: { padding: 8, border: "1px solid #d4dce5", borderRadius: 6, fontSize: 13, background: "#eef2f6", color: "#6b7788", cursor: "not-allowed" },
  immutableHint: { color: "#8a5a12", fontSize: 11, lineHeight: 1.4 }, formSelect: { padding: 8, border: "1px solid #d9e2ec", borderRadius: 6, fontSize: 13, background: "#fff" },
  tip: { margin: "0 0 12px", color: "#63738a", fontSize: 13, lineHeight: 1.7 }, fileUploadArea: { padding: 20, border: "1px dashed #cbd5e1", borderRadius: 8, textAlign: "center", background: "#f8fbfe" },
  uploadLabel: { display: "block", fontSize: 14, color: "#52647b", marginBottom: 12 }, uploadButton: { display: "block", margin: "0 auto 8px", padding: "8px 16px", border: "none", borderRadius: 6, background: "#0077d4", color: "#fff", cursor: "pointer" },
  downloadButton: { display: "block", margin: "0 auto", padding: "6px 12px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", color: "#52647b", cursor: "pointer" },
  cancelButton: { padding: "8px 20px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", color: "#52647b" }, saveButton: { padding: "8px 20px", border: "none", borderRadius: 6, background: "#0077d4", color: "#fff", fontWeight: 700 },
};
