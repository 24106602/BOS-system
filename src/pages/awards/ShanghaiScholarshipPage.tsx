import AwardProcessPage from "./AwardProcessPage";

type ShanghaiScholarshipPageProps = {
  onNavigate?: (to: string) => void;
};

export default function ShanghaiScholarshipPage({ onNavigate }: ShanghaiScholarshipPageProps) {
  return <AwardProcessPage awardType="shanghai" onNavigate={onNavigate} />;
}
