import type { ReactNode, ButtonHTMLAttributes } from "react";

/* ------------------------------------------------------------------ */
/*  BOS Button Component — uses design-tokens.css custom properties   */
/* ------------------------------------------------------------------ */

const styles = `
/* ---- Base ---- */
.bos-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1, 4px);
  border: 1px solid transparent;
  border-radius: var(--radius-sm, 4px);
  font-family: var(--font-family, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif);
  font-weight: var(--font-semibold, 600);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  transition:
    background-color var(--transition-fast, 150ms ease),
    color var(--transition-fast, 150ms ease),
    border-color var(--transition-fast, 150ms ease),
    opacity var(--transition-fast, 150ms ease),
    box-shadow var(--transition-fast, 150ms ease);
  outline: none;
  box-sizing: border-box;
  padding: 0 var(--space-4, 16px);
}

.bos-btn:focus-visible {
  box-shadow: 0 0 0 2px var(--bg-card, #fff), 0 0 0 4px var(--color-primary, #2563EB);
}

/* ---- Sizes ---- */
.bos-btn--sm {
  height: 32px;
  font-size: var(--text-xs, 12px);
  padding: 0 var(--space-2, 8px);
}

.bos-btn--md {
  height: 40px;
  font-size: var(--text-sm, 14px);
}

.bos-btn--lg {
  height: 48px;
  font-size: var(--text-base, 16px);
  padding: 0 var(--space-6, 24px);
}

/* ---- Primary ---- */
.bos-btn--primary {
  background-color: var(--color-primary, #2563EB);
  color: var(--bg-card, #ffffff);
  border-color: var(--color-primary, #2563EB);
}
.bos-btn--primary:hover:not(:disabled) {
  background-color: var(--color-primary-dark, #1D4ED8);
  border-color: var(--color-primary-dark, #1D4ED8);
}
.bos-btn--primary:active:not(:disabled) {
  background-color: #1E40AF;
  border-color: #1E40AF;
}

/* ---- Secondary ---- */
.bos-btn--secondary {
  background-color: var(--bg-card, #ffffff);
  color: var(--color-primary, #2563EB);
  border-color: var(--color-primary, #2563EB);
}
.bos-btn--secondary:hover:not(:disabled) {
  background-color: var(--color-primary-light, #DBEAFE);
}
.bos-btn--secondary:active:not(:disabled) {
  background-color: var(--color-primary-light, #DBEAFE);
}

/* ---- Ghost ---- */
.bos-btn--ghost {
  background-color: transparent;
  color: var(--text-secondary, #64748B);
  border-color: transparent;
}
.bos-btn--ghost:hover:not(:disabled) {
  background-color: var(--color-gray-100, #F1F5F9);
  color: var(--text-primary, #0F172A);
}
.bos-btn--ghost:active:not(:disabled) {
  background-color: var(--color-gray-200, #E2E8F0);
}

/* ---- Danger ---- */
.bos-btn--danger {
  background-color: var(--color-danger, #DC2626);
  color: var(--bg-card, #ffffff);
  border-color: var(--color-danger, #DC2626);
}
.bos-btn--danger:hover:not(:disabled) {
  background-color: #B91C1C;
  border-color: #B91C1C;
}
.bos-btn--danger:active:not(:disabled) {
  background-color: #991B1B;
  border-color: #991B1B;
}

/* ---- Success ---- */
.bos-btn--success {
  background-color: var(--color-success, #16A34A);
  color: var(--bg-card, #ffffff);
  border-color: var(--color-success, #16A34A);
}
.bos-btn--success:hover:not(:disabled) {
  background-color: #15803D;
  border-color: #15803D;
}
.bos-btn--success:active:not(:disabled) {
  background-color: #166534;
  border-color: #166534;
}

/* ---- Disabled ---- */
.bos-btn[disabled],
.bos-btn--disabled {
  cursor: not-allowed;
  opacity: 0.5;
  background-color: var(--color-gray-100, #F1F5F9);
  color: var(--text-disabled, #94A3B8);
  border-color: var(--border-default, #E2E8F0);
  pointer-events: none;
}

/* ---- Loading ---- */
.bos-btn--loading {
  cursor: wait;
  pointer-events: none;
  opacity: 0.75;
}

.bos-btn__spinner {
  display: inline-block;
  width: 1em;
  height: 1em;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: bos-btn-spin 0.6s linear infinite;
  flex-shrink: 0;
}

@keyframes bos-btn-spin {
  to { transform: rotate(360deg); }
}

/* ---- Icon slot ---- */
.bos-btn__icon {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  font-size: 1.15em;
  line-height: 1;
}
`;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  type?: "button" | "submit";
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children?: ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  type = "button",
  leftIcon,
  rightIcon,
  title,
  children,
  className = "",
  onClick,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const classNames = [
    "bos-btn",
    `bos-btn--${variant}`,
    `bos-btn--${size}`,
    loading && "bos-btn--loading",
    isDisabled && "bos-btn--disabled",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <style>{styles}</style>
      <button
        className={classNames}
        type={type}
        disabled={isDisabled}
        title={title}
        onClick={onClick}
        aria-busy={loading || undefined}
        {...rest}
      >
        {loading && <span className="bos-btn__spinner" aria-hidden="true" />}
        {leftIcon && !loading && (
          <span className="bos-btn__icon" aria-hidden="true">
            {leftIcon}
          </span>
        )}
        {children}
        {rightIcon && (
          <span className="bos-btn__icon" aria-hidden="true">
            {rightIcon}
          </span>
        )}
      </button>
    </>
  );
}

export default Button;
