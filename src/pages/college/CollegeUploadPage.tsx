import ProcessingWorkbench from "../../App";

type CollegeUploadPageProps = {
  panel: "student" | "family";
  onNavigate?: (to: string) => void;
};

export default function CollegeUploadPage({ panel, onNavigate }: CollegeUploadPageProps) {
  return (
    <ProcessingWorkbench
      collegeMode
      fixedProcessingPanel={panel}
      layoutMarker="AI Studio Layout Active - College Upload"
      onBackToDifficulty={() => onNavigate?.("/college/difficulty")}
      onViewDifficultyStudents={() => onNavigate?.("/college/difficulty/students")}
    />
  );
}
