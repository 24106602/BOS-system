export type StepItem = {
  label: string;
  description?: string;
  status: "completed" | "active" | "pending";
};

type StepGuideProps = {
  steps: StepItem[];
};

export default function StepGuide({ steps }: StepGuideProps) {
  return (
    <div className="bos-step-guide">
      {steps.map((step, index) => (
        <div
          key={`${step.label}_${index}`}
          className={`bos-step-guide__item is-${step.status}`}
        >
          <span className="bos-step-guide__marker">
            {step.status === "completed" ? "\u2713" : index + 1}
          </span>
          <div className="bos-step-guide__content">
            <strong>{step.label}</strong>
            {step.description && <small>{step.description}</small>}
          </div>
          {index < steps.length - 1 && <span className="bos-step-guide__connector" />}
        </div>
      ))}
    </div>
  );
}
