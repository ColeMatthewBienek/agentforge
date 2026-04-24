import { type ReactNode } from "react";

export function SectionHeader({ title, count, action }: {
  title: string;
  count?: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-5 py-4 border-b border-[#21262d] flex items-center justify-between flex-shrink-0">
      <div>
        <div className="text-[14px] font-semibold text-foreground">{title}</div>
        {count && <div className="text-[11px] text-[#484f58] mt-0.5">{count}</div>}
      </div>
      {action}
    </div>
  );
}
