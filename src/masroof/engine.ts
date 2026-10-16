import { exponent } from "@/masroof/catalog";
import {
  addDays,
  clampMonthDay,
  fmtDate,
  monthRange,
  parseIsoDate,
  previousRange,
  todayIso,
  weekRange,
  type Range,
} from "@/masroof/dates";
import { convertMinor, RATE_SCALE } from "@/masroof/money";
import type {
  Account,
  AppData,
  AuditRow,
  Budget,
  InboxItem,
  RecurringRule,
  Transaction,
  TxType,
} from "@/masroof/types";

export function uid(): string {
  return crypto.randomUUID();
}

export function stamp(nowIso: string) {
  return { id: uid(), createdAt: nowIso, updatedAt: nowIso, deletedAt: null as string | null, version: 1 };
}

export function touch<T extends { updatedAt: string; version: number }>(row: T, nowIso: string): T {
  return { ...row, updatedAt: nowIso, version: row.version + 1 };
}

export function pushAudit(data: AppData, row: Omit<AuditRow, "id">): AppData {
  const audit = [{ ...row, id: uid() }, ...data.audit].slice(0, 40);
  return { ...data, audit };
}

export function findRate(rates: AppData["rates"], from: string, to: string): bigint | null {
  if (from === to) return RATE_SCALE;
  const direct = rates.find((r) => r.base === from && r.quote === to);
  if (direct) return BigInt(direct.rateE8);
  const inverse = rates.find((r) => r.base === to && r.quote === from);
  if (!inverse) return null;
  const r = BigInt(inverse.rateE8);
  if (r <= 0n) return null;
  return (RATE_SCALE * RATE_SCALE + r / 2n) / r;
}

export function accountDelta(tx: Transaction, accountId: string): number {
  if (tx.deletedAt || tx.status === "void" || tx.status === "scheduled" || tx.status === "pending_recurring") return 0;
  if (tx.type === "expense" && tx.accountId === accountId) return -tx.accountAmountMinor;
  if (tx.type === "income" && tx.accountId === accountId) return tx.accountAmountMinor;
  if (tx.type === "transfer") {
    if (tx.accountId === accountId) return -tx.accountAmountMinor;
    if (tx.toAccountId === accountId) return tx.toAmountMinor ?? 0;
  }
  return 0;
}

export function accountBalance(data: AppData, account: Account): number {
  let total = account.openingBalanceMinor;
  for (const tx of data.transactions) total += accountDelta(tx, account.id);
  return total;
}

export function netWorth(data: AppData): { minor: number; missing: string[] } {
  const base = data.settings.baseCurrency;
  let total = 0;
  const missing = new Set<string>();
  for (const account of data.accounts) {
    if (account.deletedAt || account.isArchived || !account.includeInTotals) continue;
    const balance = accountBalance(data, account);
    if (account.currency === base) {
      total += balance;
      continue;
    }
    const rate = findRate(data.rates, account.currency, base);
    if (rate == null) {
      missing.add(account.currency);
      continue;
    }
    const converted = convertMinor(balance, exponent(account.currency), exponent(base), rate);
    if (converted == null) missing.add(account.currency);
    else total += converted;
  }
  return { minor: total, missing: [...missing] };
}

export function allocatedBase(tx: Transaction): number[] {
  if (tx.splits.length === 0) return [];
  if (tx.amountMinor === 0) return tx.splits.map(() => 0);
  let used = 0;
  return tx.splits.map((split, index) => {
    if (index === tx.splits.length - 1) return tx.baseAmountMinor - used;
    const share = Number(
      (BigInt(tx.baseAmountMinor) * BigInt(split.amountMinor) + BigInt(tx.amountMinor) / 2n) / BigInt(tx.amountMinor),
    );
    used += share;
    return share;
  });
}

export function inRange(iso: string, range: Range): boolean {
  return iso >= range.start && iso <= range.end;
}

export function isSpending(tx: Transaction): boolean {
  return !tx.deletedAt && tx.type === "expense" && tx.status === "posted";
}

export function monthFlow(data: AppData, monthIso: string): { income: number; expense: number } {
  const range = monthRange(monthIso);
  let income = 0;
  let expense = 0;
  for (const tx of data.transactions) {
    if (tx.deletedAt || tx.status !== "posted" || tx.type === "transfer") continue;
    if (!inRange(tx.localDate, range)) continue;
    if (tx.type === "income") income += tx.baseAmountMinor;
    if (tx.type === "expense") expense += tx.baseAmountMinor;
  }
  return { income, expense };
}

