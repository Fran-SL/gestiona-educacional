import type { ReactNode } from "react";
const tones = {
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  info: "bg-blue-50 text-blue-800 ring-blue-200",
  warning: "bg-amber-50 text-amber-900 ring-amber-200",
  danger: "bg-red-50 text-red-800 ring-red-200",
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
};
export default function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof tones }) {
  return <span className={`inline-flex max-w-full items-center rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}
