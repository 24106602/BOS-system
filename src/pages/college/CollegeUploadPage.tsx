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
      onBackToDifficulty={() => onNavigate?.("/college/difficulty")}
    />
  );
}
