import ProcessingWorkbench from "../../App";
import PageContainer from "../../components/ui/PageContainer";
import type { BreadcrumbItem } from "../../components/ui/Breadcrumb";
import StepGuide, { type StepItem } from "../../components/ui/StepGuide";

type CollegeUploadPageProps = {
  panel: "student" | "family";
  onNavigate?: (to: string) => void;
};

const panelConfig = {
  student: {
    title: "本专科信息处理",
    description: "上传困难生本专科信息模板和数据，执行治理规则后确认审核并上载学校端。",
    breadcrumb: [
      { label: "困难生业务" },
      { label: "本专科信息处理" },
    ] as BreadcrumbItem[],
  },
  family: {
    title: "家庭成员信息处理",
    description: "上传困难生家庭成员信息数据，执行治理规则后确认审核并上载学校端。",
    breadcrumb: [
      { label: "困难生业务" },
      { label: "家庭成员信息处理" },
    ] as BreadcrumbItem[],
  },
};

const processingSteps: StepItem[] = [
  { label: "上传模板表", description: "选择本专科模板 Excel", status: "pending" },
  { label: "上传数据表", description: "选择待处理数据", status: "pending" },
  { label: "执行治理", description: "自动校验与修复", status: "pending" },
  { label: "确认审核", description: "学院确认无误", status: "pending" },
  { label: "上载学校端", description: "提交至校级管理", status: "pending" },
];

export default function CollegeUploadPage({ panel, onNavigate }: CollegeUploadPageProps) {
  const config = panelConfig[panel];

  const breadcrumbWithNav: BreadcrumbItem[] = [
    { label: "学部（院）端", onClick: () => onNavigate?.("/college") },
    { label: "困难生业务", onClick: () => onNavigate?.("/college/difficulty") },
    ...config.breadcrumb,
  ];

  return (
    <div className="difficulty-upload-shell">
      <PageContainer
        title={config.title}
        description={config.description}
        breadcrumb={breadcrumbWithNav}
        actions={
          <div className="bos-panel-tabs">
            <button
              className={panel === "student" ? "is-active" : ""}
              onClick={() => onNavigate?.("/college/difficulty/student")}
            >
              本专科信息
            </button>
            <button
              className={panel === "family" ? "is-active" : ""}
              onClick={() => onNavigate?.("/college/difficulty/family")}
            >
              家庭成员信息
            </button>
          </div>
        }
      >
        <StepGuide steps={processingSteps} />
      </PageContainer>
      <ProcessingWorkbench
        collegeMode
        fixedProcessingPanel={panel}
        onBackToDifficulty={() => onNavigate?.("/college/difficulty")}
        onViewDifficultyStudents={() => onNavigate?.("/college/difficulty/students")}
      />
    </div>
  );
}
