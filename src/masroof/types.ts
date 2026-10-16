export type ID = string;

export type Locale = "en" | "ar";
export type ThemeMode = "light" | "dark" | "system";
export type WeekStart = 0 | 1 | 6;
export type NumberFormat = "comma" | "dot" | "space";
export type AccountType = "cash" | "bank" | "mobile_wallet" | "card" | "savings" | "other";
export type TxType = "expense" | "income" | "transfer";
export type TxStatus = "posted" | "pending_recurring" | "void" | "scheduled";
export type RecurMode = "auto_post" | "remind_only" | "confirm_before_post";
export type RecurFreq = "weekly" | "monthly" | "yearly";
export type Swatch = "pine" | "clay" | "sand" | "sage";
export type CategoryKind = "expense" | "income";

export type Stamp = {
  id: ID;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
};

export type Account = Stamp & {
  name: string;
  type: AccountType;
  currency: string;
  openingBalanceMinor: number;
  openingDate: string;
  icon: string;
  swatch: Swatch;
  isArchived: boolean;
  includeInTotals: boolean;
};

export type Category = Stamp & {
  name: string;
  nameKey: string | null;
  kind: CategoryKind;
  parentId: string | null;
  icon: string;
  swatch: Swatch;
  isSystem: boolean;
  isArchived: boolean;
  sortOrder: number;
};

export type Split = {
  id: ID;
  categoryId: string;
  amountMinor: number;
  note: string;
};

export type Attachment = {
  id: ID;
  dataUrl: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
};

export type Transaction = Stamp & {
  type: TxType;
  accountId: string;
  toAccountId: string | null;
  amountMinor: number;
  accountAmountMinor: number;
  toAmountMinor: number | null;
  currency: string;
  toCurrency: string | null;
  fxRateE8: string;
  baseAmountMinor: number;
  localDate: string;
  occurredAt: string;
  occurredTz: string;
  payee: string;
  note: string;
  tags: string[];
  status: TxStatus;
  recurringRuleId: string | null;
  occurrenceKey: string | null;
  seriesDetached: boolean;
  splits: Split[];
  attachments: Attachment[];
};

export type Budget = Stamp & {
  categoryId: string | null;
  period: "monthly" | "weekly";
  amountMinor: number;
  currency: string;
  rollover: boolean;
  alertThresholds: number[];
  fired: { periodKey: string; threshold: number }[];
};

export type Goal = Stamp & {
  name: string;
  targetMinor: number;
  currency: string;
  targetDate: string | null;
  linkedAccountId: string | null;
};

export type RecurringTemplate = {
  type: TxType;
  accountId: string;
  toAccountId: string | null;
  amountMinor: number;
  currency: string;
  categoryId: string | null;
  payee: string;
  note: string;
  tags: string[];
};

export type RecurringRule = Stamp & {
  freq: RecurFreq;
  interval: number;
  byMonthDay: number | null;
  byWeekday: number | null;
  startDate: string;
  endDate: string | null;
  mode: RecurMode;
  template: RecurringTemplate;
};

export type FxRate = {
  id: ID;
  base: string;
  quote: string;
  rateE8: string;
  asOf: string;
  source: "manual";
};

export type InboxKind = "budget" | "confirm" | "posted" | "remind";

export type InboxItem = {
  id: ID;
  kind: InboxKind;
  createdAt: string;
  read: boolean;
  notified: boolean;
  occurrenceKey?: string;
  ruleId?: string;
  budgetId?: string;
  threshold?: number;
  periodKey?: string;
  localDate?: string;
  amountMinor?: number;
  currency?: string;
  categoryId?: string | null;
  accountId?: string;
  toAccountId?: string | null;
  payee?: string;
  note?: string;
  tags?: string[];
  txType?: TxType;
};

export type AuditRow = {
  id: ID;
  entity: string;
  entityId: string;
  action: "create" | "update" | "delete" | "restore";
  at: string;
  version: number;
};

export type Draft = {
  savedAt: number;
  type: TxType;
  expression: string;
  toExpression: string;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  splitMode: boolean;
  splits: { id: string; categoryId: string; expression: string; note: string }[];
  note: string;
  payee: string;
  tags: string;
  localDate: string;
  editingId: string | null;
  series: "one" | "future" | null;
};

export type Settings = {
  onboarded: boolean;
  onboardingStep: number;
  baseCurrency: string;
  locale: Locale;
  theme: ThemeMode;
  firstDayOfWeek: WeekStart;
  numberFormat: NumberFormat;
  easternDigits: boolean;
  lockTimeoutSec: number;
  hasPin: boolean;
  biometricsEnabled: boolean;
  lastAccountId: string | null;
  recentCategoryIds: string[];
  lastAmountByCategory: Record<string, { minor: number; currency: string }>;
  draft: Draft | null;
  backupNudged: boolean;
  lastBackupAt: string | null;
  pendingAccountName: string;
  pendingAccountType: AccountType;
  pendingSample: boolean;
};

export type AppData = {
  schema: 1;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  rules: RecurringRule[];
  rates: FxRate[];
  inbox: InboxItem[];
  audit: AuditRow[];
  settledKeys: string[];
  settings: Settings;
};

export type SaveTxInput = {
  id?: string;
  type: TxType;
  accountId: string;
  toAccountId?: string | null;
  amountMinor: number;
  accountAmountMinor: number;
  toAmountMinor?: number | null;
  currency: string;
  toCurrency?: string | null;
  fxRateE8: string;
  baseAmountMinor: number;
  localDate: string;
  payee: string;
  note: string;
  tags: string[];
  splits: { categoryId: string; amountMinor: number; note: string }[];
  attachments: Attachment[];
  series?: "one" | "future" | null;
};
