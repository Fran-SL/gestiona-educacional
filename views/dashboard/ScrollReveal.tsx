"use client";
import { useEffect, useRef, type ReactNode } from "react";

export default function ScrollReveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current!;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches || !("IntersectionObserver" in window)) return;
    const targets = root.querySelectorAll("section, article");
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.remove("reveal-pending");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0, rootMargin: "0px 0px -24px 0px" });
    targets.forEach(target => {
      // Content is visible with SSR, without JS, and when already on screen.
      if (target.getBoundingClientRect().top >= window.innerHeight) {
        target.classList.add("reveal-pending");
        observer.observe(target);
      }
    });
    const revealAll = () => { targets.forEach(t => t.classList.remove("reveal-pending")); observer.disconnect(); };
    motion.addEventListener("change", revealAll);
    return () => { revealAll(); motion.removeEventListener("change", revealAll); };
  }, []);
  return <div ref={ref} className="dashboard-reveal">{children}</div>;
}
