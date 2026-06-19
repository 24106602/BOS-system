import ProcessingWorkbench from "../../App";

type CollegeUploadPageProps = {
  panel: "student" | "family";
  onNavigate?: (to: string) => void;
};

export default function CollegeUploadPage({ panel, onNavigate }: CollegeUploadPageProps) {
  return (
    <div className="difficulty-upload-shell">
      <div className="difficulty-panel-tabs" aria-label="困难生数据类型切换">
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
      <ProcessingWorkbench
        collegeMode
        fixedProcessingPanel={panel}
        layoutMarker="AI Studio Layout Active - Difficulty Upload"
        onBackToDifficulty={() => onNavigate?.("/college/difficulty")}
        onViewDifficultyStudents={() => onNavigate?.("/college/difficulty/students")}
      />
    </div>
  );
}