export function dayMarks(data: AppData, iso: string): { income: boolean; expense: boolean; scheduled: boolean } {
  let income = false;
  let expense = false;
  let scheduled = false;
  for (const tx of data.transactions) {
    if (tx.deletedAt || tx.localDate !== iso || tx.type === "transfer") continue;
    if (tx.status === "scheduled") scheduled = true;
    if (tx.status !== "posted") continue;
    if (tx.type === "income") income = true;
    if (tx.type === "expense") expense = true;
  }
  return { income, expense, scheduled };
}

export type CategorySum = { categoryId: string; baseMinor: number };

export function categorySums(data: AppData, monthIso: string, kind: "income" | "expense"): CategorySum[] {
  const range = monthRange(monthIso);
  const map = new Map<string, number>();
  for (const tx of data.transactions) {
    if (tx.deletedAt || tx.status !== "posted" || tx.type !== kind) continue;
    if (!inRange(tx.localDate, range)) continue;
    const parts = allocatedBase(tx);
    tx.splits.forEach((split, index) => {
      map.set(split.categoryId, (map.get(split.categoryId) ?? 0) + (parts[index] ?? 0));
    });
  }
  return [...map.entries()]
    .map(([categoryId, baseMinor]) => ({ categoryId, baseMinor }))
    .sort((a, b) => b.baseMinor - a.baseMinor);
}

export function transferBlock(from: Account | undefined, to: Account | undefined): "missing" | "same" | "archived" | null {
  if (!from || !to) return "missing";
  if (from.id === to.id) return "same";
  if (from.isArchived || to.isArchived || from.deletedAt || to.deletedAt) return "archived";
  return null;
}

export function splitsMatch(total: number, parts: number[]): "ok" | "short" | "over" {
  const sum = parts.reduce((acc, n) => acc + n, 0);
  if (sum === total) return "ok";
  return sum < total ? "short" : "over";
}

function periodRange(period: "monthly" | "weekly", iso: string, weekStartsOn: AppData["settings"]["firstDayOfWeek"]): Range {
  return period === "weekly" ? weekRange(iso, weekStartsOn) : monthRange(iso);
}

function splitSpent(tx: Transaction, splitIndex: number, budget: Budget, data: AppData): number {
  const split = tx.splits[splitIndex];
  if (!split) return 0;
  if (budget.categoryId && split.categoryId !== budget.categoryId) return 0;
  if (budget.currency === tx.currency) return split.amountMinor;
  const bases = allocatedBase(tx);
  const basePart = bases[splitIndex] ?? 0;
  if (budget.currency === data.settings.baseCurrency) return basePart;
  const rate = findRate(data.rates, data.settings.baseCurrency, budget.currency);
  if (rate == null) return 0;
  return convertMinor(basePart, exponent(data.settings.baseCurrency), exponent(budget.currency), rate) ?? 0;
}

export function budgetSpent(data: AppData, budget: Budget, range: Range): number {
  let total = 0;
  for (const tx of data.transactions) {
    if (!isSpending(tx) || !inRange(tx.localDate, range)) continue;
    tx.splits.forEach((_, index) => {
      total += splitSpent(tx, index, budget, data);
    });
  }
  return total;
}

export function effectiveBudget(data: AppData, budget: Budget, range: Range): number {
  if (!budget.rollover) return budget.amountMinor;
  const prev = previousRange(range, budget.period, data.settings.firstDayOfWeek);
  const spentPrev = budgetSpent(data, budget, prev);
  return budget.amountMinor + Math.max(0, budget.amountMinor - spentPrev);
}

export type BudgetView = {
  budget: Budget;
  spent: number;
  limit: number;
  ratio: number;
  range: Range;
};

export function budgetView(data: AppData, budget: Budget, iso: string): BudgetView {
  const range = periodRange(budget.period, iso, data.settings.firstDayOfWeek);
  const spent = budgetSpent(data, budget, range);
  const limit = effectiveBudget(data, budget, range);
  const ratio = limit <= 0 ? (spent > 0 ? 1 : 0) : spent / limit;
  return { budget, spent, limit, ratio, range };
}

export function safeToSpend(data: AppData, iso: string): { minor: number; currency: string; days: number } | null {
  const active = data.budgets.filter((b) => !b.deletedAt);
  const overall = active.find((b) => b.categoryId == null && b.period === "monthly");
  const chosen = overall ? [overall] : active.filter((b) => b.period === "monthly");
  const list = chosen.length > 0 ? chosen : active.filter((b) => b.period === "weekly");
  if (list.length === 0) return null;
  let remaining = 0;
  let end = iso;
  for (const budget of list) {
    const view = budgetView(data, budget, iso);
    remaining += view.limit - view.spent;
    end = view.range.end;
  }
  const days = Math.max(1, Math.round((parseIsoDate(end).getTime() - parseIsoDate(iso).getTime()) / 86_400_000) + 1);
  const currency = list[0]?.currency ?? data.settings.baseCurrency;
  return { minor: Math.floor(remaining / days), currency, days };
}

