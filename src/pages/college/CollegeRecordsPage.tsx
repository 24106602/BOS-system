import { useEffect, useMemo, useState } from "react";
import type { UserProfile } from "../../types/auth";
import { isSameSubmissionCollege } from "../../utils/collegeDetector";
import { ACADEMIC_YEAR_OPTIONS, getCurrentAcademicYear, isBatchInAcademicYear } from "../../utils/academicYear";
import { getMergeBatches } from "../../db/localMergeDb";
import type { CollegeProcessedBatch } from "../../types/merge";
import PageContainer from "../../components/ui/PageContainer";
import StatCard from "../../components/ui/StatCard";
import FilterBar, { type FilterField } from "../../components/ui/FilterBar";
import ActionBar from "../../components/ui/ActionBar";
import DataTable, { type DataColumn } from "../../components/ui/DataTable";
import DetailModal, { type DetailGroup } from "../../components/ui/DetailModal";
import type { BreadcrumbItem } from "../../components/ui/Breadcrumb";

type CollegeRecordsPageProps = {
  profile: UserProfile;
  onNavigate?: (to: string) => void;
};

export default function CollegeRecordsPage({ profile, onNavigate }: CollegeRecordsPageProps) {
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());
  const [dataTypeFilter, setDataTypeFilter] = useState("all");
  const [batches, setBatches] = useState<CollegeProcessedBatch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<CollegeProcessedBatch | null>(null);

  const unitName = profile.college_name || profile.display_name || "";

  useEffect(() => {
    getMergeBatches().then(setBatches);
  }, []);

  const myBatches = useMemo(
    () =>
      batches.filter(
        (item) =>
          isSameSubmissionCollege(item.collegeName, unitName) &&
          isBatchInAcademicYear(item, academicYear)
      ),
    [academicYear, batches, unitName]
  );

  const filteredBatches = useMemo(() => {
    if (dataTypeFilter === "all") return myBatches;
    return myBatches.filter((item) => item.dataType === dataTypeFilter);
  }, [dataTypeFilter, myBatches]);

  const studentBatches = myBatches.filter((item) => item.dataType === "student");
  const familyBatches = myBatches.filter((item) => item.dataType === "family");
  const totalRows = myBatches.reduce((sum, item) => sum + item.rowCount, 0);

  const breadcrumb: BreadcrumbItem[] = [
    { label: "学部（院）端", onClick: () => onNavigate?.("/college") },
    { label: "困难生业务", onClick: () => onNavigate?.("/college/difficulty") },
    { label: "提交记录" },
  ];

  const filterFields: FilterField[] = [
    {
      key: "academicYear",
      label: "学年",
      type: "select",
      value: academicYear,
      onChange: setAcademicYear,
      options: ACADEMIC_YEAR_OPTIONS.map((year) => ({ label: year, value: year })),
    },
    {
      key: "dataType",
      label: "数据类型",
      type: "select",
      value: dataTypeFilter,
      onChange: setDataTypeFilter,
      options: [
        { label: "全部", value: "all" },
        { label: "本专科信息", value: "student" },
        { label: "家庭成员信息", value: "family" },
      ],
    },
  ];

  const columns: DataColumn[] = [
    {
      key: "collegeName",
      label: "提交单位",
      render: (_value: unknown, row: Record<string, unknown>) => String(row.collegeName ?? "-"),
    },
    {
      key: "dataType",
      label: "数据类型",
      render: (_value: unknown, row: Record<string, unknown>) =>
        row.dataType === "student" ? "本专科信息" : "家庭成员信息",
    },
    {
      key: "rowCount",
      label: "通过人数",
    },
    {
      key: "failCount",
      label: "不通过人数",
      render: () => "0",
    },
    {
      key: "status",
      label: "提交状态",
      render: () => "已上载",
    },
    {
      key: "createdAt",
      label: "提交时间",
      render: (_value: unknown, row: Record<string, unknown>) =>
        row.createdAt ? new Date(String(row.createdAt)).toLocaleString() : "-",
    },
    {
      key: "actions",
      label: "操作",
      render: (_value: unknown, row: Record<string, unknown>, rowIndex: number) => (
        <button className="bos-link-button" onClick={() => setSelectedBatch(filteredBatches[rowIndex] ?? null)}>
          查看详情
        </button>
      ),
    },
  ];

  const detailGroups: DetailGroup[] = selectedBatch
    ? [
        {
          title: "提交信息",
          items: [
            { label: "提交单位", value: selectedBatch.collegeName },
            { label: "数据类型", value: selectedBatch.dataType === "student" ? "本专科信息" : "家庭成员信息" },
            { label: "通过人数", value: String(selectedBatch.rowCount) },
            { label: "不通过人数", value: "0" },
            { label: "提交状态", value: "已上载" },
            { label: "提交时间", value: new Date(selectedBatch.createdAt).toLocaleString() },
            { label: "学年", value: selectedBatch.academicYear || academicYear },
          ],
        },
      ]
    : [];

  return (
    <PageContainer
      title="提交记录"
      description="查看本学院在各学年的困难生数据提交历史记录。"
      breadcrumb={breadcrumb}
    >
      <div className="bos-stat-grid">
        <StatCard label="本专科提交批次" value={studentBatches.length} tone="blue" />
        <StatCard label="家庭成员提交批次" value={familyBatches.length} tone="green" />
        <StatCard label="提交总批次" value={myBatches.length} tone="blue" />
        <StatCard label="通过总人数" value={totalRows} tone="green" />
      </div>

      <FilterBar fields={filterFields} />

      <ActionBar>
        <button className="is-primary" onClick={() => getMergeBatches().then(setBatches)}>
          刷新数据
        </button>
      </ActionBar>

      <DataTable
        columns={columns}
        rows={filteredBatches as unknown as Record<string, unknown>[]}
        emptyText="暂无提交记录"
        title="提交批次记录"
        titleExtra={
          <span>共 {filteredBatches.length} 个批次 · 通过 {filteredBatches.reduce((s, b) => s + b.rowCount, 0)} 条</span>
        }
        footer={
          <>
            <span>数据来源：学院已上载批次</span>
            <span>共 {filteredBatches.length} 个批次</span>
          </>
        }
      />

      <DetailModal
        visible={Boolean(selectedBatch)}
        title="提交批次详情"
        groups={detailGroups}
        onClose={() => setSelectedBatch(null)}
      />
    </PageContainer>
  );
}
