import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import * as XLSX from "xlsx-js-style";
import type { UserProfile } from "../../types/auth";
import { ACADEMIC_YEAR_OPTIONS, getCurrentAcademicYear } from "../../utils/academicYear";
import {
  fetchCollegeDifficultyStudents,
  normalizeIdCard,
  resubmitStudentRecords,
  type DifficultyStudentRow,
} from "../../services/difficultyStudentService";
import { transitionDifficultyStudent } from "../../services/difficultyStudentApi";
import { getDifficultyStudentStatusLabel } from "../../constants/statusTransitions";
import { normalizeSubmissionCollegeName } from "../../utils/collegeDetector";
import {
  DIFFICULTY_STUDENT_ACTION_LABELS,
  getAvailableActions,
  getDifficultyStudentActionHint,
  type DifficultyStudentUiAction,
} from "../../utils/difficultyStudentActions";
import {
  DIFFICULTY_STUDENT_TEMPLATE_FIELDS,
  getDifficultyTemplateValue,
  makeDifficultyRowKey,
  type DifficultyStudentTemplateField,
} from "../../constants/difficultyStudentTemplate";
import DifficultyOperationHistory from "../../components/DifficultyOperationHistory";
import { useDifficultyRecognitionWindow } from "../../hooks/useDifficultyRecognitionWindow";

type CollegeDifficultyStudentsPageProps = {
  profile: UserProfile;
  onNavigate?: (to: string) => void;
};

const displayStatus = (status: string) => getDifficultyStudentStatusLabel(status);

const normalizeRawKey = (value: string) =>
  value.replace(/\s|\*|（.*?）|\(.*?\)/g, "").toLowerCase();

const getRawDetail = (row: DifficultyStudentRow, aliases: string[]) => {
  const rawData = row.raw_data || {};
  for (const alias of aliases) {
    const value = rawData[alias];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }

  const normalizedAliases = aliases.map(normalizeRawKey);
  const matchedKey = Object.keys(rawData).find((key) => {
    const normalizedKey = normalizeRawKey(key);
    return normalizedAliases.some((alias) => normalizedKey.includes(alias) || alias.includes(normalizedKey));
  });
  return matchedKey ? String(rawData[matchedKey] ?? "").trim() : "";
};