export function occurrenceDates(rule: RecurringRule, today: string, futureDays = 0): string[] {
  const horizon = addDays(today, futureDays);
  const endCap = rule.endDate && rule.endDate < horizon ? rule.endDate : horizon;
  const windowStart = addDays(today, -120) > rule.startDate ? addDays(today, -120) : rule.startDate;
  if (endCap < windowStart) return [];
  const dates: string[] = [];
  const interval = Math.max(1, rule.interval || 1);
  if (rule.freq === "monthly" || rule.freq === "yearly") {
    const step = rule.freq === "yearly" ? interval * 12 : interval;
    let cursor = parseIsoDate(rule.startDate);
    const stop = parseIsoDate(endCap);
    for (let guard = 0; guard < 80; guard += 1) {
      const iso = clampMonthDay(cursor.getFullYear(), cursor.getMonth(), rule.byMonthDay ?? cursor.getDate());
      if (iso >= windowStart && iso >= rule.startDate && iso <= endCap) dates.push(iso);
      if (parseIsoDate(iso) > stop && cursor > stop) break;
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + step, 1);
      if (cursor.getFullYear() > stop.getFullYear() + 1) break;
    }
  } else {
    let cursor = parseIsoDate(rule.startDate);
    const want = rule.byWeekday ?? cursor.getDay();
    for (let i = 0; i < 7 && cursor.getDay() !== want; i += 1) cursor.setDate(cursor.getDate() + 1);
    const window = parseIsoDate(windowStart);
    while (cursor < window) cursor.setDate(cursor.getDate() + 7 * interval);
    const stop = parseIsoDate(endCap);
    for (let guard = 0; guard < 80 && cursor <= stop; guard += 1) {
      const iso = fmtDate(cursor);
      if (iso >= rule.startDate && iso <= endCap) dates.push(iso);
      cursor.setDate(cursor.getDate() + 7 * interval);
    }
  }
  return [...new Set(dates)].sort();
}

function inboxHas(data: AppData, key: string): boolean {
  return data.inbox.some((item) => item.occurrenceKey === key && (item.kind === "confirm" || item.kind === "remind"));
}

function txHas(data: AppData, key: string): boolean {
  return data.transactions.some((tx) => tx.occurrenceKey === key && !tx.deletedAt);
}

export function applyEngines(data: AppData, now = new Date()): AppData {
  const today = todayIso(now);
  const nowIso = now.toISOString();
  let next = promoteScheduled(data, today, nowIso);
  next = runRecurrence(next, today, nowIso);
  next = runBudgetAlerts(next, today, nowIso);
  next = purgeTrash(next, now);
  return next;
}

function promoteScheduled(data: AppData, today: string, nowIso: string): AppData {
  let changed = false;
  const transactions = data.transactions.map((tx) => {
    if (tx.deletedAt || tx.status !== "scheduled" || tx.localDate > today) return tx;
    changed = true;
    return touch({ ...tx, status: "posted" as const }, nowIso);
  });
  return changed ? { ...data, transactions } : data;
}

function makeTxFromTemplate(
  data: AppData,
  rule: RecurringRule,
  localDate: string,
  nowIso: string,
  status: Transaction["status"],
): Transaction | null {
  const account = data.accounts.find((a) => a.id === rule.template.accountId && !a.deletedAt);
  if (!account || account.isArchived) return null;
  const amount = rule.template.amountMinor;
  if (amount <= 0) return null;
  const base =
    rule.template.currency === data.settings.baseCurrency
      ? amount
      : (() => {
          const rate = findRate(data.rates, rule.template.currency, data.settings.baseCurrency);
          if (rate == null) return amount;
          return (
            convertMinor(amount, exponent(rule.template.currency), exponent(data.settings.baseCurrency), rate) ?? amount
          );
        })();
  const rate =
    rule.template.currency === data.settings.baseCurrency
      ? RATE_SCALE.toString()
      : (findRate(data.rates, rule.template.currency, data.settings.baseCurrency)?.toString() ?? RATE_SCALE.toString());
  const categoryId = rule.template.categoryId;
  return {
    ...stamp(nowIso),
    type: rule.template.type,
    accountId: account.id,
    toAccountId: rule.template.toAccountId,
    amountMinor: amount,
    accountAmountMinor: amount,
    toAmountMinor: rule.template.type === "transfer" ? amount : null,
    currency: rule.template.currency,
    toCurrency: null,
    fxRateE8: rate,
    baseAmountMinor: rule.template.type === "transfer" ? 0 : base,
    localDate,
    occurredAt: nowIso,
    occurredTz: "UTC",
    payee: rule.template.payee,
    note: rule.template.note,
    tags: rule.template.tags,
    status,
    recurringRuleId: rule.id,
    occurrenceKey: `${rule.id}|${localDate}`,
    seriesDetached: false,
    splits:
      rule.template.type === "transfer" || !categoryId
        ? []
        : [{ id: uid(), categoryId, amountMinor: amount, note: "" }],
    attachments: [],
  };
}

