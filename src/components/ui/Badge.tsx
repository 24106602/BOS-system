import React from "react";

type StatusVariant =
  | "draft"
  | "college_confirmed"
  | "school_reviewing"
  | "school_approved"
  | "reported"
  | "rejected_by_school"
  | "returned_by_center";

type GenericVariant =
  | "default"
  | "info"
  | "success"
  | "warning"
  | "danger";

type BadgeVariant = StatusVariant | GenericVariant;

interface BadgeProps {
  variant?: BadgeVariant;
  children: string;
  className?: string;
}

const variantClass: Record<BadgeVariant, string> = {
  draft: "bos-badge--draft",
  college_confirmed: "bos-badge--college-confirmed",
  school_reviewing: "bos-badge--school-reviewing",
  school_approved: "bos-badge--school-approved",
  reported: "bos-badge--reported",
  rejected_by_school: "bos-badge--rejected-by-school",
  returned_by_center: "bos-badge--returned-by-center",
  default: "bos-badge--default",
  info: "bos-badge--info",
  success: "bos-badge--success",
  warning: "bos-badge--warning",
  danger: "bos-badge--danger",
};

const Badge: React.FC<BadgeProps> = ({ variant = "default", children, className }) => {
  const classes = ["bos-badge", variantClass[variant], className].filter(Boolean).join(" ");

  return (
    <span className={classes}>
      {children}
      <style>{`
        .bos-badge {
          display: inline-flex;
          align-items: center;
          font-size: var(--text-xs, 12px);
          line-height: 1;
          font-weight: var(--font-medium, 500);
          padding: 2px 10px;
          border-radius: var(--radius-full, 9999px);
          white-space: nowrap;
          user-select: none;
        }

        /* Status variants */
        .bos-badge--draft {
          background-color: var(--status-draft-bg, #94A3B8);
          color: var(--status-draft-text, #475569);
        }

        .bos-badge--college-confirmed {
          background-color: var(--status-college_confirmed-bg, #DBEAFE);
          color: var(--status-college_confirmed-text, #1D4ED8);
        }

        .bos-badge--school-reviewing {
          background-color: var(--status-school_reviewing-bg, #FEF3C7);
          color: var(--status-school_reviewing-text, #B45309);
        }

        .bos-badge--school-approved {
          background-color: var(--status-school_approved-bg, #CCFBF1);
          color: var(--status-school_approved-text, #0F766E);
        }

        .bos-badge--reported {
          background-color: var(--status-reported-bg, #DCFCE7);
          color: var(--status-reported-text, #15803D);
        }

        .bos-badge--rejected-by-school {
          background-color: var(--status-rejected_by_school-bg, #FEE2E2);
          color: var(--status-rejected_by_school-text, #B91C1C);
        }

        .bos-badge--returned-by-center {
          background-color: var(--status-returned_by_center-bg, #F3E8FF);
          color: var(--status-returned_by_center-text, #7C3AED);
        }

        /* Generic variants */
        .bos-badge--default {
          background-color: var(--color-gray-100, #F1F5F9);
          color: var(--color-gray-500, #64748B);
        }

        .bos-badge--info {
          background-color: var(--color-primary-light, #DBEAFE);
          color: var(--color-primary, #2563EB);
        }

        .bos-badge--success {
          background-color: #DCFCE7;
          color: var(--color-success, #16A34A);
        }

        .bos-badge--warning {
          background-color: #FEF3C7;
          color: var(--color-warning, #D97706);
        }

        .bos-badge--danger {
          background-color: #FEE2E2;
          color: var(--color-danger, #DC2626);
        }
      `}</style>
    </span>
  );
};

export default Badge;
