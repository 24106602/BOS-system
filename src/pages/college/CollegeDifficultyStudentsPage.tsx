import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx-js-style";
import type { UserProfile } from "../../types/auth";
import { ACADEMIC_YEAR_OPTIONS, getCurrentAcademicYear } from "../../utils/academicYear";
import { normalizeIdCard, fetchCollegeDifficultyStudents, type DifficultyStudentRow } from "../../services/difficultyStudentService";
import { normalizeSubmissionCollegeName } from "../../utils/collegeDetector";
import {
  DIFFICULTY_STUDENT_TEMPLATE_FIELDS,
  getDifficultyTemplateValue,
  makeDifficultyRowKey,
  type DifficultyStudentTemplateField,
} from "../../constants/difficultyStudentTemplate";
import PageContainer from "../../components/ui/PageContainer";
import StatCard from "../../components/ui/StatCard";
import FilterBar, { type FilterField } from "../../components/ui/FilterBar";
import ActionBar from "../../components/ui/ActionBar";
import DataTable, { type DataColumn } from "../../components/ui/DataTable";
import DetailModal, { type DetailGroup } from "../../components/ui/DetailModal";
import type { BreadcrumbItem } from "../../components/ui/Breadcrumb";

type CollegeDifficultyStudentsPageProps = {
  profile: UserProfile;
  onNavigate?: (to: string) => void;
};

const statusText: Record<string, string> = {
  college_submitted: "学院已提交",
  pending_review: "待学校确认",
  archived: "管理员归档",
  local_uploaded: "本地已上载",
};

const displayStatus = (status: string) => statusText[status] || status || "已上载学校端";

const getTemplateCell = (row: DifficultyStudentRow, field: DifficultyStudentTemplateField) => {
  if (field === "姓名(*)") return getDifficultyTemplateValue(row.raw_data, field, row.name);
  if (field === "身份证号(*)") return getDifficultyTemplateValue(row.raw_data, field, row.id_card);
  if (field === "特殊困难类型(*)" || field === "推荐档次(*)") {
    return getDifficultyTemplateValue(row.raw_data, field, row.difficulty_level);
  }
  return getDifficultyTemplateValue(row.raw_data, field);
};

