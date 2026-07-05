import type { ReactNode } from "react";
import Breadcrumb, { type BreadcrumbItem } from "./Breadcrumb";

type PageContainerProps = {
  title: string;
  description?: string;
  breadcrumb?: BreadcrumbItem[];
  actions?: ReactNode;
  children: ReactNode;
};

export default function PageContainer({ title, description, breadcrumb, actions, children }: PageContainerProps) {
  return (
    <section className="bos-table-page">
      <header className="bos-page-header">
        <div className="bos-page-header__copy">
          {breadcrumb && <Breadcrumb items={breadcrumb} />}
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="bos-page-header__actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}
