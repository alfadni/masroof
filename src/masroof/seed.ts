import { ACCOUNT_ICONS, SEED_CATEGORIES } from "@/masroof/catalog";
import { addDays, addMonths, startOfMonth, todayIso } from "@/masroof/dates";
import { stamp, uid } from "@/masroof/engine";
import { majorStringToMinor } from "@/masroof/money";
import type { Account, AccountType, AppData, Category, Settings, Transaction } from "@/masroof/types";

export function defaultSettings(over: Partial<Settings> = {}): Settings {
  return {
    onboarded: false,
    onboardingStep: 0,
    baseCurrency: "USD",
    locale: "en",
    theme: "system",
    firstDayOfWeek: 1,
    numberFormat: "comma",
    easternDigits: false,
    lockTimeoutSec: 60,
    hasPin: false,
    biometricsEnabled: false,
    lastAccountId: null,
    recentCategoryIds: [],
    lastAmountByCategory: {},
    draft: null,
    backupNudged: false,
    lastBackupAt: null,
    pendingAccountName: "",
    pendingAccountType: "cash",
    pendingSample: true,
    ...over,
  };
}

export function seedCategories(nowIso: string): Category[] {
  return SEED_CATEGORIES.map((cat, index) => ({
    ...stamp(nowIso),
    id: cat.id,
    name: "",
    nameKey: cat.nameKey,
    kind: cat.kind,
    parentId: null,
    icon: cat.icon,
    swatch: cat.swatch,
    isSystem: true,
    isArchived: false,
    sortOrder: index,
  }));
}

export function freshData(over: Partial<Settings> = {}): AppData {
  const nowIso = new Date().toISOString();
  return {
    schema: 1,
    accounts: [],
    categories: seedCategories(nowIso),
    transactions: [],
    budgets: [],
    goals: [],
    rules: [],
    rates: [],
    inbox: [],
    audit: [],
    settledKeys: [],
    settings: defaultSettings(over),
  };
}

export function withDefaults(raw: AppData): AppData {
  const base = freshData();
  return {
    ...base,
    ...raw,
    schema: 1,
    accounts: raw.accounts ?? [],
    categories: raw.categories?.length ? raw.categories : base.categories,
    transactions: raw.transactions ?? [],
    budgets: raw.budgets ?? [],
    goals: raw.goals ?? [],
    rules: raw.rules ?? [],
    rates: raw.rates ?? [],
    inbox: raw.inbox ?? [],
    audit: raw.audit ?? [],
    settledKeys: raw.settledKeys ?? [],
    settings: { ...defaultSettings(), ...raw.settings },
  };
}

function minor(amount: string, currency: string): number {
  return majorStringToMinor(amount, currency) ?? 0;
}

function tx(
  partial: Omit<
    Transaction,
    | "createdAt"
    | "updatedAt"
    | "deletedAt"
    | "version"
    | "id"
    | "seriesDetached"
    | "attachments"
    | "occurrenceKey"
    | "recurringRuleId"
    | "toAccountId"
    | "toAmountMinor"
    | "toCurrency"
    | "tags"
  > & {
    id?: string;
    tags?: string[];
    toAccountId?: string | null;
    toAmountMinor?: number | null;
    toCurrency?: string | null;
  },
  nowIso: string,
): Transaction {
  const { id: givenId, tags, toAccountId, toAmountMinor, toCurrency, ...rest } = partial;
  return {
    ...stamp(nowIso),
    ...(givenId ? { id: givenId } : {}),
    seriesDetached: false,
    attachments: [],
    occurrenceKey: null,
    recurringRuleId: null,
    tags: tags ?? [],
    toAccountId: toAccountId ?? null,
    toAmountMinor: toAmountMinor ?? null,
    toCurrency: toCurrency ?? null,
    ...rest,
  };
}

export function buildOnboarding(
  base: AppData,
  choice: { accountName: string; accountType: AccountType; sample: boolean; now?: Date },
): AppData {
  const now = choice.now ?? new Date();
  const nowIso = now.toISOString();
  const today = todayIso(now);
  const currency = base.settings.baseCurrency;
  const cash = makeAccount(choice.accountName.trim() || "Cash", choice.accountType, currency, "0", today, nowIso);
  const data: AppData = {
    ...base,
    accounts: [cash],
    settings: {
      ...base.settings,
      onboarded: true,
      onboardingStep: 5,
      lastAccountId: cash.id,
      pendingSample: choice.sample,
      pendingAccountName: choice.accountName,
      pendingAccountType: choice.accountType,
      draft: null,
    },
  };
  if (!choice.sample) return data;
  return addSample(data, cash, now);
}

