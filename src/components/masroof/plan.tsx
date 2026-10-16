import { todayIso } from "@/masroof/dates";
import { accountBalance, budgetView, safeToSpend } from "@/masroof/engine";
import { categoryLabel, useMasroof } from "@/masroof/store";
import type { Nav } from "@/components/masroof/nav";
import { EmptyState, MoneyText, ProgressBar, useI18n } from "@/components/masroof/ui";

export function Plan({ nav }: { nav: Nav }) {
  const { t, tf, money } = useI18n();
  const data = useMasroof((s) => s.data);
  const today = todayIso();
  const safe = safeToSpend(data, today);
  const budgets = data.budgets.filter((b) => !b.deletedAt);
  const goals = data.goals.filter((g) => !g.deletedAt);
  const rules = data.rules.filter((r) => !r.deletedAt);
  const denied = typeof Notification !== "undefined" && Notification.permission === "denied";
  return (
    <div className="flex flex-1 flex-col px-4 pt-5 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl">{t("plan")}</h1>
        <button type="button" className="text-sm" onClick={() => nav.push({ id: "inbox" })}>{t("inbox")}</button>
      </div>
      {denied ? <p className="mt-3 rounded-2xl bg-warn-soft px-4 py-3 text-sm">{t("notifOff")}</p> : (
        <button type="button" className="mt-3 text-start text-sm text-muted" onClick={() => void Notification.requestPermission()}>{t("allowNotif")}</button>
      )}
      <div className="mt-4 rounded-2xl bg-surface px-4 py-4">
        <p className="text-sm text-muted">{t("safeToday")}</p>
        {safe ? (
          <>
            <p className="font-display text-4xl"><MoneyText minor={safe.minor} currency={safe.currency} kind={safe.minor < 0 ? "expense" : "plain"} /></p>
            <p className="text-sm text-muted">{tf("daysLeft", { n: safe.days })}</p>
          </>
        ) : <p className="mt-1 text-sm text-muted">{t("noSafe")}</p>}
      </div>
      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg">{t("budgets")}</h2>
          <button type="button" className="h-10 rounded-full bg-accent px-4 text-sm text-accent-fg" onClick={() => nav.push({ id: "budget" })}>{t("add")}</button>
        </div>
        {budgets.length === 0 ? <EmptyState title={t("noBudget")} body={t("emptyBudget")} /> : budgets.map((budget) => {
          const view = budgetView(data, budget, today);
          const cat = data.categories.find((c) => c.id === budget.categoryId);
          const tone = view.ratio >= 1 ? "over" : view.ratio >= 0.8 ? "warn" : "ok";
          return (
            <button key={budget.id} type="button" className="mb-3 w-full rounded-2xl border border-line px-4 py-3 text-start" onClick={() => nav.push({ id: "budget", budgetId: budget.id })}>
              <div className="mb-2 flex justify-between gap-3">
                <span>{budget.categoryId ? categoryLabel(cat, t) : t("overall")}</span>
                <span className="nums text-sm">{money(view.spent, budget.currency, false)} / {money(view.limit, budget.currency)}</span>
              </div>
              <ProgressBar ratio={view.ratio} tone={tone} />
            </button>
          );
        })}
      </section>
      <section className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg">{t("goals")}</h2>
          <button type="button" className="h-10 rounded-full border border-line px-4 text-sm" onClick={() => nav.push({ id: "goal" })}>{t("add")}</button>
        </div>
        <p className="mb-2 text-sm text-muted">{t("goalNote")}</p>
        {goals.length === 0 ? <EmptyState title={t("goal")} body={t("emptyGoals")} /> : goals.map((goal) => {
          const account = data.accounts.find((a) => a.id === goal.linkedAccountId);
          const have = account ? accountBalance(data, account) : 0;
          const ratio = goal.targetMinor <= 0 ? 0 : have / goal.targetMinor;
          return (
            <button key={goal.id} type="button" className="mb-3 w-full rounded-2xl border border-line px-4 py-3 text-start" onClick={() => nav.push({ id: "goal", goalId: goal.id })}>
              <div className="mb-2 flex justify-between"><span>{goal.name}</span><span className="text-sm text-muted">{Math.max(0, Math.round(ratio * 100))}%</span></div>
              <ProgressBar ratio={ratio} tone="ok" />
            </button>
          );
        })}
      </section>
      <section className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg">{t("rules")}</h2>
          <button type="button" className="h-10 rounded-full border border-line px-4 text-sm" onClick={() => nav.push({ id: "rule" })}>{t("add")}</button>
        </div>
        {rules.length === 0 ? <EmptyState title={t("rules")} body={t("emptyRules")} /> : (
          <ul className="divide-y divide-line">
            {rules.map((rule) => (
              <li key={rule.id}>
                <button type="button" className="flex w-full items-center justify-between py-3 text-start" onClick={() => nav.push({ id: "rule", ruleId: rule.id })}>
                  <span>
                    <span className="block">{rule.template.payee || rule.template.note || t("rules")}</span>
                    <span className="text-sm text-muted">{t(rule.mode === "auto_post" ? "modeAuto" : rule.mode === "remind_only" ? "modeRemind" : "modeConfirm")}</span>
                  </span>
                  <MoneyText minor={rule.template.amountMinor} currency={rule.template.currency} kind={rule.template.type === "income" ? "income" : "expense"} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-muted">{t("ruleEnd")}</p>
      </section>
    </div>
  );
}
