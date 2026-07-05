export type BreadcrumbItem = {
  label: string;
  onClick?: () => void;
};

type BreadcrumbProps = {
  items: BreadcrumbItem[];
};

export default function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="bos-breadcrumb-nav" aria-label="面包屑导航">
      {items.map((item, index) => (
        <span key={`${item.label}_${index}`} className="bos-breadcrumb-nav__item">
          {item.onClick ? (
            <button className="bos-breadcrumb-nav__link" onClick={item.onClick}>
              {item.label}
            </button>
          ) : (
            <span className="bos-breadcrumb-nav__current">{item.label}</span>
          )}
          {index < items.length - 1 && <span className="bos-breadcrumb-nav__sep">/</span>}
        </span>
      ))}
    </nav>
  );
}
