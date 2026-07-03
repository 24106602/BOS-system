import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  breadcrumb?: string;
  actions?: ReactNode;
};

export default function PageHeader({ title, description, breadcrumb, actions }: PageHeaderProps) {
  return (
    <header className="bos-page-header">
      <div className="bos-page-header__copy">
        {breadcrumb && <div className="bos-breadcrumb">{breadcrumb}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="bos-page-header__actions">{actions}</div>}
    </header>
  );
}