function makeAccount(
  name: string,
  type: AccountType,
  currency: string,
  opening: string,
  openingDate: string,
  nowIso: string,
): Account {
  return {
    ...stamp(nowIso),
    name,
    type,
    currency,
    openingBalanceMinor: minor(opening, currency),
    openingDate,
    icon: ACCOUNT_ICONS[type],
    swatch: type === "savings" ? "pine" : type === "cash" ? "sand" : "sage",
    isArchived: false,
    includeInTotals: true,
  };
}

function addSample(data: AppData, cash: Account, now: Date): AppData {
  const nowIso = now.toISOString();
  const today = todayIso(now);
  const currency = data.settings.baseCurrency;
  const ar = data.settings.locale === "ar";
  const gulf = ["QAR", "AED", "SAR", "KWD", "BHD", "OMR"].includes(currency);
  const L = ar
    ? {
        market: gulf ? "كارفور" : "البقالة",
        rent: "الإيجار",
        fuel: "وقود",
        cafe: "قهوة",
        salary: "الراتب",
        fun: "سينما",
        health: "صيدلية",
        clothes: "ملابس",
        bank: "البنك",
        save: "الادخار",
        goal: "صندوق الطوارئ",
        sub: "اشتراك",
        kids: "أطفال",
      }
    : {
        market: gulf ? "Carrefour" : "Market",
        rent: "Rent",
        fuel: "Fuel",
        cafe: "Coffee",
        salary: "Salary",
        fun: "Cinema",
        health: "Pharmacy",
        clothes: "Clothes",
        bank: "Bank",
        save: "Savings",
        goal: "Emergency fund",
        sub: "Subscription",
        kids: "Kids",
      };
  const monthStart = startOfMonth(today);
  const openingDate = addMonths(monthStart, -14);
  cash.openingDate = openingDate;
  cash.openingBalanceMinor = minor("250", currency);
  const bank = makeAccount(L.bank, "bank", currency, "1500", openingDate, nowIso);
  const save = makeAccount(L.save, "savings", currency, "5000", openingDate, nowIso);
  const day = (n: number) => {
    const date = new Date(now.getFullYear(), now.getMonth(), n);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return iso <= today ? iso : monthStart;
  };
  const posted = (
    when: string,
    type: Transaction["type"],
    account: Account,
    amount: string,
    categoryId: string,
    payee: string,
    note: string,
    tags: string[] = [],
  ): Transaction => {
    const amountMinor = minor(amount, currency);
    return tx(
      {
        type,
        accountId: account.id,
        amountMinor,
        accountAmountMinor: amountMinor,
        currency,
        fxRateE8: "100000000",
        baseAmountMinor: amountMinor,
        localDate: when,
        occurredAt: nowIso,
        occurredTz: "UTC",
        payee,
        note,
        tags,
        status: "posted",
        splits: [{ id: uid(), categoryId, amountMinor, note: "" }],
      },
      nowIso,
    );
  };
  const clothesAmount = minor("123", currency);
  const clothes = tx(
    {
      type: "expense",
      accountId: cash.id,
      amountMinor: clothesAmount,
      accountAmountMinor: clothesAmount,
      currency,
      fxRateE8: "100000000",
      baseAmountMinor: clothesAmount,
      localDate: day(10),
      occurredAt: nowIso,
      occurredTz: "UTC",
      payee: L.clothes,
      note: ar ? "تيشيرت وبنطال" : "Shirt and trousers",
      tags: [],
      status: "posted",
      splits: [
        { id: uid(), categoryId: "cat_clothes", amountMinor: minor("80", currency), note: L.clothes },
        { id: uid(), categoryId: "cat_kids", amountMinor: minor("43", currency), note: L.kids },
      ],
    },
    nowIso,
  );
  const transferAmount = minor("200", currency);
  const transfer = tx(
    {
      type: "transfer",
      accountId: bank.id,
      toAccountId: cash.id,
      amountMinor: transferAmount,
      accountAmountMinor: transferAmount,
      toAmountMinor: transferAmount,
      currency,
      toCurrency: currency,
      fxRateE8: "100000000",
      baseAmountMinor: 0,
      localDate: day(7),
      occurredAt: nowIso,
      occurredTz: "UTC",
      payee: "",
      note: ar ? "سحب نقدي" : "Cash withdrawal",
      tags: [],
      status: "posted",
      splits: [],
    },
    nowIso,
  );
  const futureAmount = minor("45", currency);
  const future = tx(
    {
      type: "expense",
      accountId: cash.id,
      amountMinor: futureAmount,
      accountAmountMinor: futureAmount,
      currency,
      fxRateE8: "100000000",
      baseAmountMinor: futureAmount,
      localDate: addDays(today, 3),
      occurredAt: nowIso,
      occurredTz: "UTC",
      payee: L.fun,
      note: ar ? "موعد لاحق" : "Later this week",
      tags: [],
      status: "scheduled",
      splits: [{ id: uid(), categoryId: "cat_fun", amountMinor: futureAmount, note: "" }],
    },
    nowIso,
  );
  const nextMonth = addMonths(startOfMonth(today), 1);
  return {
    ...data,
    accounts: [cash, bank, save],
    transactions: [
      posted(day(1), "income", bank, "8500", "cat_salary", L.salary, L.salary),
      posted(day(1), "expense", bank, "3000", "cat_bills", L.rent, L.rent),
      posted(day(3), "expense", cash, "72", "cat_food", L.market, L.market, ["home"]),
      posted(day(4), "expense", cash, "18.50", "cat_food", L.cafe, L.cafe),
      posted(day(5), "expense", cash, "90", "cat_food", L.market, ""),
      posted(day(6), "expense", cash, "80", "cat_fuel", L.fuel, L.fuel),
      posted(day(8), "expense", cash, "60", "cat_health", L.health, L.health),
      posted(day(9), "expense", cash, "64", "cat_food", L.cafe, ""),
      clothes,
      posted(day(11), "expense", cash, "120", "cat_fun", L.fun, L.fun),
      posted(day(12), "expense", cash, "29.50", "cat_food", L.cafe, ""),
      posted(day(14), "expense", cash, "48.50", "cat_food", L.market, L.market),
      posted(day(2), "expense", cash, "36", "cat_food", L.market, ""),
      transfer,
      future,
    ],
    budgets: [
      {
        ...stamp(nowIso),
        categoryId: "cat_food",
        period: "monthly",
        amountMinor: minor("400", currency),
        currency,
        rollover: false,
        alertThresholds: [50, 80, 100],
        fired: [],
      },
    ],
    goals: [
      {
        ...stamp(nowIso),
        name: L.goal,
        targetMinor: minor("10000", currency),
        currency,
        targetDate: addMonths(today, 18),
        linkedAccountId: save.id,
      },
    ],
    rules: [
      {
        ...stamp(nowIso),
        freq: "monthly",
        interval: 1,
        byMonthDay: 1,
        byWeekday: null,
        startDate: nextMonth,
        endDate: null,
        mode: "auto_post",
        template: {
          type: "expense",
          accountId: bank.id,
          toAccountId: null,
          amountMinor: minor("3000", currency),
          currency,
          categoryId: "cat_bills",
          payee: L.rent,
          note: L.rent,
          tags: [],
        },
      },
      {
        ...stamp(nowIso),
        freq: "monthly",
        interval: 1,
        byMonthDay: now.getDate(),
        byWeekday: null,
        startDate: today,
        endDate: null,
        mode: "confirm_before_post",
        template: {
          type: "expense",
          accountId: cash.id,
          toAccountId: null,
          amountMinor: minor("35", currency),
          currency,
          categoryId: "cat_fun",
          payee: L.sub,
          note: L.sub,
          tags: [],
        },
      },
    ],
    settings: {
      ...data.settings,
      lastAccountId: cash.id,
      recentCategoryIds: ["cat_food", "cat_bills", "cat_fuel"],
      lastAmountByCategory: { cat_food: { minor: minor("18.50", currency), currency } },
    },
  };
}
