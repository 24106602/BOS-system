import { useEffect, type ReactNode } from "react";

export type DetailGroup = {
  title: string;
  items: { label: string; value: string }[];
};

type DetailModalProps = {
  visible: boolean;
  title: string;
  groups?: DetailGroup[];
  items?: { label: string; value: string }[];
  onClose: () => void;
  width?: string;
  extra?: ReactNode;
};

export default function DetailModal({ visible, title, groups, items, onClose, width, extra }: DetailModalProps) {
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div className="bos-modal-backdrop" onClick={onClose}>
      <section
        className="bos-modal"
        style={width ? { width } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bos-modal-header">
          <h2>{title}</h2>
          <button onClick={onClose}>关闭</button>
        </div>
        <div className="bos-modal-body">
          {extra}
          {groups ? (
            <div className="bos-detail-groups">
              {groups.map((group) => (
                <div key={group.title} className="bos-detail-group">
                  <h3 className="bos-detail-group__title">{group.title}</h3>
                  <div className="bos-detail-group__grid">
                    {group.items.map((item) => (
                      <div key={item.label} className="bos-detail-item">
                        <span>{item.label}</span>
                        <strong>{item.value || "-"}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : items ? (
            <div className="bos-detail-group__grid">
              {items.map((item) => (
                <div key={item.label} className="bos-detail-item">
                  <span>{item.label}</span>
                  <strong>{item.value || "-"}</strong>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
