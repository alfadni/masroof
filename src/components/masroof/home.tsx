import { useMemo, useState } from "react";
import { calendarCells, formatMonthTitle, formatPrettyDate, monthKey, todayIso, weekdayLabels } from "@/masroof/dates";
import { accountBalance, budgetView, categorySums, dayMarks, findRate, monthFlow, netWorth, safeToSpend } from "@/masroof/engine";
import { exponent } from "@/masroof/catalog";
import { convertMinor } from "@/masroof/money";
import { categoryLabel, useMasroof } from "@/masroof/store";
import { AppIcon } from "@/components/masroof/icons";
import { MoneyText, PrimaryButton, ProgressBar, Segmented, useI18n } from "@/components/masroof/ui";
import type { Nav } from "@/components/masroof/nav";

export function Home({ nav }: { nav: Nav }) {
  const { t, tf, money, locale, settings } = useI18n();
  const data = useMasroof((s) => s.data);
  const selected = useMasroof((s) => s.selectedDate);
  const selectDate = useMasroof((s) => s.selectDate);
  const nudge = useMasroof((s) => s.nudgeBackup);
  const today = todayIso();
  const [cursor, setCursor] = useState(() => today.slice(0, 7));
  const [tab, setTab] = useState<"income" | "expense" | "balance">("expense");
  const [year, month] = cursor.split("-").map(Number);
  const monthIndex = (month || 1) - 1;
  const cells = calendarCells(year || 2026, monthIndex, settings.firstDayOfWeek);
  const labels = weekdayLabels(settings.firstDayOfWeek, locale);
  const anchor = `${cursor}-01`;
  const flow = monthFlow(data, anchor);
  const worth = netWorth(data);
  const sums = categorySums(data, anchor, tab === "income" ? "income" : "expense");
  const total = sums.reduce((sum, row) => sum + row.baseMinor, 0);
  const safe = safeToSpend(data, today);
  const budgets = data.budgets.filter((b) => !b.deletedAt).map((b) => budgetView(data, b, today));
  const tight = [...budgets].sort((a, b) => b.ratio - a.ratio)[0];
  const dayTx = data.transactions.filter((tx) => !tx.deletedAt && tx.localDate === selected).slice(0, 4);
  const unread = data.inbox.filter((item) => !item.read).length;
  const confirms = data.inbox.filter((item) => item.kind === "confirm" && !item.read);
  const big = tab === "income" ? flow.income : tab === "expense" ? flow.expense : worth.minor;
  const bigKind = tab === "income" ? "income" : tab === "expense" ? "expense" : "plain";

  const accounts = useMemo(
    () =>
      data.accounts
        .filter((a) => !a.deletedAt && !a.isArchived && a.includeInTotals)
        .map((account) => {
          const balance = accountBalance(data, account);
          const rate = account.currency === settings.baseCurrency ? 100_000_000n : findRate(data.rates, account.currency, settings.baseCurrency);
          const base = rate == null ? null : account.currency === settings.baseCurrency ? balance : convertMinor(balance, exponent(account.currency), exponent(settings.baseCurrency), rate);
          return { account, balance, base };
        }),
    [data, settings.baseCurrency],
  );

  const shift = (dir: number) => {
    const d = new Date(year || 2026, monthIndex + dir, 1);
    setCursor(monthKey(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`));
  };

  return (
    <div className="flex flex-1 flex-col px-4 pt-5 pb-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs tracking-widest text-muted uppercase">{t("kicker")}</p>
          <h1 className="font-display text-3xl">{t("appName")}</h1>
        </div>
        <button type="button" className="relative grid size-11 place-items-center rounded-full border border-line" onClick={() => nav.push({ id: "inbox" })} aria-label={t("inbox")}>
          <AppIcon name="Bell" />
          {unread > 0 ? <span className="absolute end-2 top-2 size-2 rounded-full bg-expense" /> : null}
        </button>
      </div>

      {settings.hasPin && !settings.lastBackupAt && !settings.backupNudged ? (
        <div className="mt-4 rounded-2xl border border-line bg-warn-soft px-4 py-3 text-sm">
          <p>{t("nudge")}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="h-10 rounded-full bg-accent px-4 text-accent-fg" onClick={() => nav.push({ id: "backup" })}>{t("backup")}</button>
            <button type="button" className="h-10 px-3 text-muted" onClick={() => void nudge(true)}>{t("notNow")}</button>
          </div>
        </div>
      ) : null}

      {confirms.length > 3 ? (
        <button type="button" className="mt-4 rounded-2xl border border-line bg-surface px-4 py-3 text-start" onClick={() => nav.push({ id: "inbox" })}>
          <p className="font-medium">{tf("away", { count: confirms.length })}</p>
          <p className="text-sm text-muted">{t("awayBody")}</p>
        </button>
      ) : null}

      <div className="mt-5">
        <div className="flex items-center justify-between">
          <button type="button" className="grid size-11 place-items-center" onClick={() => shift(-1)} aria-label={t("monthPrev")}>‹</button>
          <p className="font-display text-xl">{formatMonthTitle(year || 2026, monthIndex, locale, settings.easternDigits)}</p>
          <button type="button" className="grid size-11 place-items-center" onClick={() => shift(1)} aria-label={t("monthNext")}>›</button>
        </div>
        <div className="mt-3">
          <Segmented
            label={t("tablist")}
            value={tab}
            onChange={(id) => setTab(id as typeof tab)}
            options={[
              { id: "income", label: t("incomeTab") },
              { id: "balance", label: t("balanceTab") },
              { id: "expense", label: t("expenseTab") },
            ]}
          />
        </div>
        <p className="mt-4 text-sm text-muted">{tab === "balance" ? t("netWorth") : t("monthNet")}</p>
        <p className="font-display text-5xl leading-none">
          <MoneyText minor={big} currency={settings.baseCurrency} kind={bigKind} />
        </p>
        {worth.missing.length > 0 && tab === "balance" ? <p className="mt-2 text-sm text-warn">{t("missingFx")}: {worth.missing.join(", ")}</p> : null}
        <div className="mt-3 flex gap-4 text-sm">
          <span className="text-income">+ {money(flow.income)}</span>
          <span className="text-expense">− {money(flow.expense)}</span>
        </div>
      </div>

      <div className="mt-5" role="grid" aria-label={t("calLabel")}>
        <div className="grid grid-cols-7 text-center text-xs text-muted">
          {labels.map((label) => (
            <div key={label} className="py-1">{label}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((iso, index) => {
            if (!iso) return <div key={`e-${index}`} />;
            const marks = dayMarks(data, iso);
            const on = iso === selected;
            const label = [
              formatPrettyDate(iso, locale, settings.easternDigits),
              marks.income ? t("onlyIncome") : "",
              marks.expense ? t("onlyExpense") : "",
              marks.scheduled ? t("planned") : "",
            ].filter(Boolean).join(", ");
            return (
              <button
                key={iso}
                type="button"
                role="gridcell"
                aria-label={label}
                aria-pressed={on}
                onClick={() => selectDate(iso)}
                className={`mx-auto flex h-11 w-11 flex-col items-center justify-center rounded-full text-sm ${on ? "bg-accent text-accent-fg" : iso === today ? "border border-line" : ""}`}
              >
                <span className="nums">{settings.easternDigits ? iso.slice(-2).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)] ?? d) : String(Number(iso.slice(-2)))}</span>
                <span className="flex h-1.5 gap-0.5">
                  {marks.income ? <i className={`block size-1 rounded-full ${on ? "bg-accent-fg" : "bg-income"}`} /> : null}
                  {marks.expense ? <i className={`block size-1 rounded-full ${on ? "bg-accent-fg" : "bg-expense"}`} /> : null}
                  {marks.scheduled && !marks.income && !marks.expense ? <i className={`block size-1 rounded-full border ${on ? "border-accent-fg" : "border-muted"}`} /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {tight ? (
        <button type="button" className="mt-4 rounded-2xl border border-line bg-surface px-4 py-3 text-start" onClick={() => nav.push({ id: "plan" })}>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>{t("budgetHealth")}</span>
            <span className={tight.ratio >= 1 ? "text-expense" : tight.ratio >= 0.8 ? "text-warn" : "text-income"}>
              {tight.ratio >= 1 ? t("over") : tight.ratio >= 0.8 ? t("tight") : t("ok")}
            </span>
          </div>
          <ProgressBar ratio={tight.ratio} tone={tight.ratio >= 1 ? "over" : tight.ratio >= 0.8 ? "warn" : "ok"} />
          <p className="mt-2 text-sm text-muted">{tf("budgetOf", { spent: money(tight.spent, tight.budget.currency), limit: money(tight.limit, tight.budget.currency) })}</p>
        </button>
      ) : null}

      {safe ? (
        <div className="mt-3 rounded-2xl bg-surface px-4 py-3">
          <p className="text-sm text-muted">{t("safeToday")}</p>
          <p className="font-display text-2xl">
            <MoneyText minor={safe.minor} currency={safe.currency} kind={safe.minor < 0 ? "expense" : "plain"} />
          </p>
          <p className="text-sm text-muted">{t("safeCaption")}</p>
        </div>
      ) : null}

      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm text-muted">{tab === "balance" ? t("transferBar") : t("bars")}</h2>
          <button type="button" className="text-sm" onClick={() => nav.tab("activity")}>{t("seeAll")}</button>
        </div>
        {tab === "balance"
          ? accounts.map(({ account, base }) => (
              <div key={account.id} className="mb-3">
                <div className="mb-1 flex justify-between text-sm">
                  <span className="flex items-center gap-2"><AppIcon name={account.icon} className="size-4" />{account.name}</span>
                  <span className="nums">{base == null ? t("unconverted") : money(base)}</span>
                </div>
                <ProgressBar ratio={worth.minor === 0 || base == null ? 0 : Math.abs(base) / Math.max(...accounts.map((a) => Math.abs(a.base ?? 0)), 1)} tone="ok" />
              </div>
            ))
          : sums.length === 0
            ? <p className="text-sm text-muted">{t("emptyBars")}</p>
            : sums.slice(0, 6).map((row) => {
                const cat = data.categories.find((c) => c.id === row.categoryId);
                return (
                  <div key={row.categoryId} className="mb-3">
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="flex items-center gap-2"><AppIcon name={cat?.icon ?? "CircleDollarSign"} className="size-4" />{categoryLabel(cat, t)}</span>
                      <span className="nums">{money(row.baseMinor)} · {total ? Math.round((row.baseMinor / total) * 100) : 0}%</span>
                    </div>
                    <ProgressBar ratio={total ? row.baseMinor / total : 0} tone={tab === "income" ? "ok" : "over"} />
                  </div>
                );
              })}
      </div>

      <div className="mt-2">
        <h2 className="text-sm text-muted">{formatPrettyDate(selected, locale, settings.easternDigits)}</h2>
        {dayTx.length === 0 ? (
          <div className="mt-3">
            <p className="text-sm text-muted">{selected === today ? t("emptyHome") : t("dayEmpty")}</p>
            {data.transactions.filter((tx) => !tx.deletedAt && tx.type === "expense").length === 0 ? (
              <div className="mt-3">
                <PrimaryButton onClick={() => nav.openAdd()}>{t("addFirst")}</PrimaryButton>
              </div>
            ) : null}
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {dayTx.map((tx) => {
              const cat = data.categories.find((c) => c.id === tx.splits[0]?.categoryId);
              return (
                <li key={tx.id}>
                  <button type="button" className="flex w-full items-center gap-3 py-3 text-start" onClick={() => nav.push({ id: "tx", txId: tx.id })}>
                    <span className="grid size-10 place-items-center rounded-full bg-surface"><AppIcon name={tx.type === "transfer" ? "ArrowLeftRight" : cat?.icon ?? "CircleDollarSign"} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{tx.type === "transfer" ? t("transfer") : categoryLabel(cat, t)}</span>
                      <span className="block truncate text-sm text-muted">{tx.payee || tx.note || tx.status}</span>
                    </span>
                    <MoneyText minor={tx.amountMinor} currency={tx.currency} kind={tx.type === "transfer" ? "transfer" : tx.type} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
