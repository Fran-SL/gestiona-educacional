"use client";
import Link from "next/link";

export default function PlanNavigation({ planId, active, onNavigate }: {
  planId: string;
  active: "structure" | "tracking" | "dashboard";
  onNavigate?: (href: string) => void;
}) {
  const items = [
    { key: "dashboard", label: "Dashboard", href: `/planes/${planId}/dashboard` },
    { key: "structure", label: "Estructura", href: `/planes/${planId}` },
    { key: "tracking", label: "Estado de avance", href: `/planes/${planId}/seguimiento` },
  ];
  return <nav aria-label="Secciones del plan" className="mb-6 flex flex-wrap gap-2 border-b border-slate-300 pb-4">
    {items.map(item => <Link key={item.key} href={item.href}
      aria-current={active === item.key ? "page" : undefined}
      className={active === item.key ? "button-primary" : "button-secondary"}
      onNavigate={event => {
        if (active === item.key) event.preventDefault();
        else if (onNavigate) { event.preventDefault(); onNavigate(item.href); }
      }}>{item.label}</Link>)}
  </nav>;
}
