import type { ReactNode } from "react";

export type StatCardTone = "blue" | "green" | "red" | "amber" | "purple";

type StatCardProps = {
  label: string;
  value: ReactNode;
  tone?: StatCardTone;
  hint?: string;
};

export default function StatCard({ label, value, tone = "blue", hint }: StatCardProps) {
  return (
    <div className={`bos-stat-card is-${tone}`}>
      <div className="bos-stat-card__copy">
        <span>{label}</span>
        <strong>{value}</strong>
        {hint && <small>{hint}</small>}
      </div>
      <span className="bos-stat-card__mark" aria-hidden="true" />
    </div>
  );
}
