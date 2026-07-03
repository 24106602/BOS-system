import type { ReactNode } from "react";

type AdminCardProps = {
  title?: string;
  description?: string;
  extra?: ReactNode;
  className?: string;
  children: ReactNode;
};

export default function AdminCard({ title, description, extra, className = "", children }: AdminCardProps) {
  const hasHeader = Boolean(title || description || extra);

  return (
    <section className={`bos-admin-card${className ? ` ${className}` : ""}`}>
      {hasHeader && (
        <header className="bos-admin-card__header">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {extra && <div className="bos-admin-card__extra">{extra}</div>}
        </header>
      )}
      <div className="bos-admin-card__body">{children}</div>
    </section>
  );
}
