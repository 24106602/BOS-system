import type { ReactNode } from "react";

type ToolbarProps = {
  children: ReactNode;
  className?: string;
};

export default function Toolbar({ children, className = "" }: ToolbarProps) {
  return <div className={`bos-action-toolbar${className ? ` ${className}` : ""}`}>{children}</div>;
}