export default function CollegeDifficultyStudentsPage({ profile, onNavigate }: CollegeDifficultyStudentsPageProps) {
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());
  const [nameKeyword, setNameKeyword] = useState("");
  const [studentIdKeyword, setStudentIdKeyword] = useState("");
  const [idCardKeyword, setIdCardKeyword] = useState("");
  const [difficultyKeyword, setDifficultyKeyword] = useState("");
  const [statusKeyword, setStatusKeyword] = useState("");
  const [rows, setRows] = useState<DifficultyStudentRow[]>([]);
  const [selectedRow, setSelectedRow] = useState<DifficultyStudentRow | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [loadMessage, setLoadMessage] = useState("");
  const [dataSource, setDataSource] = useState<"supabase" | "local">("supabase");

  const collegeName = normalizeSubmissionCollegeName(profile.college_name || profile.display_name || "");

  const getRowKey = (row: DifficultyStudentRow) =>
    makeDifficultyRowKey(row.academic_year, row.college_name, row.id_card, row.student_id, 0);

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
      困难等级: row.difficulty_level,
      状态: displayStatus(row.status),
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet["!cols"] = Object.keys(exportRows[0]).map(() => ({ wch: 18 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "困难生明细");
    XLSX.writeFile(workbook, `${academicYear}_${collegeName || "学院"}_困难生明细.xlsx`);
  };

  const breadcrumb: BreadcrumbItem[] = [
    { label: "学部（院）端", onClick: () => onNavigate?.("/college") },
    { label: "困难生业务", onClick: () => onNavigate?.("/college/difficulty") },
    { label: "困难生明细" },
  ];

  const filterFields: FilterField[] = [
    { key: "college", label: "学院/学部", value: collegeName || "学院账号", onChange: () => {}, readOnly: true },
    { key: "name", label: "姓名", value: nameKeyword, onChange: setNameKeyword, placeholder: "按姓名筛选" },
    { key: "studentId", label: "学号", value: studentIdKeyword, onChange: setStudentIdKeyword, placeholder: "按学号筛选" },
    { key: "idCard", label: "身份证号", value: idCardKeyword, onChange: setIdCardKeyword, placeholder: "按身份证号筛选" },
    { key: "difficulty", label: "困难等级", value: difficultyKeyword, onChange: setDifficultyKeyword, placeholder: "按等级筛选" },
    { key: "status", label: "状态", value: statusKeyword, onChange: setStatusKeyword, placeholder: "按状态筛选" },
  ];

  const tableColumns: DataColumn[] = DIFFICULTY_STUDENT_TEMPLATE_FIELDS.map((field) => ({
    key: field,
    label: field,
    render: (_value: unknown, row: DifficultyStudentRow) => {
      const cellValue = getTemplateCell(row, field);
      if (field === "姓名(*)") {
        return <button className="bos-link-button" onClick={() => setSelectedRow(row)}>{cellValue || "未填写姓名"}</button>;
      }
      return cellValue || "-";
    },
  }));

  const detailGroups: DetailGroup[] = selectedRow
    ? [
        {
          title: "基础信息",
          items: ["姓名(*)", "籍贯(*)", "身份证号(*)", "家庭人口数(*)", "手机号码(*)", "辅导员姓名"]
            .map((f) => ({ label: f, value: getTemplateCell(selectedRow, f) })),
        },
        {
          title: "家庭情况",
          items: ["家庭地址(*)", "邮政编码(*)", "家长手机号码(*)", "家庭人均年收入(*)", "收入来源(*)", "家庭欠债金额(*)", "户籍性质（*）", "劳动力人口数（*）", "赡养人口数（*）"]
            .map((f) => ({ label: f, value: getTemplateCell(selectedRow, f) })),
        },
        {
          title: "困难认定",
          items: ["特殊困难类型(*)", "是否遭受自然灾害(*)", "自然灾害描述（60字）(*)", "是否遭受突发事件(*)", "突发事件描述（60字）(*)", "推荐档次(*)", "院系推荐档次", "学校推荐档次"]
            .map((f) => ({ label: f, value: getTemplateCell(selectedRow, f) })),
        },
        {
          title: "审核意见",
          items: ["陈述理由（60字）(*)", "认定时间(*)", "是否同意评议小组意见(*)", "院系意见（60字）(*)", "是否同意院系工作组意见(*)", "学校意见（60字）(*)"]
            .map((f) => ({ label: f, value: getTemplateCell(selectedRow, f) })),
        },
      ]
    : [];

  return (
    <PageContainer
      title="困难生明细"
      description="按学年查看本学院已经上载的困难生数据，点击姓名或操作按钮查看学生详情。"
      breadcrumb={breadcrumb}
      actions={
        <label className="bos-current-year">
          当前学年
          <select value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}>
            {ACADEMIC_YEAR_OPTIONS.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
      }
    >
      <div className="bos-stat-grid">
        <StatCard label="本学院困难生" value={rows.length} tone="blue" />
        <StatCard label="当前筛选结果" value={filteredRows.length} tone="green" />
        <StatCard
          label="特殊困难"
          value={rows.filter((row) => /特别|特殊|低保|孤儿|残疾|烈士/.test(row.difficulty_level)).length}
          tone="amber"
        />
        <StatCard label="当前选中" value={selectedKeys.size} tone="purple" />
      </div>

      <FilterBar
        fields={filterFields}
        onSearch={() => void loadRows()}
        onReset={resetFilters}
        extra={loadMessage ? (
          <div className={dataSource === "supabase" ? "bos-filter-hint is-info" : "bos-filter-hint is-warning"}>
            {loadMessage}
          </div>
        ) : undefined}
      />

      <ActionBar>
        <button className="is-primary" onClick={() => void loadRows()} disabled={isLoading}>
          {isLoading ? "刷新中..." : "刷新数据"}
        </button>
        <button className="is-purple" onClick={exportCurrentRows}>导出当前名单</button>
        <button className="is-danger" disabled={selectedKeys.size === 0} onClick={deleteSelectedRows}>
          删除选中（{selectedKeys.size}）
        </button>
      </ActionBar>

      <div className="bos-status-row">
        <span className="bos-status-badge">学年 {academicYear}</span>
        <span className="bos-status-badge">{collegeName || "学院账号"}</span>
        <span className="bos-status-badge is-success">数据源 {dataSource === "supabase" ? "Supabase" : "本地记录"}</span>
        <span className="bos-status-badge">总数 {rows.length}</span>
        <span className="bos-status-badge">筛选结果 {filteredRows.length}</span>
      </div>

      <DataTable
        columns={tableColumns}
        rows={filteredRows as unknown as Record<string, unknown>[]}
        loading={isLoading}
        emptyText="暂无当前学年困难生明细"
        selectable
        selectedKeys={selectedKeys}
        rowKey={(row) => getRowKey(row as unknown as DifficultyStudentRow)}
        onSelectAll={() => toggleAllRows()}
        onSelectRow={(row) => toggleRow(row as unknown as DifficultyStudentRow)}
        allSelected={allVisibleSelected}
        title="困难生申请档案数据表"
        titleExtra={
          <span>严格按申请档案模板 40 列展示，横向滚动查看全部字段 · 显示 {filteredRows.length} / {rows.length} 条</span>
        }
        footer={
          <>
            <span>第 1 页</span>
            <span>共 {filteredRows.length} 条</span>
          </>
        }
        className="bos-data-table--wide"
      />

      <DetailModal
        visible={Boolean(selectedRow)}
        title="困难生明细详情"
        groups={detailGroups}
        onClose={() => setSelectedRow(null)}
      />
    </PageContainer>
  );
}
