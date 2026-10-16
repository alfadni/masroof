import type { ReactNode } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { translate, fill, type Key } from "@/masroof/i18n";
import { formatMinor } from "@/masroof/money";
import { useMasroof } from "@/masroof/store";

export function cn(...values: ClassValue[]) {
  return twMerge(clsx(values));
}

export function useI18n() {
  const settings = useMasroof((s) => s.data.settings);
  const t = (key: Key) => translate(settings.locale, key);
  const tf = (key: Key, vars: Record<string, string | number>) => fill(t(key), vars);
  const money = (minor: number, currency?: string, withCode = true) =>
    formatMinor(minor, currency ?? settings.baseCurrency, settings, withCode);
  return { t, tf, money, locale: settings.locale, settings };
}

export function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}

export const fieldClass =
  "h-12 w-full rounded-xl border border-line bg-elevated px-3 text-base text-fg outline-none";

export function MoneyText({
  minor,
  currency,
  kind = "plain",
  className,
  withCode = true,
}: {
  minor: number;
  currency: string;
  kind?: "income" | "expense" | "transfer" | "plain";
  className?: string;
  withCode?: boolean;
}) {
  const { money } = useI18n();
  const text = money(minor, currency, withCode);
  const signed = kind === "income" ? `+ ${text}` : kind === "expense" ? `− ${text}` : kind === "transfer" ? `↔ ${text}` : text;
  const tone = kind === "income" ? "text-income" : kind === "expense" ? "text-expense" : "text-fg";
  return (
    <span className={cn("nums", tone, className)} aria-label={signed}>
      {signed}
    </span>
  );
}

export function Screen({
  title,
  onBack,
  action,
  children,
}: {
  title: string;
  onBack?: () => void;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { t, locale } = useI18n();
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 px-4 py-3">
        {onBack ? (
          <button type="button" className="grid size-11 place-items-center rounded-full text-fg" onClick={onBack} aria-label={t("back")}>
            <span aria-hidden className="text-xl">{locale === "ar" ? "→" : "←"}</span>
          </button>
        ) : (
          <span className="size-11" />
        )}
        <h1 className="min-w-0 flex-1 truncate text-center font-display text-2xl">{title}</h1>
        <div className="grid size-11 place-items-center">{action}</div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">{children}</div>
    </section>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="h-12 w-full rounded-full bg-accent px-4 text-base font-medium text-accent-fg disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function QuietButton({ children, onClick, type = "button" }: { children: React.ReactNode; onClick?: () => void; type?: "button" | "submit" }) {
  return (
    <button type={type} onClick={onClick} className="h-12 w-full rounded-full border border-line bg-surface px-4 text-base text-fg">
      {children}
    </button>
  );
}

export function RowButton({ label, hint, onClick, danger }: { label: string; hint?: string; onClick: () => void; danger?: boolean }) {
  const { locale } = useI18n();
  return (
    <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3 border-b border-line py-3 text-start">
      <span className="min-w-0 flex-1">
        <span className={cn("block text-base", danger && "text-expense")}>{label}</span>
        {hint ? <span className="block text-sm text-muted">{hint}</span> : null}
      </span>
      <span aria-hidden className="text-muted">{locale === "ar" ? "‹" : "›"}</span>
    </button>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center">
      <p className="font-display text-2xl">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Segmented({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="grid grid-cols-3 rounded-full border border-line bg-surface p-1">
      {options.map((option) => {
        const on = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(option.id)}
            className={cn("h-10 rounded-full text-sm", on ? "bg-accent text-accent-fg" : "text-muted")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function ProgressBar({ ratio, tone }: { ratio: number; tone: "ok" | "warn" | "over" }) {
  const width = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  const color = tone === "over" ? "bg-expense" : tone === "warn" ? "bg-warn" : "bg-income";
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
      <div className={cn("h-full rounded-full", color)} style={{ width: `${width}%` }} />
    </div>
  );
}
