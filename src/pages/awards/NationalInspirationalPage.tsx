import AwardProcessPage from "./AwardProcessPage";

type NationalInspirationalPageProps = {
  onNavigate?: (to: string) => void;
};

export default function NationalInspirationalPage({ onNavigate }: NationalInspirationalPageProps) {
  return <AwardProcessPage awardType="inspirational" onNavigate={onNavigate} />;
}