export default function CollegeDifficultyStudentsPage({ profile, onNavigate }: CollegeDifficultyStudentsPageProps) {
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());
  const recognitionWindow = useDifficultyRecognitionWindow(academicYear);
  const [nameKeyword, setNameKeyword] = useState("");
  const [studentIdKeyword, setStudentIdKeyword] = useState("");
  const [idCardKeyword, setIdCardKeyword] = useState("");
  const [difficultyKeyword, setDifficultyKeyword] = useState("");
  const [statusKeyword, setStatusKeyword] = useState("");
  const [rows, setRows] = useState<DifficultyStudentRow[]>([]);
  const [selectedRow, setSelectedRow] = useState<DifficultyStudentRow | null>(null);
  const [detailTab, setDetailTab] = useState<"detail" | "history">("detail");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [loadMessage, setLoadMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [pendingRowKey, setPendingRowKey] = useState("");
  const [resubmitRow, setResubmitRow] = useState<DifficultyStudentRow | null>(null);
  const [resubmitRemark, setResubmitRemark] = useState("");
  const [isResubmitting, setIsResubmitting] = useState(false);
  const [dataSource, setDataSource] = useState<"supabase" | "local">("supabase");
  const recognitionWindowBlocked = recognitionWindow.loading || !recognitionWindow.isOpen;

  const collegeName = normalizeSubmissionCollegeName(profile.college_name || profile.display_name || "");

  const getRowKey = (row: DifficultyStudentRow) =>
    makeDifficultyRowKey(row.academic_year, row.college_name, row.id_card, row.student_id, 0);

  const getTemplateCell = (row: DifficultyStudentRow, field: DifficultyStudentTemplateField) => {
    if (field === "姓名(*)") return getDifficultyTemplateValue(row.raw_data, field, row.name);
    if (field === "身份证号(*)") return getDifficultyTemplateValue(row.raw_data, field, row.id_card);
    if (field === "特殊困难类型(*)" || field === "推荐档次(*)") {
      return getDifficultyTemplateValue(row.raw_data, field, row.difficulty_level);
    }
    return getDifficultyTemplateValue(row.raw_data, field);
  };

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetchCollegeDifficultyStudents(academicYear, collegeName);
      setRows(result.rows);
      setSelectedKeys(new Set());
      setDataSource(result.source);
      setLoadMessage(result.error || `已加载 ${result.rows.length} 条困难生明细`);
    } catch (error) {
      console.error(error);
      setRows([]);
      setLoadMessage(error instanceof Error ? error.message : "困难生明细读取失败");
    } finally {
      setIsLoading(false);
    }
  }, [academicYear, collegeName]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRows();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const name = nameKeyword.trim();
    const studentId = studentIdKeyword.trim();
    const idCard = normalizeIdCard(idCardKeyword.trim());
    const difficulty = difficultyKeyword.trim();
    const status = statusKeyword.trim();
    if (!name && !studentId && !idCard && !difficulty && !status) return rows;

    return rows.filter((row) => {
      if (name && !row.name.includes(name)) return false;
      if (studentId && !row.student_id.includes(studentId)) return false;
      if (idCard && !normalizeIdCard(row.id_card).includes(idCard)) return false;
      if (difficulty && !row.difficulty_level.includes(difficulty)) return false;
      if (status && !displayStatus(row.status).includes(status)) return false;
      return true;
    });
  }, [difficultyKeyword, idCardKeyword, nameKeyword, rows, statusKeyword, studentIdKeyword]);

  const resetFilters = () => {
    setNameKeyword("");
    setStudentIdKeyword("");
    setIdCardKeyword("");
    setDifficultyKeyword("");
    setStatusKeyword("");
  };

  const allVisibleSelected =
    filteredRows.length > 0 && filteredRows.every((row) => selectedKeys.has(getRowKey(row)));

  const toggleAllRows = () => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (allVisibleSelected) filteredRows.forEach((row) => next.delete(getRowKey(row)));
      else filteredRows.forEach((row) => next.add(getRowKey(row)));
      return next;
    });
  };

  const toggleRow = (row: DifficultyStudentRow) => {
    const key = getRowKey(row);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const deleteSelectedRows = () => {
    if (selectedKeys.size === 0) return;
    if (!confirm(`确认从当前页面移除已选中的 ${selectedKeys.size} 条记录？此操作不会删除 Supabase 数据。`)) return;
    setRows((current) => current.filter((row) => !selectedKeys.has(getRowKey(row))));
    setSelectedKeys(new Set());
  };

  const removeRowFromCurrentView = (row: DifficultyStudentRow) => {
    const key = getRowKey(row);
    if (!confirm(`确认从当前页面移除 ${row.name || "该学生"}？此操作不会删除 Supabase 数据。`)) return;
    setRows((current) => current.filter((item) => getRowKey(item) !== key));
    setSelectedKeys((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    setSelectedRow(null);
    setActionMessage(`${row.name || "该学生"}已从当前页面移除，Supabase 数据未删除。`);
  };

  const handleRecordAction = async (
    action: DifficultyStudentUiAction,
    row: DifficultyStudentRow
  ) => {
    if (
      recognitionWindowBlocked
      && (action === "confirm_upload" || action === "resubmit")
    ) {
      setActionMessage(recognitionWindow.message);
      return;
    }
    if (action === "edit") {
      setSelectedRow(null);
      setActionMessage(
        row.status === "returned_by_center"
          ? "中心已退回，请在本专科信息处理页修正资料后重新上载。"
          : "请在本专科信息处理页修正资料并重新提交。"
      );
      onNavigate?.("/college/difficulty/student");
      return;
    }
    if (action === "delete") {
      removeRowFromCurrentView(row);
      return;
    }
    if (action === "resubmit") {
      if (row.id === undefined) {
        setActionMessage("该记录尚未写入云端，无法重新提交。");
        return;
      }
      setSelectedRow(null);
      setResubmitRemark("");
      setResubmitRow(row);
      return;
    }
    if (action !== "confirm_upload") return;
    if (row.id === undefined) {
      setActionMessage("该记录尚未写入云端，无法执行状态上载；请先在信息处理页完成数据上载。");
      return;
    }

    const key = getRowKey(row);
    setPendingRowKey(key);
    setActionMessage("");
    try {
      await transitionDifficultyStudent(row.id, "submit");
      setSelectedRow(null);
      setActionMessage(`${row.name || "该学生"}已确认上载，等待学校接收审核。`);
      await loadRows();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "确认上载失败");
    } finally {
      setPendingRowKey("");
    }
  };

  const renderRecordActions = (row: DifficultyStudentRow, location: "table" | "detail") => {
    const isEditedRejectedDraft = row.status === "draft" && Boolean(row.rejected_reason);
    const actions = isEditedRejectedDraft
      ? [...getAvailableActions(row.status, "college").filter((action) => action !== "confirm_upload"), "resubmit" as const]
      : getAvailableActions(row.status, "college");
    const hint = isEditedRejectedDraft
      ? { text: "学校退回资料已修改，请填写修改说明后重新提交。", tone: "warning" as const }
      : getDifficultyStudentActionHint(row.status, "college");
    const isPending = pendingRowKey === getRowKey(row);
    const hasTimedAction = actions.some(
      (action) => action === "confirm_upload" || action === "resubmit"
    );
    return (
      <div className={`difficulty-record-actions is-${location}`}>
        {actions.length > 0 && (
          <div className="difficulty-record-action-buttons">
            {actions.map((action) => (
              <button
                key={action}
                className={`difficulty-record-action is-${action}`}
                disabled={
                  isPending
                  || (recognitionWindowBlocked
                    && (action === "confirm_upload" || action === "resubmit"))
                }
                title={
                  recognitionWindowBlocked
                    && (action === "confirm_upload" || action === "resubmit")
                    ? recognitionWindow.message
                    : undefined
                }
                onClick={() => void handleRecordAction(action, row)}
              >
                {isPending && action === "confirm_upload" ? "处理中..." : DIFFICULTY_STUDENT_ACTION_LABELS[action]}
              </button>
            ))}
          </div>
        )}
        <span className="difficulty-status-notice" data-tone={hint.tone}>{hint.text}</span>
        {recognitionWindowBlocked && hasTimedAction && (
          <span className="difficulty-status-notice" data-tone="danger">
            {recognitionWindow.message}
          </span>
        )}
        {(row.status === "rejected_by_school" || isEditedRejectedDraft) && row.rejected_reason && (
          <span className="difficulty-status-notice" data-tone="danger">
            退回原因：{row.rejected_reason}
          </span>
        )}
      </div>
    );
  };

  const handleResubmit = async () => {
    if (!resubmitRow || resubmitRow.id === undefined) return;
    const remark = resubmitRemark.trim();
    if (!remark) {
      setActionMessage("请填写修改说明后再重新提交。");
      return;
    }

    setIsResubmitting(true);
    setActionMessage("");
    const result = await resubmitStudentRecords([resubmitRow.id], remark);
    setIsResubmitting(false);
    setActionMessage(result.message);
    if (!result.success) return;
    setResubmitRow(null);
    setResubmitRemark("");
    await loadRows();
  };

  const exportCurrentRows = () => {
    if (filteredRows.length === 0) {
      alert("当前筛选条件下暂无可导出的困难生明细");
      return;
    }
    const exportRows = filteredRows.map((row) => ({
      学年: row.academic_year,
      学院: row.college_name,
      姓名: row.name,
      学号: row.student_id,
      身份证号: row.id_card,
      年级: getRawDetail(row, ["grade", "年级", "所在年级"]),
      性别: getRawDetail(row, ["gender", "性别"]),
      困难等级: row.difficulty_level,
      状态: displayStatus(row.status),
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet["!cols"] = Object.keys(exportRows[0]).map(() => ({ wch: 18 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "困难生明细");
    XLSX.writeFile(workbook, `${academicYear}_${collegeName || "学院"}_困难生明细.xlsx`);
  };

  const selectedRows = rows.filter((row) => selectedKeys.has(getRowKey(row)));
  const canDeleteSelected = selectedRows.length > 0 && selectedRows.every((row) =>
    getAvailableActions(row.status, "college").includes("delete")
  );

  return (
    <section className="bos-table-page difficulty-workspace">
      <div className="bos-layout-active">AI Studio Layout Active - Difficulty Students</div>

      <header className="bos-page-title-row">
        <div>
          <div className="bos-breadcrumb">困难生业务 / 困难生明细 / Student Records</div>
          <h1>困难生明细</h1>
          <p>按学年查看本学院已经上载的困难生数据，点击姓名或操作按钮查看学生详情。</p>
        </div>
        <label className="bos-current-year">
          当前学年
          <select value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}>
            {ACADEMIC_YEAR_OPTIONS.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
      </header>

      <div className="difficulty-cockpit-grid">
        <CockpitStat label="本学院困难生" value={rows.length} tone="blue" />
        <CockpitStat label="当前筛选结果" value={filteredRows.length} tone="green" />
        <CockpitStat
          label="特殊困难"
          value={rows.filter((row) => /特别|特殊|低保|孤儿|残疾|烈士/.test(row.difficulty_level)).length}
          tone="amber"
        />
        <CockpitStat label="当前选中" value={selectedKeys.size} tone="purple" />
        <CockpitStat label="云端记录" value={dataSource === "supabase" ? rows.length : 0} tone="cyan" />
      </div>

      <section className="bos-filter-card">
        <div className="bos-filter-grid">
          <label className="bos-filter-field">学院/学部<input value={collegeName || "学院账号"} readOnly /></label>
          <label className="bos-filter-field">姓名<input value={nameKeyword} onChange={(event) => setNameKeyword(event.target.value)} /></label>
          <label className="bos-filter-field">学号<input value={studentIdKeyword} onChange={(event) => setStudentIdKeyword(event.target.value)} /></label>
          <label className="bos-filter-field">身份证号<input value={idCardKeyword} onChange={(event) => setIdCardKeyword(event.target.value)} /></label>
          <label className="bos-filter-field">困难等级<input value={difficultyKeyword} onChange={(event) => setDifficultyKeyword(event.target.value)} /></label>
          <label className="bos-filter-field">状态<input value={statusKeyword} onChange={(event) => setStatusKeyword(event.target.value)} /></label>
          <button className="is-primary" onClick={() => void loadRows()} disabled={isLoading}>{isLoading ? "查询中..." : "查询"}</button>
          <button onClick={resetFilters}>重置</button>
        </div>
        {loadMessage && <div style={dataSource === "supabase" ? styles.info : styles.warning}>{loadMessage}</div>}
      </section>

      <div className="bos-action-toolbar">
        <button className="is-primary" onClick={() => void loadRows()} disabled={isLoading}>{isLoading ? "刷新中..." : "刷新数据"}</button>
        <button className="is-purple" onClick={exportCurrentRows}>导出当前名单</button>
        {canDeleteSelected ? (
          <button className="is-danger" onClick={deleteSelectedRows}>
            删除选中（{selectedKeys.size}）
          </button>
        ) : (
          <span className="difficulty-toolbar-hint">
            {selectedRows.length === 0 ? "选择草稿或退回记录后可批量移除" : "所选状态不可删除，请查看各行状态说明"}
          </span>
        )}
      </div>

      {actionMessage && <div className="difficulty-page-action-message">{actionMessage}</div>}
      <div className="bos-status-row">
        <span className={`bos-status-badge${recognitionWindowBlocked ? " is-danger" : " is-success"}`}>
          认定时间：{recognitionWindow.message}
        </span>
      </div>

      <div className="bos-status-row">
        <span className="bos-status-badge">学年 {academicYear}</span>
        <span className="bos-status-badge">{collegeName || "学院账号"}</span>
        <span className="bos-status-badge is-success">数据源 {dataSource === "supabase" ? "Supabase" : "本地记录"}</span>
        <span className="bos-status-badge">总数 {rows.length}</span>
        <span className="bos-status-badge">筛选结果 {filteredRows.length}</span>
      </div>

      <section className="bos-table-card">
        <div className="bos-table-card-head">
          <div>
            <h2>困难生申请档案数据表</h2>
            <span>严格按申请档案模板 40 列展示，横向滚动查看全部字段</span>
          </div>
          <span>显示 {filteredRows.length} / {rows.length} 条</span>
        </div>
        <div className="bos-table-card-body">
          <div>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, ...styles.checkboxColumn }}>
                    <input
                      type="checkbox"
                      aria-label="选择当前全部数据"
                      checked={allVisibleSelected}
                      onChange={toggleAllRows}
                    />
                  </th>
                  <th style={styles.th}>学年</th>
                  <th style={styles.th}>学院</th>
                  {DIFFICULTY_STUDENT_TEMPLATE_FIELDS.map((field) => (
                    <th key={field} style={styles.th}>{field}</th>
                  ))}
                  <th style={styles.th}>状态</th>
                  <th style={styles.th}>退回原因</th>
                  <th style={styles.th}>学院修改说明</th>
                  <th style={styles.actionColumn}>操作与状态说明</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td style={styles.empty} colSpan={DIFFICULTY_STUDENT_TEMPLATE_FIELDS.length + 7}>正在加载困难生明细...</td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td style={styles.empty} colSpan={DIFFICULTY_STUDENT_TEMPLATE_FIELDS.length + 7}>暂无当前学年困难生明细</td>
                  </tr>
                ) : (
                  filteredRows.map((row, index) => (
                    <tr
                      key={`${getRowKey(row)}_${index}`}
                      className={selectedKeys.has(getRowKey(row)) ? "difficulty-row-selected" : ""}
                    >
                      <td style={{ ...styles.td, ...styles.checkboxColumn }}>
                        <input
                          type="checkbox"
                          aria-label={`选择${row.name || "该学生"}`}
                          checked={selectedKeys.has(getRowKey(row))}
                          onChange={() => toggleRow(row)}
                        />
                      </td>
                      <td style={styles.td}>{row.academic_year}</td>
                      <td style={styles.td}>{row.college_name}</td>
                      {DIFFICULTY_STUDENT_TEMPLATE_FIELDS.map((field) => (
                        <td key={field} style={field === "姓名(*)" ? styles.nameCell : styles.td}>
                          {field === "姓名(*)" ? (
                            <button style={styles.linkButton} onClick={() => {
                              setSelectedRow(row);
                              setDetailTab("detail");
                            }}>
                              {getTemplateCell(row, field) || "未填写姓名"}
                            </button>
                          ) : (
                            getTemplateCell(row, field) || "-"
                          )}
                        </td>
                      ))}
                      <td style={styles.td}>{displayStatus(row.status)}</td>
                      <td style={styles.td}>{row.rejected_reason || "-"}</td>
                      <td style={styles.td}>{row.resubmission_remark || "-"}</td>
                      <td style={styles.actionCell}>{renderRecordActions(row, "table")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="bos-table-card-foot">
          <span>第 1 页</span>
          <span>共 {filteredRows.length} 条</span>
        </div>
      </section>

      {selectedRow && (
        <div className="bos-modal-backdrop">
          <section className="bos-modal bos-modal--compact">
            <div className="bos-modal-header">
              <h2 style={styles.subTitle}>困难生明细详情</h2>
              <button onClick={() => setSelectedRow(null)}>关闭</button>
            </div>
            <div className="bos-modal-body">
              <div className="difficulty-detail-tabs" role="tablist" aria-label="困难生详情导航">
                <button
                  className={detailTab === "detail" ? "is-active" : ""}
                  onClick={() => setDetailTab("detail")}
                >
                  学生详情
                </button>
                <button
                  className={detailTab === "history" ? "is-active" : ""}
                  onClick={() => setDetailTab("history")}
                >
                  操作历史
                </button>
              </div>
              {detailTab === "detail" ? (
                <>
                  <div style={styles.detailGrid}>
                    <Detail label="当前状态" value={displayStatus(selectedRow.status)} />
                    <Detail label="退回原因" value={selectedRow.rejected_reason || ""} />
                    <Detail label="最近修改说明" value={selectedRow.resubmission_remark || ""} />
                    {DIFFICULTY_STUDENT_TEMPLATE_FIELDS.map((field) => (
                      <Detail key={field} label={field} value={getTemplateCell(selectedRow, field)} />
                    ))}
                  </div>
                  <div className="difficulty-detail-actions">
                    {renderRecordActions(selectedRow, "detail")}
                  </div>
                </>
              ) : (
                <DifficultyOperationHistory key={String(selectedRow.id || "")} recordId={selectedRow.id} />
              )}
            </div>
          </section>
        </div>
      )}

      {resubmitRow && (
        <div className="bos-modal-backdrop">
          <section className="bos-modal bos-modal--compact">
            <div className="bos-modal-header">
              <h2 style={styles.subTitle}>修改后重新提交</h2>
              <button disabled={isResubmitting} onClick={() => setResubmitRow(null)}>关闭</button>
            </div>
            <div className="bos-modal-body">
              <div className="difficulty-status-notice" data-tone="danger">
                退回原因：{resubmitRow.rejected_reason || "学校未填写退回原因"}
              </div>
              <label style={{ ...styles.fieldLabel, marginTop: 14 }}>
                修改说明 <span style={{ color: "#c2414d" }}>*</span>
                <textarea
                  style={{ ...styles.input, minHeight: 110, resize: "vertical" }}
                  value={resubmitRemark}
                  onChange={(event) => setResubmitRemark(event.target.value)}
                  placeholder="请说明已修改的字段和内容，例如：已更正家庭收入及困难等级证明信息。"
                />
              </label>
              <p style={styles.description}>修改说明将写入操作日志；提交后状态回到“学院确认审核及上载”，等待学校重新接收审核。</p>
              <div style={{ ...styles.modalFooter, marginTop: 16 }}>
                <button style={styles.secondaryButton} disabled={isResubmitting} onClick={() => setResubmitRow(null)}>取消</button>
                <button
                  style={isResubmitting || !resubmitRemark.trim() || recognitionWindowBlocked ? styles.disabledButton : styles.primaryButton}
                  disabled={isResubmitting || !resubmitRemark.trim() || recognitionWindowBlocked}
                  title={recognitionWindowBlocked ? recognitionWindow.message : undefined}
                  onClick={() => void handleResubmit()}
                >
                  {isResubmitting ? "提交中..." : "确认重新提交"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function CockpitStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "green" | "amber" | "purple" | "cyan";
}) {
  return (
    <div className={`difficulty-cockpit-card is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.detailItem}>
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { height: "100%", minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) clamp(270px, 23vw, 330px)", gap: 10, overflow: "hidden", boxSizing: "border-box" },
  mainColumn: { height: "100%", minWidth: 0, minHeight: 0, display: "grid", gridTemplateRows: "auto auto auto minmax(0, 1fr)", gap: 10, overflow: "hidden" },
  hero: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: 12, border: "1px solid #d5dee9", borderRadius: 9, background: "#fff", boxShadow: "0 2px 10px rgba(15,35,64,0.05)" },
  eyebrow: { color: "#1e5aa8", fontSize: 11, fontWeight: 900, letterSpacing: "0.04em" },
  title: { margin: "4px 0 5px", color: "#0f1f33", fontSize: 21 },
  description: { margin: 0, color: "#63738a", fontSize: 12, lineHeight: 1.55 },
  badge: { padding: "5px 9px", borderRadius: 999, background: "#e9f8f2", color: "#087b5b", border: "1px solid #c7eedf", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" },
  card: { padding: 12, border: "1px solid #d5dee9", borderRadius: 9, background: "#fff", boxShadow: "0 2px 10px rgba(15,35,64,0.04)", minWidth: 0, minHeight: 0, overflow: "hidden" },
  sectionLabel: { marginBottom: 6, color: "#334155", fontSize: 11, fontWeight: 900, letterSpacing: "0.05em" },
  toolbar: { display: "grid", gridTemplateColumns: "125px repeat(4, minmax(105px, 1fr)) auto auto", gap: 7, alignItems: "end" },
  fieldLabel: { display: "grid", gap: 5, color: "#40526a", fontSize: 12, fontWeight: 800 },
  select: { border: "1px solid #cfdbe7", borderRadius: 6, padding: "7px 9px", color: "#15304f", background: "#fff", fontSize: 12 },
  input: { border: "1px solid #cfdbe7", borderRadius: 6, padding: "7px 9px", color: "#15304f", background: "#fff", fontSize: 12 },
  secondaryButton: { border: "1px solid #cbd8e6", borderRadius: 6, minHeight: 34, padding: "7px 11px", background: "#fff", color: "#26364e", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" },
  primaryButton: { border: "1px solid #1e5aa8", borderRadius: 6, minHeight: 34, padding: "7px 11px", background: "#1e5aa8", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" },
  disabledButton: { border: "1px solid #cbd5e1", borderRadius: 6, minHeight: 34, padding: "7px 11px", background: "#e2e8f0", color: "#64748b", fontSize: 12, fontWeight: 800, cursor: "not-allowed", whiteSpace: "nowrap" },
  modalFooter: { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 },
  metaRow: { display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8, color: "#64748b", fontSize: 12 },
  info: { marginTop: 7, padding: 8, borderRadius: 6, background: "#f3f9ff", color: "#0875bd", border: "1px solid #cce3f8", fontSize: 12 },
  warning: { marginTop: 7, padding: 8, borderRadius: 6, background: "#fff8e6", color: "#9a6700", border: "1px solid #fde6a7", fontSize: 12 },
  stats: { display: "grid", gridTemplateColumns: "repeat(4, minmax(110px, 1fr))", gap: 7 },
  metric: { minHeight: 56, display: "grid", alignContent: "center", gap: 3, padding: "7px 9px", borderRadius: 7, border: "1px solid #d7e1ed", borderLeft: "3px solid #1e5aa8", background: "#fff" },
  metricLabel: { color: "#718096", fontSize: 10 },
  metricValue: { lineHeight: 1.15 },
  tableCard: { display: "flex", flexDirection: "column" },
  tableHead: { flex: "0 0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 7 },
  tableHint: { margin: 0, color: "#8290a6", fontSize: 11 },
  resultBadge: { padding: "4px 8px", borderRadius: 999, background: "#eff4ff", color: "#1e5aa8", border: "1px solid #cbd9ee", fontSize: 10, fontWeight: 800 },
  tableWrap: { flex: 1, height: "100%", minHeight: 0, overflow: "auto", border: "1px solid #d7e1ed", borderRadius: 6 },
  table: { width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { position: "sticky", top: 0, zIndex: 1, border: "1px solid #d7e1ed", background: "#edf4fa", padding: "9px 10px", whiteSpace: "nowrap", textAlign: "center" },
  td: { border: "1px solid #cbd5e1", padding: "8px 10px", textAlign: "center", whiteSpace: "nowrap" },
  nameCell: { border: "1px solid #cbd5e1", padding: "8px 10px", textAlign: "center", whiteSpace: "nowrap", fontWeight: 800 },
  actionColumn: { position: "sticky", top: 0, zIndex: 1, minWidth: 300, border: "1px solid #d7e1ed", background: "#edf4fa", padding: "9px 10px", whiteSpace: "nowrap", textAlign: "center" },
  actionCell: { minWidth: 300, maxWidth: 360, border: "1px solid #cbd5e1", padding: "8px 10px", textAlign: "left", whiteSpace: "normal" },
  empty: { padding: 18, color: "#8190a4", textAlign: "center" },
  linkButton: { border: "none", background: "transparent", color: "#1e5aa8", fontWeight: 800, cursor: "pointer" },
  smallButton: { border: "1px solid #bcd9f5", borderRadius: 6, padding: "6px 9px", background: "#f3f9ff", color: "#0879c5", fontWeight: 800, cursor: "pointer" },
  checkboxColumn: { minWidth: 46, width: 46, position: "sticky", left: 0, zIndex: 4 },
  logPanel: { height: "100%", minHeight: 0, padding: 14, borderRadius: 9, background: "linear-gradient(180deg, #0b1c30 0%, #0a1426 100%)", border: "1px solid #1e3350", overflow: "hidden", display: "flex", flexDirection: "column", boxSizing: "border-box", boxShadow: "0 4px 18px rgba(8,20,40,0.16)" },
  logHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingBottom: 10, borderBottom: "1px solid rgba(148,163,184,0.2)" },
  logTitle: { color: "#e5efff", fontSize: 15, margin: 0 },
  liveBadge: { display: "inline-flex", alignItems: "center", gap: 5, color: "#9fdcc8", fontSize: 10, fontWeight: 800 },
  liveDot: { width: 7, height: 7, borderRadius: "50%", background: "#21d59c", boxShadow: "0 0 0 3px rgba(33,213,156,0.12)" },
  logBox: { flex: 1, minHeight: 0, overflowY: "auto", paddingTop: 10, color: "#dceafe", fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.55 },
  logItem: { paddingBottom: 8, marginBottom: 8, borderBottom: "1px solid rgba(148,163,184,0.1)", whiteSpace: "pre-wrap" },
  modalBackdrop: { position: "fixed", inset: 0, zIndex: 9999, background: "rgba(11,28,48,0.58)", display: "grid", placeItems: "center", padding: 18, backdropFilter: "blur(2px)" },
  detailModal: { width: "min(760px, 92vw)", height: "min(620px, 78vh)", display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid #cbd5e1", borderRadius: 10, background: "#fff", boxShadow: "0 28px 90px rgba(15,23,42,0.34)" },
  detailHeader: { flex: "0 0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "13px 16px", borderBottom: "1px solid #d7e1ed", background: "#f8fafc" },
  detailBody: { flex: 1, minHeight: 0, overflow: "auto", padding: 16 },
  subTitle: { margin: 0, color: "#172033", fontSize: 17 },
  closeButton: { border: "1px solid #cbd8e6", borderRadius: 6, padding: "7px 10px", background: "#fff", color: "#26364e", fontWeight: 800, cursor: "pointer" },
  detailGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 },
  detailItem: { display: "grid", gap: 4, padding: 10, borderRadius: 6, border: "1px solid #d7e1ed", background: "#fff", color: "#63738a", fontSize: 12 },
};
