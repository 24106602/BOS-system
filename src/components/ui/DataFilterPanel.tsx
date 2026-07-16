/**
 * 数据过滤面板组件
 * 统一封装数据筛选条件，支持学年、学院、姓名、学号、身份证号等常用筛选字段
 */
import { useMemo, type CSSProperties } from "react";
import { collegeAccounts } from "../../utils/collegeDetector";

type FilterField = {
  key: string;
  label: string;
  type: "text" | "select" | "year";
  placeholder?: string;
  options?: string[];
  width?: number;
};

type DataFilterPanelProps = {
  filters: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onReset?: () => void;
  fields?: FilterField[];
  showAcademicYear?: boolean;
  showCollege?: boolean;
  showSearch?: boolean;
  searchPlaceholder?: string;
  customFields?: FilterField[];
  style?: CSSProperties;
};

const defaultYearOptions = () => {
  const currentYear = new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  const currentAcademicYear = month >= 9 ? `${currentYear}-${currentYear + 1}` : `${currentYear - 1}-${currentYear}`;
  const years = [currentAcademicYear];
  for (let i = 1; i <= 4; i++) {
    const prevYear = currentYear - i;
    years.push(`${prevYear}-${prevYear + 1}`);
  }
  return years;
};

const collegeOptions = collegeAccounts.map((c) => c.account_name);

const defaultFields: FilterField[] = [
  { key: "academicYear", label: "学年", type: "year", placeholder: "选择学年", width: 140 },
  { key: "college", label: "学院", type: "select", placeholder: "选择学院", options: collegeOptions, width: 160 },
  { key: "name", label: "姓名", type: "text", placeholder: "输入姓名", width: 120 },
  { key: "studentId", label: "学号", type: "text", placeholder: "输入学号", width: 120 },
  { key: "idCard", label: "身份证号", type: "text", placeholder: "输入身份证号", width: 160 },
  { key: "major", label: "专业", type: "text", placeholder: "输入专业", width: 140 },
  { key: "className", label: "班级", type: "text", placeholder: "输入班级", width: 120 },
  { key: "grade", label: "年级", type: "text", placeholder: "输入年级", width: 100 },
];

export default function DataFilterPanel({
  filters,
  onChange,
  onReset,
  fields,
  showAcademicYear = true,
  showCollege = true,
  showSearch = true,
  searchPlaceholder = "搜索姓名/学号/身份证号",
  customFields,
  style,
}: DataFilterPanelProps) {
  const yearOptions = useMemo(() => defaultYearOptions(), []);

  // 根据 props 动态生成需要显示的字段
  const displayFields = useMemo(() => {
    if (fields) return fields;
    
    const result: FilterField[] = [];
    
    if (showAcademicYear) {
      result.push({ key: "academicYear", label: "学年", type: "year", placeholder: "选择学年", width: 140 });
    }
    
    if (showCollege) {
      result.push({ key: "college", label: "学院", type: "select", placeholder: "选择学院", options: collegeOptions, width: 160 });
    }
    
    if (showSearch) {
      result.push({ key: "keyword", label: "搜索", type: "text", placeholder: searchPlaceholder, width: 200 });
    }
    
    if (customFields) {
      result.push(...customFields);
    }
    
    return result;
  }, [fields, showAcademicYear, showCollege, showSearch, searchPlaceholder, customFields]);

  const handleReset = () => {
    if (onReset) onReset();
    displayFields.forEach((field) => onChange(field.key, ""));
  };

  return (
    <div className="bos-filter-panel" style={{ ...styles.panel, ...style }}>
      <div style={styles.container}>
        <div style={styles.grid}>
          {displayFields.map((field) => (
            <label key={field.key} style={{ ...styles.field, width: field.width || 140 }}>
              <span style={styles.label}>{field.label}</span>
              {field.type === "text" ? (
                <input
                  type="text"
                  style={styles.input}
                  placeholder={field.placeholder || ""}
                  value={filters[field.key] || ""}
                  onChange={(e) => onChange(field.key, e.target.value)}
                />
              ) : field.type === "year" ? (
                <select
                  style={styles.select}
                  value={filters[field.key] || ""}
                  onChange={(e) => onChange(field.key, e.target.value)}
                >
                  <option value="">{field.placeholder || "全部学年"}</option>
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              ) : field.type === "select" && field.options ? (
                <select
                  style={styles.select}
                  value={filters[field.key] || ""}
                  onChange={(e) => onChange(field.key, e.target.value)}
                >
                  <option value="">{field.placeholder || "全部"}</option>
                  {field.options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : null}
            </label>
          ))}
        </div>
        {onReset && (
          <div style={styles.actions}>
            <button className="bos-button is-secondary" onClick={handleReset} style={styles.resetButton}>
              重置筛选
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: {
    background: "#fff",
    borderRadius: 8,
    padding: "16px 20px",
    marginBottom: 16,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  },
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  grid: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "flex-end",
    flex: 1,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  label: {
    fontSize: 13,
    color: "#5a6a7a",
    fontWeight: 500,
  },
  input: {
    height: 32,
    padding: "0 10px",
    fontSize: 14,
    border: "1px solid #d4d8e0",
    borderRadius: 6,
    outline: "none",
    background: "#f8fafc",
    transition: "border-color 0.2s, background 0.2s",
  },
  select: {
    height: 32,
    padding: "0 10px",
    fontSize: 14,
    border: "1px solid #d4d8e0",
    borderRadius: 6,
    outline: "none",
    background: "#f8fafc",
    cursor: "pointer",
    transition: "border-color 0.2s, background 0.2s",
  },
  actions: {
    marginLeft: 16,
    flexShrink: 0,
  },
  resetButton: {
    padding: "6px 16px",
    fontSize: 13,
  },
};