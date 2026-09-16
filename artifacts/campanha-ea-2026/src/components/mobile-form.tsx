import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return <p id={id} className="mt-1.5 text-[11px] font-bold text-destructive" role="alert">{message}</p>;
}

export function StickyFormActions({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 z-20 -mx-6 mt-6 border-t border-border bg-card/95 px-6 pb-[env(safe-area-inset-bottom)] pt-4 backdrop-blur-sm">{children}</div>;
}

export function HorizontalScrollHint({ children, label = "Deslize para ver mais", className = "" }: { children: ReactNode; label?: string; className?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const update = () => setHasOverflow(element.scrollWidth > element.clientWidth + 2);
    update();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(element);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return <div className="relative">
    <div ref={scrollRef} className={`overflow-x-auto ${className}`}>{children}</div>
    {hasOverflow && <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-full border border-border bg-card/95 px-2.5 py-1 text-[10px] font-extrabold text-muted-foreground shadow-sm sm:hidden"><span>{label}</span><ChevronRight size={12} /></div>}
  </div>;
}