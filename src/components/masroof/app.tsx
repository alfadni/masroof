import { useEffect, useLayoutEffect, useState } from "react";
import { formatLockout } from "@/masroof/money";
import { useMasroof } from "@/masroof/store";
import { AddSheet } from "@/components/masroof/add-sheet";
import { Activity } from "@/components/masroof/activity";
import { Home } from "@/components/masroof/home";
import { AppIcon, Mark } from "@/components/masroof/icons";
import type { Nav, View } from "@/components/masroof/nav";
import { Onboarding } from "@/components/masroof/onboarding";
import { Plan } from "@/components/masroof/plan";
import {
  AccountEditor,
  AccountsScreen,
  BackupScreen,
  BudgetEditor,
  CalculatorScreen,
  CategoriesScreen,
  GoalEditor,
  ImportScreen,
  InboxScreen,
  More,
  PrivacyScreen,
  ProblemScreen,
  RatesScreen,
  ReportsScreen,
  ResetScreen,
  RevalueScreen,
  RuleEditor,
  SettingsScreen,
  TrashScreen,
  TxScreen,
} from "@/components/masroof/screens";
import { fill, translate } from "@/masroof/i18n";
import { cn, useI18n } from "@/components/masroof/ui";

export function MasroofApp() {
  const boot = useMasroof((s) => s.boot);
  const ready = useMasroof((s) => s.ready);
  const unlocked = useMasroof((s) => s.unlocked);
  const problem = useMasroof((s) => s.problem);
  const onboarded = useMasroof((s) => s.data.settings.onboarded);
  const locale = useMasroof((s) => s.data.settings.locale);
  const theme = useMasroof((s) => s.data.settings.theme);
  const hasPin = useMasroof((s) => s.data.settings.hasPin);

  useLayoutEffect(() => {
    void boot();
  }, [boot]);

  useLayoutEffect(() => {
    document.documentElement.lang = locale === "ar" ? "ar" : "en";
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.dataset.theme = theme;
  }, [locale, theme]);

  if (!ready) return <Splash locale={locale} />;
  if (problem) return <ProblemScreen kind={problem} />;
  if (!unlocked && hasPin) return <LockScreen />;
  if (!onboarded) return <Onboarding />;
  return <Shell />;
}

function Splash({ locale }: { locale: "en" | "ar" }) {
  const t = (key: "tagline" | "loading" | "kicker") => translate(locale, key);
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <Mark className="mx-auto size-12 text-accent" />
        <p className="mt-4 text-xs tracking-widest text-muted uppercase">{t("kicker")}</p>
        <h1 className="mt-2 font-display text-4xl">{t("tagline")}</h1>
        <p className="mt-3 text-sm text-muted">{t("loading")}</p>
      </div>
    </main>
  );
}

