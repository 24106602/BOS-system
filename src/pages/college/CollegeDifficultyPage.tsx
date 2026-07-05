import { useEffect, useMemo, useState } from "react";
import { getMergeBatches } from "../../db/localMergeDb";
import type { CollegeProcessedBatch } from "../../types/merge";
import type { UserProfile } from "../../types/auth";
import { isSameSubmissionCollege } from "../../utils/collegeDetector";
import { ACADEMIC_YEAR_OPTIONS, getCurrentAcademicYear, isBatchInAcademicYear } from "../../utils/academicYear";
import PageContainer from "../../components/ui/PageContainer";
import StatCard from "../../components/ui/StatCard";
import StepGuide, { type StepItem } from "../../components/ui/StepGuide";
import DataTable, { type DataColumn } from "../../components/ui/DataTable";
import type { BreadcrumbItem } from "../../components/ui/Breadcrumb";

type CollegeDifficultyPageProps = {
  profile: UserProfile;
  onNavigate?: (to: string) => void;
};

export default function CollegeDifficultyPage({ profile, onNavigate }: CollegeDifficultyPageProps) {
  const [batches, setBatches] = useState<CollegeProcessedBatch[]>([]);
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());

  useEffect(() => {
    getMergeBatches().then(setBatches);
  }, []);

  const unitName = profile.college_name || profile.display_name || "当前学部（院）";
  const myBatches = useMemo(
    () =>
      batches.filter(
        (item) =>
          isSameSubmissionCollege(item.collegeName, unitName) &&
          isBatchInAcademicYear(item, academicYear)
      ),
    [academicYear, batches, unitName]
  );
  const studentBatches = myBatches.filter((item) => item.dataType === "student");
  const familyBatches = myBatches.filter((item) => item.dataType === "family");
  const studentCount = studentBatches.reduce((sum, item) => sum + item.rowCount, 0);
  const familyCount = familyBatches.reduce((sum, item) => sum + item.rowCount, 0);
  const lastAt = myBatches.map((item) => item.createdAt).sort().at(-1) || "";

  const hasStudentSubmission = studentBatches.length > 0;
  const hasFamilySubmission = familyBatches.length > 0;

  const breadcrumb: BreadcrumbItem[] = [
    { label: "学部（院）端", onClick: () => onNavigate?.("/college") },
    { label: "困难生业务" },
  ];

  const flowSteps: StepItem[] = [
    {
      label: "本专科信息处理",
      description: "上传模板与数据",
      status: hasStudentSubmission ? "completed" : "pending",
    },
    {
      label: "家庭成员信息处理",
      description: "上传家庭成员数据",
      status: hasFamilySubmission ? "completed" : "pending",
    },
    {
      label: "学院确认审核",
      description: "确认数据无误",
      status: hasStudentSubmission && hasFamilySubmission ? "completed" : "pending",
    },
    {
      label: "上载学校端",
      description: "提交至校级管理",
      status: hasStudentSubmission || hasFamilySubmission ? "active" : "pending",
    },
  ];

  const recordColumns: DataColumn[] = [
    { key: "dataType", label: "数据类型" },
    { key: "collegeName", label: "提交单位" },
    { key: "rowCount", label: "通过人数" },
    { key: "failCount", label: "不通过人数" },
    { key: "status", label: "提交状态" },
    { key: "createdAt", label: "提交时间" },
  ];

  const recordRows = useMemo(
    () =>
      myBatches
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 8)
        .map((item) => ({
          dataType: item.dataType === "student" ? "本专科信息" : "家庭成员信息",
          collegeName: item.collegeName,
          rowCount: String(item.rowCount),
          failCount: "0",
          status: "已上载",
          createdAt: new Date(item.createdAt).toLocaleString(),
        })),
    [myBatches]
  );

  return (
    <PageContainer
      title="困难生业务"
      description="当前学部（院）提交与处理情况概览。业务首页展示入口、状态和最近提交记录。"
      breadcrumb={breadcrumb}
      actions={
        <label className="bos-current-year">
          当前学年
          <select value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}>
            {ACADEMIC_YEAR_OPTIONS.map((year) => (
              <option key={year}>{year}</option>
            ))}
          </select>
        </label>
      }
    >
      <div className="bos-status-row">
        <span className="bos-status-badge is-success">当前学院：{unitName}</span>
        <span className="bos-status-badge">学年：{academicYear}</span>
        <span className="bos-status-badge">
          最近提交：{lastAt ? new Date(lastAt).toLocaleString() : "暂无"}
        </span>
      </div>

      <div className="bos-stat-grid">
        <StatCard label="本专科提交批次" value={studentBatches.length} tone="blue" hint={`共 ${studentCount} 条`} />
        <StatCard label="家庭成员提交批次" value={familyBatches.length} tone="green" hint={`共 ${familyCount} 条`} />
        <StatCard label="本专科通过人数" value={studentCount} tone="blue" />
        <StatCard label="家庭成员通过人数" value={familyCount} tone="green" />
      </div>

      <StepGuide steps={flowSteps} />

      <div className="bos-quick-entry-grid">
        <button className="bos-quick-entry is-primary" onClick={() => onNavigate?.("/college/difficulty/student")}>
          <strong>本专科信息处理</strong>
          <small>上传模板与待处理数据，执行治理规则</small>
        </button>
        <button className="bos-quick-entry" onClick={() => onNavigate?.("/college/difficulty/family")}>
          <strong>家庭成员信息处理</strong>
          <small>上传家庭成员数据，完成治理和校验</small>
        </button>
        <button className="bos-quick-entry" onClick={() => onNavigate?.("/college/difficulty/students")}>
          <strong>困难生明细</strong>
          <small>查看本学院已上载的困难生数据</small>
        </button>
        <button className="bos-quick-entry" onClick={() => onNavigate?.("/college/records")}>
          <strong>提交记录</strong>
          <small>查看学院端提交批次记录</small>
        </button>
      </div>

      <DataTable
        columns={recordColumns}
        rows={recordRows}
        emptyText="暂无提交记录"
        title="最近提交记录"
        titleExtra={
          <span>
            本专科 {studentCount} 条 · 家庭成员 {familyCount} 条
          </span>
        }
        footer={
          <>
            <span>数据来源：学院已上载批次</span>
            <span>共 {myBatches.length} 个批次</span>
          </>
        }
      />
    </PageContainer>
  );
}
