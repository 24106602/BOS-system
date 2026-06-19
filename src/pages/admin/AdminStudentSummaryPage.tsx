import DifficultyBatchSummaryPage from "./DifficultyBatchSummaryPage";

export default function AdminStudentSummaryPage() {
  return (
    <DifficultyBatchSummaryPage
      dataType="student"
      title="本专科信息汇总"
      description="按学年查看各学院上载的困难生学生主信息，支持学院和学生关键词筛选、刷新及当前名单导出。"
    />
  );
}
