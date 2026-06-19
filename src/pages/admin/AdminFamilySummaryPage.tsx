import DifficultyBatchSummaryPage from "./DifficultyBatchSummaryPage";

export default function AdminFamilySummaryPage() {
  return (
    <DifficultyBatchSummaryPage
      dataType="family"
      title="家庭成员信息汇总"
      description="按学年查看各学院上载的困难生家庭成员信息，支持学院和学生关键词筛选、刷新及当前名单导出。"
    />
  );
}