function runRecurrence(data: AppData, today: string, nowIso: string): AppData {
  let next = data;
  for (const rule of data.rules) {
    if (rule.deletedAt) continue;
    const future = rule.mode === "confirm_before_post" ? 7 : 0;
    for (const date of occurrenceDates(rule, today, future)) {
      const key = `${rule.id}|${date}`;
      if (next.settledKeys.includes(key) || txHas(next, key) || inboxHas(next, key)) continue;
      if (date > today && rule.mode !== "confirm_before_post") continue;
      if (rule.mode === "auto_post" && date <= today) {
        const tx = makeTxFromTemplate(next, rule, date, nowIso, "posted");
        if (!tx) continue;
        const posted: InboxItem = {
          id: uid(),
          kind: "posted",
          createdAt: nowIso,
          read: false,
          notified: false,
          occurrenceKey: key,
          ruleId: rule.id,
          localDate: date,
          amountMinor: tx.amountMinor,
          currency: tx.currency,
          categoryId: tx.splits[0]?.categoryId ?? null,
          accountId: tx.accountId,
          payee: tx.payee,
          note: tx.note,
          txType: tx.type,
        };
        next = {
          ...next,
          transactions: [tx, ...next.transactions],
          settledKeys: [...next.settledKeys, key].slice(-2000),
          inbox: [posted, ...next.inbox].slice(0, 100),
        };
        continue;
      }
      if (rule.mode === "remind_only" && date <= today) {
        next = {
          ...next,
          settledKeys: [...next.settledKeys, key].slice(-2000),
          inbox: [
            baseInbox(rule, key, date, nowIso, "remind"),
            ...next.inbox,
          ].slice(0, 100),
        };
        continue;
      }
      if (rule.mode === "confirm_before_post") {
        next = {
          ...next,
          inbox: [baseInbox(rule, key, date, nowIso, "confirm"), ...next.inbox].slice(0, 100),
        };
      }
    }
  }
  return next;
}

function baseInbox(rule: RecurringRule, key: string, date: string, nowIso: string, kind: "confirm" | "remind"): InboxItem {
  return {
    id: uid(),
    kind,
    createdAt: nowIso,
    read: false,
    notified: false,
    occurrenceKey: key,
    ruleId: rule.id,
    localDate: date,
    amountMinor: rule.template.amountMinor,
    currency: rule.template.currency,
    categoryId: rule.template.categoryId,
    accountId: rule.template.accountId,
    toAccountId: rule.template.toAccountId,
    payee: rule.template.payee,
    note: rule.template.note,
    tags: rule.template.tags,
    txType: rule.template.type,
  };
}

function runBudgetAlerts(data: AppData, today: string, nowIso: string): AppData {
  let budgets = data.budgets;
  let inbox = data.inbox;
  let changed = false;
  budgets = budgets.map((budget) => {
    if (budget.deletedAt) return budget;
    const view = budgetView(data, budget, today);
    const pct = view.limit <= 0 ? 0 : (view.spent * 100) / view.limit;
    let fired = budget.fired;
    for (const threshold of [...budget.alertThresholds].sort((a, b) => a - b)) {
      if (pct + 1e-9 < threshold) continue;
      if (fired.some((f) => f.periodKey === view.range.key && f.threshold === threshold)) continue;
      fired = [...fired, { periodKey: view.range.key, threshold }];
      changed = true;
      inbox = [
        {
          id: uid(),
          kind: "budget" as const,
          createdAt: nowIso,
          read: false,
          notified: false,
          budgetId: budget.id,
          threshold,
          periodKey: view.range.key,
          amountMinor: view.spent,
          currency: budget.currency,
          categoryId: budget.categoryId,
        },
        ...inbox,
      ].slice(0, 100);
    }
    return fired === budget.fired ? budget : { ...budget, fired };
  });
  if (!changed) return data;
  return { ...data, budgets, inbox };
}

