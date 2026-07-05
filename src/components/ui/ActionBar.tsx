import type { ReactNode } from "react";

type ActionBarProps = {
  children: ReactNode;
  className?: string;
};

export default function ActionBar({ children, className = "" }: ActionBarProps) {
  return <div className={`bos-action-toolbar${className ? ` ${className}` : ""}`}>{children}</div>;
}