function LockScreen() {
  const { t, tf } = useI18n();
  const unlock = useMasroof((s) => s.unlockPin);
  const unlockBio = useMasroof((s) => s.unlockBio);
  const hasBio = useMasroof((s) => s.hasBio);
  const lockout = useMasroof((s) => s.lockout);
  const reset = useMasroof((s) => s.resetAll);
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [confirmReset, setConfirmReset] = useState("");
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);
  const wait = lockout.until && lockout.until > now ? lockout.until - now : 0;
  const press = (key: string) => {
    if (wait > 0) return;
    if (key === "b") return setPin((v) => v.slice(0, -1));
    if (pin.length >= 6) return;
    const next = `${pin}${key}`;
    setPin(next);
    if (next.length >= 4) {
      void unlock(next).then((result) => {
        if (result === "ok") return;
        setPin("");
        setMsg(result === "cooldown" ? tf("cooldown", { time: formatLockout(lockout.until ? lockout.until - Date.now() : 0) }) : t("pinWrong"));
      });
    }
  };
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center px-6 py-10">
      <Mark className="size-12 text-accent" />
      <h1 className="mt-4 font-display text-4xl">{t("lockedTitle")}</h1>
      <p className="mt-2 text-sm text-muted">{t("enterToUnlock")}</p>
      <p className="nums mt-6 text-2xl tracking-widest">{pin.replace(/./g, "•") || " "}</p>
      {wait > 0 ? <p className="mt-2 text-sm text-warn" role="alert">{tf("cooldown", { time: formatLockout(wait) })}</p> : null}
      {msg && wait <= 0 ? <p className="mt-2 text-sm text-expense" role="alert">{msg}</p> : null}
      <p className="mt-1 text-sm text-muted">{t("neverWipes")}</p>
      <div dir="ltr" className="mt-6 grid w-full max-w-xs grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "b", "0"].map((key) => (
          <button key={key} type="button" className="h-14 rounded-2xl bg-surface text-xl" onClick={() => press(key)} aria-label={key === "b" ? t("backspace") : key}>
            {key === "b" ? "⌫" : key}
          </button>
        ))}
      </div>
      {hasBio ? (
        <button type="button" className="mt-4 h-11" onClick={async () => {
          const ok = await unlockBio();
          if (!ok) setMsg(t("bioFail"));
        }}>{t("useBio")}</button>
      ) : null}
      <div className="mt-8 w-full max-w-xs">
        <p className="text-sm text-muted">{hasBio ? t("forgotWithBio") : t("forgotNoBio")}</p>
        {!hasBio ? (
          <div className="mt-2 grid gap-2">
            <input className="h-11 rounded-xl border border-line bg-elevated px-3" value={confirmReset} onChange={(e) => setConfirmReset(e.target.value)} aria-label={t("typed")} placeholder="RESET" />
            <button type="button" className="h-11 rounded-full text-expense" disabled={confirmReset !== "RESET"} onClick={() => void reset()}>{t("resetDevice")}</button>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function Shell() {
  const { t } = useI18n();
  const [stack, setStack] = useState<View[]>([{ id: "home" }]);
  const openAddStore = useMasroof((s) => s.openAdd);
  const addIntent = useMasroof((s) => s.addIntent);
  const notice = useMasroof((s) => s.notice);
  const dismiss = useMasroof((s) => s.dismissNotice);
  const undo = useMasroof((s) => s.undo);
  const lock = useMasroof((s) => s.lock);
  const timeout = useMasroof((s) => s.data.settings.lockTimeoutSec);
  const hasPin = useMasroof((s) => s.data.settings.hasPin);
  const unlocked = useMasroof((s) => s.unlocked);
  const view = stack[stack.length - 1] ?? { id: "home" };
  const nav: Nav = {
    view,
    push: (next) => setStack((s) => [...s, next]),
    pop: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
    tab: (id) => setStack([{ id }]),
    openAdd: (type, editingId, series) => openAddStore({ type: type ?? "expense", editingId: editingId ?? null, series: series ?? null }),
  };

  useEffect(() => {
    if (!notice?.undo) return;
    const id = window.setTimeout(() => dismiss(), 5000);
    return () => window.clearTimeout(id);
  }, [notice, dismiss]);

  useEffect(() => {
    if (!hasPin || !unlocked || timeout <= 0) return;
    let timer = 0;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        document.documentElement.classList.add("is-covered");
        timer = window.setTimeout(() => {
          void lock();
        }, timeout * 1000);
      } else {
        document.documentElement.classList.remove("is-covered");
        window.clearTimeout(timer);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      document.documentElement.classList.remove("is-covered");
      window.clearTimeout(timer);
    };
  }, [hasPin, unlocked, timeout, lock]);

  useEffect(() => {
    const fresh = useMasroof.getState().data.inbox.filter((item) => !item.notified && !item.read);
    if (fresh.length === 0 || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    for (const item of fresh.slice(0, 3)) {
      const title = translate(useMasroof.getState().data.settings.locale, item.kind === "budget" ? "budgetHealth" : "inbox");
      try {
        new Notification(title);
      } catch {
        /* ignore */
      }
    }
  }, [notice, view.id]);

  return (
    <div id="masroof-root" className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-line px-5 py-8 lg:flex">
          <div className="flex items-center gap-3">
            <Mark className="size-9 text-accent" />
            <div>
              <p className="text-xs tracking-widest text-muted uppercase">{t("kicker")}</p>
              <p className="font-display text-2xl">{t("appName")}</p>
            </div>
          </div>
          <nav className="mt-8 grid gap-1" aria-label={t("navLabel")}>
            <SideLink on={view.id === "home"} label={t("home")} icon="CalendarDays" onClick={() => nav.tab("home")} />
            <SideLink on={view.id === "activity"} label={t("activity")} icon="List" onClick={() => nav.tab("activity")} />
            <SideLink on={view.id === "plan"} label={t("plan")} icon="Target" onClick={() => nav.tab("plan")} />
            <SideLink on={view.id === "more" || !["home", "activity", "plan"].includes(view.id)} label={t("more")} icon="Menu" onClick={() => nav.tab("more")} />
          </nav>
          <button type="button" className="mt-6 h-12 rounded-full bg-accent text-accent-fg" onClick={() => nav.openAdd()}>{t("fab")}</button>
        </aside>
        <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
          <div className="mx-auto flex w-full max-w-lg flex-1 flex-col pb-24 lg:pb-8">
            <ScreenBody nav={nav} view={view} />
          </div>
          <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/95 backdrop-blur lg:hidden" aria-label={t("navLabel")}>
            <div className="mx-auto grid max-w-lg grid-cols-5">
              <Tab icon="CalendarDays" label={t("home")} on={view.id === "home"} onClick={() => nav.tab("home")} />
              <Tab icon="List" label={t("activity")} on={view.id === "activity"} onClick={() => nav.tab("activity")} />
              <div className="grid place-items-center">
                <button type="button" className="grid size-14 -translate-y-3 place-items-center rounded-full bg-accent text-accent-fg" onClick={() => nav.openAdd()} aria-label={t("fab")}>
                  <AppIcon name="Plus" />
                </button>
              </div>
              <Tab icon="Target" label={t("plan")} on={view.id === "plan"} onClick={() => nav.tab("plan")} />
              <Tab icon="Menu" label={t("more")} on={view.id === "more"} onClick={() => nav.tab("more")} />
            </div>
          </nav>
        </div>
      </div>
      {addIntent ? <AddSheet /> : null}
      {notice ? (
        <div className="fixed inset-x-0 bottom-24 z-40 mx-auto flex w-[min(100%-1.5rem,28rem)] items-center justify-between gap-3 rounded-2xl bg-accent px-4 py-3 text-accent-fg lg:bottom-6" role="status">
          <span className="text-sm">{fill(translate(useMasroof.getState().data.settings.locale, notice.key), notice.vars ?? {})}</span>
          {notice.undo ? (
            <button type="button" className="h-10 rounded-full bg-bg px-3 text-sm text-fg" onClick={() => void undo()}>{t("undo")}</button>
          ) : (
            <button type="button" className="h-10 px-2 text-sm" onClick={dismiss} aria-label={t("closeNotice")}>{t("close")}</button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ScreenBody({ nav, view }: { nav: Nav; view: View }) {
  if (view.id === "home") return <Home nav={nav} />;
  if (view.id === "activity") return <Activity nav={nav} />;
  if (view.id === "plan") return <Plan nav={nav} />;
  if (view.id === "more") return <More nav={nav} />;
  if (view.id === "inbox") return <InboxScreen nav={nav} />;
  if (view.id === "reports") return <ReportsScreen nav={nav} />;
  if (view.id === "accounts") return <AccountsScreen nav={nav} />;
  if (view.id === "account") return <AccountEditor nav={nav} accountId={view.accountId} />;
  if (view.id === "categories") return <CategoriesScreen nav={nav} />;
  if (view.id === "rates") return <RatesScreen nav={nav} />;
  if (view.id === "revalue") return <RevalueScreen nav={nav} />;
  if (view.id === "backup") return <BackupScreen nav={nav} />;
  if (view.id === "import") return <ImportScreen nav={nav} />;
  if (view.id === "trash") return <TrashScreen nav={nav} />;
  if (view.id === "privacy") return <PrivacyScreen nav={nav} />;
  if (view.id === "settings") return <SettingsScreen nav={nav} />;
  if (view.id === "calculator") return <CalculatorScreen nav={nav} />;
  if (view.id === "reset") return <ResetScreen nav={nav} />;
  if (view.id === "tx") return <TxScreen nav={nav} id={view.txId} />;
  if (view.id === "budget") return <BudgetEditor nav={nav} budgetId={view.budgetId} />;
  if (view.id === "goal") return <GoalEditor nav={nav} goalId={view.goalId} />;
  if (view.id === "rule") return <RuleEditor nav={nav} ruleId={view.ruleId} />;
  return <Home nav={nav} />;
}

function Tab({ icon, label, on, onClick }: { icon: string; label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex h-16 flex-col items-center justify-center gap-0.5 text-xs", on ? "text-fg" : "text-muted")} aria-current={on ? "page" : undefined}>
      <AppIcon name={icon} className="size-5" />
      {label}
    </button>
  );
}

function SideLink({ icon, label, on, onClick }: { icon: string; label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex h-12 items-center gap-3 rounded-xl px-3 text-start", on ? "bg-surface text-fg" : "text-muted")}>
      <AppIcon name={icon} />
      {label}
    </button>
  );
}