function purgeTrash(data: AppData, now: Date): AppData {
  const cutoff = now.getTime() - 30 * 86_400_000;
  const fresh = <T extends { deletedAt: string | null }>(rows: T[]) =>
    rows.filter((row) => !row.deletedAt || new Date(row.deletedAt).getTime() >= cutoff);
  const transactions = fresh(data.transactions);
  const accounts = fresh(data.accounts);
  const categories = fresh(data.categories);
  const budgets = fresh(data.budgets);
  const goals = fresh(data.goals);
  const rules = fresh(data.rules);
  if (
    transactions.length === data.transactions.length &&
    accounts.length === data.accounts.length &&
    categories.length === data.categories.length &&
    budgets.length === data.budgets.length &&
    goals.length === data.goals.length &&
    rules.length === data.rules.length
  ) {
    return data;
  }
  return { ...data, transactions, accounts, categories, budgets, goals, rules };
}

export type RevaluePreview = {
  ok: true;
  txCount: number;
  rates: { currency: string; rateE8: string }[];
};

export function currenciesInUse(data: AppData): string[] {
  const set = new Set<string>();
  set.add(data.settings.baseCurrency);
  for (const account of data.accounts) if (!account.deletedAt) set.add(account.currency);
  for (const tx of data.transactions) if (!tx.deletedAt) set.add(tx.currency);
  for (const budget of data.budgets) if (!budget.deletedAt) set.add(budget.currency);
  for (const goal of data.goals) if (!goal.deletedAt) set.add(goal.currency);
  return [...set];
}

export function revalue(data: AppData, nextCurrency: string, rates: { currency: string; rateE8: string }[]): { ok: true; data: AppData } | { ok: false; missing: string[] } {
  const need = currenciesInUse(data).filter((code) => code !== nextCurrency);
  const table = new Map(rates.map((r) => [r.currency, BigInt(r.rateE8)]));
  const missing = need.filter((code) => !table.get(code) || table.get(code)! <= 0n);
  if (missing.length > 0) return { ok: false, missing };
  const oldBase = data.settings.baseCurrency;
  const nowIso = new Date().toISOString();
  const transactions = data.transactions.map((tx) => {
    if (tx.deletedAt || tx.type === "transfer") return tx;
    if (tx.currency === nextCurrency) {
      return touch({ ...tx, baseAmountMinor: tx.amountMinor, fxRateE8: RATE_SCALE.toString() }, nowIso);
    }
    const rate = table.get(tx.currency)!;
    const base = convertMinor(tx.amountMinor, exponent(tx.currency), exponent(nextCurrency), rate);
    return touch({ ...tx, baseAmountMinor: base ?? tx.baseAmountMinor, fxRateE8: rate.toString() }, nowIso);
  });
  const convertAmount = (amount: number, currency: string) => {
    if (currency !== oldBase || oldBase === nextCurrency) return { amount, currency };
    const rate = table.get(oldBase);
    if (!rate) return { amount, currency };
    return {
      amount: convertMinor(amount, exponent(oldBase), exponent(nextCurrency), rate) ?? amount,
      currency: nextCurrency,
    };
  };
  const budgets = data.budgets.map((budget) => {
    const converted = convertAmount(budget.amountMinor, budget.currency);
    return { ...budget, amountMinor: converted.amount, currency: converted.currency };
  });
  const goals = data.goals.map((goal) => {
    const converted = convertAmount(goal.targetMinor, goal.currency);
    return { ...goal, targetMinor: converted.amount, currency: converted.currency };
  });
  const fxRates = [
    ...need.map((currency) => ({
      id: uid(),
      base: currency,
      quote: nextCurrency,
      rateE8: table.get(currency)!.toString(),
      asOf: nowIso,
      source: "manual" as const,
    })),
    ...data.rates.filter((r) => r.quote !== nextCurrency && r.base !== nextCurrency),
  ];
  return {
    ok: true,
    data: {
      ...data,
      transactions,
      budgets,
      goals,
      rates: fxRates,
      settings: { ...data.settings, baseCurrency: nextCurrency },
    },
  };
}

export function duplicateKey(tx: Pick<Transaction, "localDate" | "type" | "amountMinor" | "currency" | "accountId" | "note">): string {
  return [tx.localDate, tx.type, tx.amountMinor, tx.currency, tx.accountId, tx.note.trim().toLowerCase()].join("|");
}

export function flowKind(type: TxType): "income" | "expense" | "transfer" {
  return type;
}
