import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Info, LoaderCircle, X, type LucideIcon } from "lucide-react";
import { haptic } from "../lib/telegram";
import { statusTone, titleCase } from "../lib/format";

/* ── Button ─────────────────────────────────────────────────────────── */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  full?: boolean;
  loading?: boolean;
};
export function Button({ variant = "primary", size = "md", full, loading, className = "", children, disabled, onClick, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      onClick={(e) => { haptic.tap(); onClick?.(e); }}
      className={`btn btn-${variant} btn-${size} ${full ? "w-full" : ""} ${className}`}
    >
      {loading ? <LoaderCircle size={18} className="animate-spin" /> : children}
    </button>
  );
}

/* ── Status pill ────────────────────────────────────────────────────── */
export function StatusPill({ status }: { status: string }) {
  return <span className="pill" data-tone={statusTone(status)}>{titleCase(String(status || "pending"))}</span>;
}

/* ── Icon tile (round, Coinbase-style) ──────────────────────────────── */
export function IconTile({ icon: Icon, size = 44, className = "" }: { icon: LucideIcon; size?: number; className?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-fill text-ink ${className}`} style={{ width: size, height: size }}>
      <Icon size={size * 0.46} strokeWidth={1.9} />
    </span>
  );
}

/* ── Section header ─────────────────────────────────────────────────── */
export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[19px] font-bold tracking-tight">{title}</h2>
      {action}
    </div>
  );
}

/* ── Notice ─────────────────────────────────────────────────────────── */
export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  return (
    <div className={`my-4 flex gap-3 rounded-2xl p-3.5 text-[13px] leading-relaxed ${tone === "warn" ? "bg-warn/10" : "bg-brand-soft"}`}>
      <Info size={18} className={`mt-px shrink-0 ${tone === "warn" ? "text-warn" : "text-brand"}`} />
      <span>{children}</span>
    </div>
  );
}

/* ── Empty state ────────────────────────────────────────────────────── */
export function Empty({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <IconTile icon={Icon} size={56} className="mb-4 text-muted" />
      <p className="font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-xs text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-4">
          <Skeleton className="!rounded-full h-11 w-11" />
          <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-3 w-1/3" /></div>
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

/* ── Segmented control ──────────────────────────────────────────────── */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex rounded-full bg-fill p-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => { haptic.select(); onChange(o.value); }}
          className={`flex-1 rounded-full px-3 py-2 text-[13px] font-semibold transition ${value === o.value ? "bg-bg text-ink shadow-sm" : "text-muted"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Bottom sheet ───────────────────────────────────────────────────── */
export function Sheet({ onClose, children, locked }: { onClose: () => void; children: ReactNode; locked?: boolean }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !locked) onClose(); };
    window.addEventListener("keydown", key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", key); document.body.style.overflow = prev; };
  }, [onClose, locked]);

  return (
    <div
      className="animate-fade fixed inset-0 z-40 flex items-end justify-center bg-black/55 backdrop-blur-[2px] sm:items-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !locked) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        className="animate-sheet max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-bg px-5 pb-[calc(24px+var(--safe-bottom))] sm:rounded-[28px]"
      >
        <div className="sticky top-0 z-10 -mx-5 mb-2 flex items-center justify-between bg-bg px-5 pb-1 pt-3">
          <span className="mx-auto h-1 w-10 rounded-full bg-line sm:hidden" />
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-3 grid h-9 w-9 place-items-center rounded-full bg-fill text-muted transition hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

/* ── Toast ──────────────────────────────────────────────────────────── */
const ToastCtx = createContext<(msg: string, tone?: "ok" | "error") => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "error" } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const notify = useCallback((msg: string, tone: "ok" | "error" = "ok") => {
    window.clearTimeout(timer.current);
    setToast({ msg, tone });
    if (tone === "error") haptic.error(); else haptic.success();
    timer.current = window.setTimeout(() => setToast(null), 3000);
  }, []);
  return (
    <ToastCtx.Provider value={notify}>
      {children}
      {toast && (
        <div role="status" className="animate-rise pointer-events-none fixed inset-x-0 bottom-[calc(96px+var(--safe-bottom))] z-50 flex justify-center px-4">
          <div className={`max-w-sm rounded-2xl px-4 py-3 text-sm font-medium shadow-xl ${toast.tone === "error" ? "bg-down text-white" : "bg-ink text-bg"}`}>
            {toast.msg}
          </div>
        </div>
      )}
    </ToastCtx.Provider>
  );
}
