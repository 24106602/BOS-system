import { useState, useMemo, type CSSProperties } from "react";
import { collegeAccounts } from "../../utils/collegeDetector";

type DepartmentInfo = {
  id: string;
  departmentName: string;
  schoolName: string;
  departmentType: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  contactAddress: string;
  contactFax: string;
  sortOrder: number;
  status: "启用" | "禁用";
};

const mockDepartments: DepartmentInfo[] = collegeAccounts.map((account, index) => ({
  id: `DEPT-${String(index + 1).padStart(3, "0")}`,
  departmentName: account.college_name,
  schoolName: "上海应用技术大学",
  departmentType: "本专科",
  contactPerson: "",
  contactPhone: "",
  contactEmail: account.login_email,
  contactAddress: "",
  contactFax: "",
  sortOrder: index + 1,
  status: account.enabled ? "启用" : "禁用",
}));

export default function AdminDepartmentsPage() {
  const [departments, setDepartments] = useState<DepartmentInfo[]>(mockDepartments);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [currentDepartment, setCurrentDepartment] = useState<DepartmentInfo | null>(null);

  const handleAdd = () => {
    setCurrentDepartment(null);
    setShowDetailModal(true);
  };

  const handleEdit = (dept: DepartmentInfo) => {
    setCurrentDepartment(dept);
    setShowDetailModal(true);
  };

  const handleDelete = () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确认删除选中的 ${selectedIds.size} 条记录？`)) return;
    setDepartments((prev) => prev.filter((d) => !selectedIds.has(d.id)));
    setSelectedIds(new Set());
  };

  const handleApply = () => {
    if (selectedIds.size === 0) return;
    setDepartments((prev) =>
      prev.map((d) =>
        selectedIds.has(d.id) ? { ...d, status: d.status === "启用" ? "禁用" : "启用" } : d
      )
    );
    setSelectedIds(new Set());
  };

  const handleToggleAll = () => {
    if (selectedIds.size === departments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(departments.map((d) => d.id)));
    }
  };

  const handleToggle = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleSaveDetail = () => {
    if (!currentDepartment) return;
    if (!currentDepartment.departmentName.trim()) {
      alert("院系名称不能为空");
      return;
    }
    if (currentDepartment.id.startsWith("NEW")) {
      setDepartments((prev) => [
        ...prev,
        { ...currentDepartment, id: `DEPT-${String(prev.length + 1).padStart(3, "0")}` },
      ]);
    } else {
      setDepartments((prev) =>
        prev.map((d) => (d.id === currentDepartment.id ? currentDepartment : d))
      );
    }
    setShowDetailModal(false);
    setCurrentDepartment(null);
  };

  const allSelected = useMemo(() => selectedIds.size === departments.length && departments.length > 0, [selectedIds, departments]);

  return (
    <section className="bos-table-page difficulty-workspace">
      <header className="bos-page-title-row">
        <div>
          <h1>院系基础信息</h1>
          <p>维护院系的基本信息，支持新建、编辑、删除和数据导入。</p>
        </div>
      </header>

      <div className="bos-status-row">
        <span className="bos-status-badge">院系总数：{departments.length}</span>
        <span className="bos-status-badge is-success">启用：{departments.filter((d) => d.status === "启用").length}</span>
        <span className="bos-status-badge">禁用：{departments.filter((d) => d.status === "禁用").length}</span>
      </div>

      <div className="bos-action-toolbar">
        <button className="is-primary" onClick={handleAdd}>新建</button>
        <button onClick={() => setShowImportModal(true)}>数据导入</button>
        <button onClick={handleDelete} disabled={selectedIds.size === 0}>删除</button>
        <button onClick={handleApply} disabled={selectedIds.size === 0}>
          {selectedIds.size > 0 && departments.find((d) => selectedIds.has(d.id))?.status === "启用" ? "禁用" : "启用"}
        </button>
        <button onClick={() => {
          const template = [
            ["院系名称*", "联系人", "联系电话", "联系邮编", "联系地址", "联系传真", "联系邮箱", "排序号*"],
            ["测试院系", "", "", "", "", "", "", "6"],
          ];
          const csv = template.map((row) => row.join(",")).join("\n");
          const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = "院系基础信息模板.csv";
          link.click();
          URL.revokeObjectURL(url);
        }}>下载模板</button>
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>
                <input type="checkbox" checked={allSelected} onChange={handleToggleAll} />
              </th>
              <th style={styles.th}>院系名称*</th>
              <th style={styles.th}>学校名称</th>
              <th style={styles.th}>院系类型</th>
              <th style={styles.th}>联系人</th>
              <th style={styles.th}>联系电话</th>
              <th style={styles.th}>状态</th>
              <th style={styles.th}>排序号</th>
              <th style={styles.th}>操作</th>
            </tr>
          </thead>
          <tbody>
            {departments.map((dept) => (
              <tr key={dept.id}>
                <td style={styles.td}>
                  <input type="checkbox" checked={selectedIds.has(dept.id)} onChange={() => handleToggle(dept.id)} />
                </td>
                <td style={styles.nameCell}>{dept.departmentName}</td>
                <td style={styles.td}>{dept.schoolName}</td>
                <td style={styles.td}>{dept.departmentType}</td>
                <td style={styles.td}>{dept.contactPerson || "-"}</td>
                <td style={styles.td}>{dept.contactPhone || "-"}</td>
                <td style={styles.td}>
                  <span style={dept.status === "启用" ? styles.enabled : styles.disabled}>
                    {dept.status}
                  </span>
                </td>
                <td style={styles.td}>{dept.sortOrder}</td>
                <td style={styles.td}>
                  <button style={styles.actionButton} onClick={() => handleEdit(dept)}>编辑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showImportModal && (
        <div style={styles.modalOverlay} onClick={() => setShowImportModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>导入数据</h2>
              <button style={styles.closeButton} onClick={() => setShowImportModal(false)}>×</button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.importStep}>
                <span style={styles.stepNumber}>1</span>
                <div>
                  <strong>上传Excel文件</strong>
                  <small>推荐使用标准模板导入数据</small>
                </div>
              </div>
              <div style={styles.importStep}>
                <span style={styles.stepNumber}>2</span>
                <div>
                  <strong>校验数据</strong>
                  <small>仅支持xlsx格式的文件，数据项不允许超过200列</small>
                </div>
              </div>
              <div style={styles.importStep}>
                <span style={styles.stepNumber}>3</span>
                <div>
                  <strong>导入数据</strong>
                  <small>单个文件大小不超过5MB</small>
                </div>
              </div>
              <div style={styles.fileUploadArea}>
                <span style={styles.uploadLabel}>院系基础信息</span>
                <button style={styles.uploadButton}>上传Excel文件</button>
                <button style={styles.downloadButton} onClick={() => setShowImportModal(false)}>下载标准模板</button>
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button style={styles.nextButton} onClick={() => setShowImportModal(false)}>下一步</button>
            </div>
          </div>
        </div>
      )}

      {showDetailModal && (
        <div style={styles.modalOverlay} onClick={() => setShowDetailModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>{currentDepartment ? "编辑院系信息" : "新建院系信息"}</h2>
              <button style={styles.closeButton} onClick={() => setShowDetailModal(false)}>×</button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.formGrid}>
                <div style={styles.formRow}>
                  <label style={styles.formLabel}>学校名称</label>
                  <input
                    style={styles.formInput}
                    value={currentDepartment?.schoolName || "上海应用技术大学"}
                    readOnly
                  />
                </div>
                <div style={styles.formRow}>
                  <label style={styles.formLabel}>院系名称 *</label>
                  <input
                    style={styles.formInput}
                    value={currentDepartment?.departmentName || ""}
                    onChange={(e) => setCurrentDepartment({ ...(currentDepartment || { id: "NEW-001", schoolName: "上海应用技术大学", departmentType: "本专科", sortOrder: departments.length + 1, status: "启用" }), departmentName: e.target.value })}
                  />
                </div>
                <div style={styles.formRow}>
                  <label style={styles.formLabel}>院系类型</label>
                  <select
                    style={styles.formSelect}
                    value={currentDepartment?.departmentType || "本专科"}
                    onChange={(e) => setCurrentDepartment({ ...(currentDepartment || { id: "NEW-001", schoolName: "上海应用技术大学", departmentType: "本专科", sortOrder: departments.length + 1, status: "启用" }), departmentType: e.target.value })}
                  >
                    <option value="本专科">本专科</option>
                    <option value="本科">本科</option>
                    <option value="专科">专科</option>
                  </select>
                </div>
                <div style={styles.formRow}>
                  <label style={styles.formLabel}>联系人</label>
                  <input
                    style={styles.formInput}
                    value={currentDepartment?.contactPerson || ""}
                    onChange={(e) => setCurrentDepartment({ ...(currentDepartment || { id: "NEW-001", schoolName: "上海应用技术大学", departmentType: "本专科", sortOrder: departments.length + 1, status: "启用" }), contactPerson: e.target.value })}
                  />
                </div>
                <div style={styles.formRow}>
                  <label style={styles.formLabel}>联系电话</label>
                  <input
                    style={styles.formInput}
                    value={currentDepartment?.contactPhone || ""}
                    onChange={(e) => setCurrentDepartment({ ...(currentDepartment || { id: "NEW-001", schoolName: "上海应用技术大学", departmentType: "本专科", sortOrder: departments.length + 1, status: "启用" }), contactPhone: e.target.value })}
                  />
                </div>
                <div style={styles.formRow}>
                  <label style={styles.formLabel}>联系邮箱</label>
                  <input
                    style={styles.formInput}
                    value={currentDepartment?.contactEmail || ""}
                    onChange={(e) => setCurrentDepartment({ ...(currentDepartment || { id: "NEW-001", schoolName: "上海应用技术大学", departmentType: "本专科", sortOrder: departments.length + 1, status: "启用" }), contactEmail: e.target.value })}
                  />
                </div>
                <div style={styles.formRow}>
                  <label style={styles.formLabel}>联系地址</label>
                  <input
                    style={styles.formInput}
                    value={currentDepartment?.contactAddress || ""}
                    onChange={(e) => setCurrentDepartment({ ...(currentDepartment || { id: "NEW-001", schoolName: "上海应用技术大学", departmentType: "本专科", sortOrder: departments.length + 1, status: "启用" }), contactAddress: e.target.value })}
                  />
                </div>
                <div style={styles.formRow}>
                  <label style={styles.formLabel}>联系邮编</label>
                  <input
                    style={styles.formInput}
                    value={currentDepartment?.contactFax || ""}
                    onChange={(e) => setCurrentDepartment({ ...(currentDepartment || { id: "NEW-001", schoolName: "上海应用技术大学", departmentType: "本专科", sortOrder: departments.length + 1, status: "启用" }), contactFax: e.target.value })}
                  />
                </div>
                <div style={styles.formRow}>
                  <label style={styles.formLabel}>联系传真</label>
                  <input
                    style={styles.formInput}
                    value={currentDepartment?.contactFax || ""}
                    onChange={(e) => setCurrentDepartment({ ...(currentDepartment || { id: "NEW-001", schoolName: "上海应用技术大学", departmentType: "本专科", sortOrder: departments.length + 1, status: "启用" }), contactFax: e.target.value })}
                  />
                </div>
                <div style={styles.formRow}>
                  <label style={styles.formLabel}>排序号 *</label>
                  <input
                    style={styles.formInput}
                    type="number"
                    value={currentDepartment?.sortOrder || (departments.length + 1)}
                    onChange={(e) => setCurrentDepartment({ ...(currentDepartment || { id: "NEW-001", schoolName: "上海应用技术大学", departmentType: "本专科", sortOrder: departments.length + 1, status: "启用" }), sortOrder: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div style={styles.formRow}>
                  <label style={styles.formLabel}>状态</label>
                  <select
                    style={styles.formSelect}
                    value={currentDepartment?.status || "启用"}
                    onChange={(e) => setCurrentDepartment({ ...(currentDepartment || { id: "NEW-001", schoolName: "上海应用技术大学", departmentType: "本专科", sortOrder: departments.length + 1, status: "启用" }), status: e.target.value as "启用" | "禁用" })}
                  >
                    <option value="启用">启用</option>
                    <option value="禁用">禁用</option>
                  </select>
                </div>
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button style={styles.cancelButton} onClick={() => setShowDetailModal(false)}>取消</button>
              <button style={styles.saveButton} onClick={handleSaveDetail}>保存</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  tableWrap: {
    overflow: "auto",
    border: "1px solid #d7e1ed",
    borderRadius: 6,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    border: "1px solid #cbd5e1",
    background: "#edf4fa",
    padding: 8,
    whiteSpace: "nowrap",
    textAlign: "center",
  },
  td: {
    border: "1px solid #cbd5e1",
    padding: 8,
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  nameCell: {
    border: "1px solid #cbd5e1",
    padding: 8,
    color: "#26364e",
    whiteSpace: "nowrap",
    textAlign: "left",
  },
  actionButton: {
    padding: "4px 8px",
    border: "none",
    borderRadius: 4,
    background: "#0077d4",
    color: "#fff",
    fontSize: 12,
    cursor: "pointer",
  },
  enabled: {
    padding: "3px 7px",
    borderRadius: 999,
    background: "#e9f8f2",
    color: "#087b5b",
    fontSize: 12,
    fontWeight: 700,
  },
  disabled: {
    padding: "3px 7px",
    borderRadius: 999,
    background: "#f2f5f8",
    color: "#728197",
    fontSize: 12,
    fontWeight: 700,
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    background: "#fff",
    borderRadius: 8,
    width: "90%",
    maxWidth: 600,
    maxHeight: "80vh",
    overflow: "auto",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottom: "1px solid #e1e8f0",
  },
  modalTitle: {
    margin: 0,
    fontSize: 18,
    color: "#172033",
  },
  closeButton: {
    border: "none",
    background: "none",
    fontSize: 24,
    cursor: "pointer",
    color: "#63738a",
  },
  modalBody: {
    padding: 16,
  },
  modalFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    padding: 16,
    borderTop: "1px solid #e1e8f0",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 12,
  },
  formRow: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  formLabel: {
    fontSize: 12,
    color: "#52647b",
    fontWeight: 700,
  },
  formInput: {
    padding: 8,
    border: "1px solid #d9e2ec",
    borderRadius: 6,
    fontSize: 13,
    backgroundColor: "#fff",
  },
  formSelect: {
    padding: 8,
    border: "1px solid #d9e2ec",
    borderRadius: 6,
    fontSize: 13,
    backgroundColor: "#fff",
  },
  importStep: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderBottom: "1px solid #e8eef5",
  },
  stepNumber: {
    width: 24,
    height: 24,
    display: "grid",
    placeItems: "center",
    borderRadius: "50%",
    background: "#0077d4",
    color: "#fff",
    fontSize: 12,
    fontWeight: 800,
  },
  fileUploadArea: {
    marginTop: 16,
    padding: 20,
    border: "1px dashed #cbd5e1",
    borderRadius: 8,
    textAlign: "center",
    background: "#f8fbfe",
  },
  uploadLabel: {
    display: "block",
    fontSize: 14,
    color: "#52647b",
    marginBottom: 12,
  },
  uploadButton: {
    display: "block",
    margin: "0 auto 8px",
    padding: "8px 16px",
    border: "none",
    borderRadius: 6,
    background: "#0077d4",
    color: "#fff",
    fontSize: 13,
    cursor: "pointer",
  },
  downloadButton: {
    display: "block",
    margin: "0 auto",
    padding: "6px 12px",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    background: "#fff",
    color: "#52647b",
    fontSize: 12,
    cursor: "pointer",
  },
  nextButton: {
    padding: "8px 20px",
    border: "none",
    borderRadius: 6,
    background: "#0077d4",
    color: "#fff",
    fontSize: 14,
    cursor: "pointer",
  },
  cancelButton: {
    padding: "8px 20px",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    background: "#fff",
    color: "#52647b",
    fontSize: 14,
    cursor: "pointer",
  },
  saveButton: {
    padding: "8px 20px",
    border: "none",
    borderRadius: 6,
    background: "#0077d4",
    color: "#fff",
    fontSize: 14,
    cursor: "pointer",
  },
};
