import type { ReactNode } from "react";

export type FilterField = {
  key: string;
  label: string;
  type?: "input" | "select";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  options?: { label: string; value: string }[];
};

type FilterBarProps = {
  fields: FilterField[];
  onSearch?: () => void;
  onReset?: () => void;
  extra?: ReactNode;
};

export default function FilterBar({ fields, onSearch, onReset, extra }: FilterBarProps) {
  return (
    <section className="bos-filter-card">
      <div className="bos-filter-grid">
        {fields.map((field) => (
          <label key={field.key} className="bos-filter-field">
            {field.label}
            {field.type === "select" ? (
              <select
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                readOnly={field.readOnly}
              >
                {field.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                placeholder={field.placeholder}
                readOnly={field.readOnly}
              />
            )}
          </label>
        ))}
        {onSearch && (
          <button className="is-primary" onClick={onSearch}>
            查询
          </button>
        )}
        {onReset && <button onClick={onReset}>重置</button>}
        {extra}
      </div>
    </section>
  );
}
