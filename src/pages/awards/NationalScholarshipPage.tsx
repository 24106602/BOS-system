import AwardProcessPage from "./AwardProcessPage";

type NationalScholarshipPageProps = {
  onNavigate?: (to: string) => void;
};

export default function NationalScholarshipPage({ onNavigate }: NationalScholarshipPageProps) {
  return <AwardProcessPage awardType="national" onNavigate={onNavigate} />;
}
