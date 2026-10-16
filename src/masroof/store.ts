import { create } from "zustand";
import { detectDefaults } from "@/masroof/catalog";
import { todayIso, zoneName } from "@/masroof/dates";
import { applyEngines, pushAudit, revalue, stamp, touch, transferBlock, uid } from "@/masroof/engine";
import type { Key } from "@/masroof/i18n";
import { buildOnboarding, freshData, withDefaults } from "@/masroof/seed";
import type {
  Account,
  AccountType,
  AppData,
  Attachment,
  Budget,
  Category,
  Draft,
  Goal,
  InboxItem,
  RecurringRule,
  SaveTxInput,
  Transaction,
  TxType,
} from "@/masroof/types";
import {
  changePin as vaultChangePin,
  disableBiometrics,
  disablePin,
  enableBiometrics,
  enablePin,
  loadVault,
  lockSession,
  mirrorPrefs,
  persistData,
  unlockWithBiometrics,
  unlockWithPin,
  wipeVault,
} from "@/masroof/vault";

export type Notice = {
  id: number;
  key: Key;
  vars?: Record<string, string | number>;
  undo: boolean;
} | null;

type Lockout = { attempts: number; until: number | null };

type AddIntent = {
  type: TxType;
  editingId: string | null;
  series: "one" | "future" | null;
};

type State = {
  ready: boolean;
  unlocked: boolean;
  problem: null | "corrupt" | "newer";
  lockout: Lockout;
  hasBio: boolean;
  data: AppData;
  notice: Notice;
  undoSnapshot: AppData | null;
  selectedDate: string;
  addIntent: AddIntent | null;
  boot: () => Promise<void>;
  patchSettings: (partial: Partial<AppData["settings"]>) => Promise<void>;
  finishOnboarding: (choice: { accountName: string; accountType: AccountType; sample: boolean; pin: string | null }) => Promise<void>;
  unlockPin: (pin: string) => Promise<"ok" | "bad" | "cooldown">;
  unlockBio: () => Promise<boolean>;
  lock: () => Promise<void>;
  setPin: (pin: string) => Promise<boolean>;
  changePin: (oldPin: string, next: string) => Promise<boolean>;
  clearPin: (pin: string) => Promise<boolean>;
  turnOnBio: () => Promise<boolean>;
  turnOffBio: () => Promise<void>;
  openAdd: (intent?: Partial<AddIntent>) => void;
  closeAdd: () => void;
  saveDraft: (draft: Draft | null) => void;
  saveTransaction: (input: SaveTxInput) => Promise<{ ok: true; attachmentFailed?: boolean } | { ok: false; error: Key }>;
  deleteTransaction: (id: string) => Promise<void>;
  undo: () => Promise<void>;
  dismissNotice: () => void;
  restoreTransaction: (id: string) => Promise<void>;
  purgeTrash: () => Promise<void>;
  saveAccount: (input: Omit<Account, "id" | "createdAt" | "updatedAt" | "deletedAt" | "version"> & { id?: string }) => Promise<void>;
  archiveAccount: (id: string, archived: boolean) => Promise<void>;
  saveCategory: (input: { id?: string; name: string; kind: Category["kind"]; icon: string; swatch: Category["swatch"] }) => Promise<void>;
  archiveCategory: (id: string, archived: boolean) => Promise<void>;
  mergeCategory: (fromId: string, toId: string) => Promise<void>;
  moveCategory: (id: string, dir: -1 | 1) => Promise<void>;
  saveBudget: (input: Omit<Budget, "id" | "createdAt" | "updatedAt" | "deletedAt" | "version" | "fired"> & { id?: string }) => Promise<void>;
  deleteBudget: (id: string) => Promise<void>;
  saveGoal: (input: Omit<Goal, "id" | "createdAt" | "updatedAt" | "deletedAt" | "version"> & { id?: string }) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  saveRule: (input: Omit<RecurringRule, "id" | "createdAt" | "updatedAt" | "deletedAt" | "version"> & { id?: string }) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
  confirmInbox: (id: string, amountMinor?: number) => Promise<void>;
  skipInbox: (id: string) => Promise<void>;
  dismissInbox: (id: string) => Promise<void>;
  saveRate: (base: string, quote: string, rateE8: string) => Promise<void>;
  deleteRate: (id: string) => Promise<void>;
  applyRevalue: (next: string, rates: { currency: string; rateE8: string }[]) => Promise<{ ok: true } | { ok: false; missing: string[] }>;
  replaceData: (data: AppData) => Promise<void>;
  resetAll: () => Promise<void>;
  selectDate: (iso: string) => void;
  nudgeBackup: (hide: boolean) => Promise<void>;
  markBackup: () => Promise<void>;
  importTransactions: (rows: Transaction[]) => Promise<void>;
};

let chain: Promise<unknown> = Promise.resolve();
let noticeSeq = 1;
let booted: Promise<void> | null = null;

function enqueue(task: () => Promise<void>): Promise<void> {
  const run = chain.then(task, task);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function shellFrom(data: AppData): AppData {
  return freshData({
    locale: data.settings.locale,
    theme: data.settings.theme,
    baseCurrency: data.settings.baseCurrency,
    easternDigits: data.settings.easternDigits,
    firstDayOfWeek: data.settings.firstDayOfWeek,
    numberFormat: data.settings.numberFormat,
    hasPin: true,
    biometricsEnabled: data.settings.biometricsEnabled,
    lockTimeoutSec: data.settings.lockTimeoutSec,
    onboarded: true,
  });
}

async function write(data: AppData): Promise<"ok" | "quota" | "locked"> {
  const engine = applyEngines(data);
  return persistData(engine).then((result) => result);
}

export const useMasroof = create<State>((set, get) => ({
  ready: false,
  unlocked: false,
  problem: null,
  lockout: { attempts: 0, until: null },
  hasBio: false,
  data: freshData(),
  notice: null,
  undoSnapshot: null,
  selectedDate: todayIso(),
  addIntent: null,

  boot: () => {
    if (!booted) {
      booted = (async () => {
        const loaded = loadVault();
        if (loaded.kind === "corrupt" || loaded.kind === "newer") {
          set({ ready: true, problem: loaded.kind, unlocked: false });
          return;
        }
        if (loaded.kind === "locked") {
          const prefs = detectDefaults();
          set({
            ready: true,
            unlocked: false,
            hasBio: loaded.hasBio,
            lockout: loaded.lockout,
            data: freshData({
              locale: prefs.locale,
              theme: "system",
              baseCurrency: prefs.currency,
              firstDayOfWeek: prefs.weekStart,
              onboarded: true,
              hasPin: true,
            }),
            selectedDate: todayIso(),
          });
          return;
        }
        const detected = detectDefaults();
        let data = loaded.kind === "empty" ? freshData({ locale: detected.locale, baseCurrency: detected.currency, firstDayOfWeek: detected.weekStart }) : withDefaults(loaded.data);
        if (!data.settings.onboarded && loaded.kind === "empty") {
          mirrorPrefs(data.settings);
        }
        data = applyEngines(data);
        await persistData(data);
        set({ ready: true, unlocked: true, data, problem: null, selectedDate: todayIso() });
      })();
    }
    return booted;
  },

  patchSettings: (partial) =>
    enqueue(async () => {
      const data = applyEngines({ ...get().data, settings: { ...get().data.settings, ...partial } });
      mirrorPrefs(data.settings);
      const wrote = await persistData(data);
      if (wrote === "ok") set({ data });
    }),

  finishOnboarding: (choice) =>
    enqueue(async () => {
      let data = buildOnboarding(get().data, choice);
      data = applyEngines(data);
      if (choice.pin) data = { ...data, settings: { ...data.settings, hasPin: true } };
      const wrote = choice.pin ? await enablePin(choice.pin, data) : await persistData(data);
      if (wrote === "ok") set({ data, unlocked: true, notice: { id: ++noticeSeq, key: choice.sample ? "sampleReady" : "saved", undo: false } });
    }),

  unlockPin: async (pin) => {
    const result = await unlockWithPin(pin);
    if (!result.ok) {
      set({ lockout: result.lockout });
      return result.reason === "cooldown" ? "cooldown" : "bad";
    }
    const data = applyEngines(result.data);
    await persistData(data);
    set({ data, unlocked: true, lockout: { attempts: 0, until: null }, problem: null, selectedDate: todayIso() });
    return "ok";
  },

  unlockBio: async () => {
    const result = await unlockWithBiometrics();
    if (!result.ok) return false;
    const data = applyEngines(result.data);
    await persistData(data);
    set({ data, unlocked: true, lockout: { attempts: 0, until: null }, selectedDate: todayIso() });
    return true;
  },

  lock: async () => {
    if (!get().data.settings.hasPin || !get().unlocked) return;
    await persistData(get().data);
    lockSession();
    const current = get().data;
    set({ unlocked: false, data: shellFrom(current), undoSnapshot: null, addIntent: null, notice: null });
  },

  setPin: async (pin) => {
    const data = { ...get().data, settings: { ...get().data.settings, hasPin: true } };
    const wrote = await enablePin(pin, data);
    if (wrote !== "ok") return false;
    set({ data });
    return true;
  },

  changePin: async (oldPin, next) => {
    const ok = await vaultChangePin(oldPin, next);
    return ok;
  },

  clearPin: async (pin) => {
    const data = { ...get().data, settings: { ...get().data.settings, hasPin: false, biometricsEnabled: false } };
    const ok = await disablePin(pin, data);
    if (!ok) return false;
    set({ data, hasBio: false });
    return true;
  },

  turnOnBio: async () => {
    const ok = await enableBiometrics();
    if (!ok) return false;
    const data = { ...get().data, settings: { ...get().data.settings, biometricsEnabled: true } };
    await persistData(data);
    set({ data, hasBio: true });
    return true;
  },

  turnOffBio: async () => {
    await disableBiometrics();
    const data = { ...get().data, settings: { ...get().data.settings, biometricsEnabled: false } };
    await persistData(data);
    set({ data, hasBio: false });
  },

  openAdd: (intent) =>
    set({
      addIntent: {
        type: intent?.type ?? "expense",
        editingId: intent?.editingId ?? null,
        series: intent?.series ?? null,
      },
    }),
  closeAdd: () => set({ addIntent: null }),

  saveDraft: (draft) => {
    const data = { ...get().data, settings: { ...get().data.settings, draft } };
    set({ data });
    void persistData(data);
  },

  dismissNotice: () => set({ notice: null, undoSnapshot: null }),

  selectDate: (iso) => set({ selectedDate: iso }),

  saveTransaction: (input) => {
    let result: { ok: true; attachmentFailed?: boolean } | { ok: false; error: Key } = { ok: false, error: "errorGeneric" };
    return enqueue(async () => {
      const nowIso = new Date().toISOString();
      const today = todayIso();
      const current = get().data;
      const account = current.accounts.find((a) => a.id === input.accountId && !a.deletedAt);
      if (!account) {
        result = { ok: false, error: "errorGeneric" };
        set({ notice: { id: ++noticeSeq, key: "errorGeneric", undo: false } });
        return;
      }
      if (input.type === "transfer") {
        const dest = current.accounts.find((a) => a.id === input.toAccountId);
        const block = transferBlock(account, dest);
        if (block) {
          const key: Key = block === "same" ? "sameAccount" : block === "archived" ? "archivedAccount" : "needTwo";
          result = { ok: false, error: key };
          set({ notice: { id: ++noticeSeq, key, undo: false } });
          return;
        }
      }
      const existing = input.id ? current.transactions.find((tx) => tx.id === input.id) : undefined;
      const status = input.localDate > today ? "scheduled" : "posted";
      let tx: Transaction = existing
        ? touch(
            {
              ...existing,
              type: input.type,
              accountId: input.accountId,
              toAccountId: input.toAccountId ?? null,
              amountMinor: input.amountMinor,
              accountAmountMinor: input.accountAmountMinor,
              toAmountMinor: input.toAmountMinor ?? null,
              currency: input.currency,
              toCurrency: input.toCurrency ?? null,
              fxRateE8: input.fxRateE8,
              baseAmountMinor: input.baseAmountMinor,
              localDate: input.localDate,
              payee: input.payee,
              note: input.note,
              tags: input.tags,
              status: existing.status === "void" ? "void" : status,
              splits: input.splits.map((split) => ({ ...split, id: uid() })),
              attachments: input.attachments,
              seriesDetached: input.series === "one" ? true : existing.seriesDetached,
            },
            nowIso,
          )
        : {
            ...stamp(nowIso),
            type: input.type,
            accountId: input.accountId,
            toAccountId: input.toAccountId ?? null,
            amountMinor: input.amountMinor,
            accountAmountMinor: input.accountAmountMinor,
            toAmountMinor: input.toAmountMinor ?? null,
            currency: input.currency,
            toCurrency: input.toCurrency ?? null,
            fxRateE8: input.fxRateE8,
            baseAmountMinor: input.type === "transfer" ? 0 : input.baseAmountMinor,
            localDate: input.localDate,
            occurredAt: nowIso,
            occurredTz: zoneName(),
            payee: input.payee,
            note: input.note,
            tags: input.tags,
            status,
            recurringRuleId: null,
            occurrenceKey: null,
            seriesDetached: false,
            splits: input.splits.map((split) => ({ ...split, id: uid() })),
            attachments: input.attachments,
          };
      let rules = current.rules;
      if (existing && input.series === "future" && existing.recurringRuleId) {
        tx = { ...tx, recurringRuleId: existing.recurringRuleId, occurrenceKey: existing.occurrenceKey, seriesDetached: false };
        rules = rules.map((rule) =>
          rule.id === existing.recurringRuleId
            ? touch(
                {
                  ...rule,
                  template: {
                    ...rule.template,
                    amountMinor: input.amountMinor,
                    accountId: input.accountId,
                    categoryId: input.splits[0]?.categoryId ?? rule.template.categoryId,
                    note: input.note,
                    payee: input.payee,
                    tags: input.tags,
                    currency: input.currency,
                  },
                },
                nowIso,
              )
            : rule,
        );
      }
      let transactions = existing
        ? current.transactions.map((row) => (row.id === tx.id ? tx : row))
        : [tx, ...current.transactions];
      if (existing && input.series === "future" && existing.recurringRuleId) {
        transactions = transactions.map((row) => {
          if (row.recurringRuleId !== existing.recurringRuleId || row.seriesDetached || row.deletedAt) return row;
          if (row.localDate < existing.localDate) return row;
          if (row.id === tx.id) return tx;
          return touch(
            {
              ...row,
              amountMinor: input.amountMinor,
              accountAmountMinor: input.accountAmountMinor,
              baseAmountMinor: input.type === "transfer" ? 0 : input.baseAmountMinor,
              note: input.note,
              payee: input.payee,
              tags: input.tags,
              splits: input.splits.map((split) => ({ ...split, id: uid() })),
            },
            nowIso,
          );
        });
      }
      const recent = input.splits[0]?.categoryId
        ? [input.splits[0].categoryId, ...current.settings.recentCategoryIds.filter((id) => id !== input.splits[0]?.categoryId)].slice(0, 8)
        : current.settings.recentCategoryIds;
      const lastAmount = { ...current.settings.lastAmountByCategory };
      if (input.splits[0]?.categoryId && input.type !== "transfer") {
        lastAmount[input.splits[0].categoryId] = { minor: input.amountMinor, currency: input.currency };
      }
      let data: AppData = {
        ...current,
        transactions,
        rules,
        settings: {
          ...current.settings,
          lastAccountId: input.accountId,
          recentCategoryIds: recent,
          lastAmountByCategory: lastAmount,
          draft: null,
        },
      };
      data = pushAudit(data, { entity: "transaction", entityId: tx.id, action: existing ? "update" : "create", at: nowIso, version: tx.version });
      data = applyEngines(data);
      let wrote = await persistData(data);
      let attachmentFailed = false;
      if (wrote === "quota") {
        const stripped: AppData = {
          ...data,
          transactions: data.transactions.map((row) => (row.id === tx.id ? { ...row, attachments: existing?.attachments ?? [] } : row)),
        };
        wrote = await persistData(stripped);
        data = stripped;
        attachmentFailed = true;
      }
      if (wrote !== "ok") {
        result = { ok: false, error: "quota" };
        set({ notice: { id: ++noticeSeq, key: "quota", undo: false } });
        return;
      }
      result = { ok: true, attachmentFailed };
      set({
        data,
        addIntent: null,
        undoSnapshot: null,
        notice: { id: ++noticeSeq, key: attachmentFailed ? "photoSkipped" : existing ? "editedOk" : "savedOk", undo: false },
        selectedDate: input.localDate,
      });
    }).then(() => result);
  },

  deleteTransaction: (id) =>
    enqueue(async () => {
      const current = get().data;
      const nowIso = new Date().toISOString();
      const snapshot = structuredClone(current);
      const transactions = current.transactions.map((tx) => (tx.id === id ? touch({ ...tx, deletedAt: nowIso }, nowIso) : tx));
      let data: AppData = { ...current, transactions };
      data = pushAudit(data, { entity: "transaction", entityId: id, action: "delete", at: nowIso, version: 0 });
      data = applyEngines(data);
      const wrote = await persistData(data);
      if (wrote !== "ok") return;
      set({ data, undoSnapshot: snapshot, notice: { id: ++noticeSeq, key: "deleted", undo: true } });
    }),

  undo: () =>
    enqueue(async () => {
      const snapshot = get().undoSnapshot;
      if (!snapshot) return;
      const wrote = await persistData(snapshot);
      if (wrote !== "ok") return;
      set({ data: snapshot, undoSnapshot: null, notice: { id: ++noticeSeq, key: "broughtBack", undo: false } });
    }),

  restoreTransaction: (id) =>
    enqueue(async () => {
      const nowIso = new Date().toISOString();
      const transactions = get().data.transactions.map((tx) => (tx.id === id ? touch({ ...tx, deletedAt: null }, nowIso) : tx));
      let data: AppData = pushAudit({ ...get().data, transactions }, { entity: "transaction", entityId: id, action: "restore", at: nowIso, version: 0 });
      data = applyEngines(data);
      await persistData(data);
      set({ data, notice: { id: ++noticeSeq, key: "broughtBack", undo: false } });
    }),

  purgeTrash: () =>
    enqueue(async () => {
      const data = applyEngines({
        ...get().data,
        transactions: get().data.transactions.filter((tx) => !tx.deletedAt),
        accounts: get().data.accounts.filter((row) => !row.deletedAt),
        categories: get().data.categories.filter((row) => !row.deletedAt),
        budgets: get().data.budgets.filter((row) => !row.deletedAt),
        goals: get().data.goals.filter((row) => !row.deletedAt),
        rules: get().data.rules.filter((row) => !row.deletedAt),
      });
      await persistData(data);
      set({ data, notice: { id: ++noticeSeq, key: "saved", undo: false } });
    }),

  saveAccount: (input) =>
    enqueue(async () => {
      const nowIso = new Date().toISOString();
      const current = get().data;
      const existing = input.id ? current.accounts.find((a) => a.id === input.id) : undefined;
      const row: Account = existing
        ? touch({ ...existing, ...input, id: existing.id }, nowIso)
        : { ...stamp(nowIso), ...input, id: input.id ?? uid(), deletedAt: null };
      const accounts = existing ? current.accounts.map((a) => (a.id === row.id ? row : a)) : [row, ...current.accounts];
      const data = applyEngines(pushAudit({ ...current, accounts }, { entity: "account", entityId: row.id, action: existing ? "update" : "create", at: nowIso, version: row.version }));
      await persistData(data);
      set({ data, notice: { id: ++noticeSeq, key: "saved", undo: false } });
    }),

  archiveAccount: (id, archived) =>
    enqueue(async () => {
      const nowIso = new Date().toISOString();
      const accounts = get().data.accounts.map((a) => (a.id === id ? touch({ ...a, isArchived: archived }, nowIso) : a));
      const data = applyEngines({ ...get().data, accounts });
      await persistData(data);
      set({ data, notice: { id: ++noticeSeq, key: archived ? "archivedOk" : "broughtBack", undo: false } });
    }),

  saveCategory: (input) =>
    enqueue(async () => {
      const nowIso = new Date().toISOString();
      const current = get().data;
      const existing = input.id ? current.categories.find((c) => c.id === input.id) : undefined;
      const row: Category = existing
        ? touch({ ...existing, name: input.name, kind: input.kind, icon: input.icon, swatch: input.swatch, nameKey: existing.isSystem ? existing.nameKey : null }, nowIso)
        : {
            ...stamp(nowIso),
            name: input.name,
            nameKey: null,
            kind: input.kind,
            parentId: null,
            icon: input.icon,
            swatch: input.swatch,
            isSystem: false,
            isArchived: false,
            sortOrder: current.categories.length + 1,
          };
      const categories = existing ? current.categories.map((c) => (c.id === row.id ? row : c)) : [...current.categories, row];
      const data = applyEngines({ ...current, categories });
      await persistData(data);
      set({ data, notice: { id: ++noticeSeq, key: "saved", undo: false } });
    }),

  archiveCategory: (id, archived) =>
    enqueue(async () => {
      const nowIso = new Date().toISOString();
      const categories = get().data.categories.map((c) => (c.id === id ? touch({ ...c, isArchived: archived }, nowIso) : c));
      const data = applyEngines({ ...get().data, categories });
      await persistData(data);
      set({ data });
    }),

  mergeCategory: (fromId, toId) =>
    enqueue(async () => {
      if (fromId === toId) return;
      const nowIso = new Date().toISOString();
      const current = get().data;
      const transactions = current.transactions.map((tx) => ({
        ...tx,
        splits: tx.splits.map((split) => (split.categoryId === fromId ? { ...split, categoryId: toId } : split)),
      }));
      const target = current.budgets.find((b) => b.categoryId === toId && !b.deletedAt);
      const source = current.budgets.find((b) => b.categoryId === fromId && !b.deletedAt);
      let budgets = current.budgets.map((b) => {
        if (b.categoryId !== fromId) return b;
        if (target && source && b.id === source.id) return touch({ ...b, deletedAt: nowIso }, nowIso);
        return touch({ ...b, categoryId: toId }, nowIso);
      });
      if (target && source) {
        budgets = budgets.map((b) => (b.id === target.id ? touch({ ...b, amountMinor: b.amountMinor + source.amountMinor }, nowIso) : b));
      }
      const rules = current.rules.map((rule) =>
        rule.template.categoryId === fromId ? touch({ ...rule, template: { ...rule.template, categoryId: toId } }, nowIso) : rule,
      );
      const categories = current.categories.map((c) => (c.id === fromId ? touch({ ...c, isArchived: true }, nowIso) : c));
      const data = applyEngines({ ...current, transactions, budgets, rules, categories });
      await persistData(data);
      set({ data, notice: { id: ++noticeSeq, key: "mergeDone", undo: false } });
    }),

  moveCategory: (id, dir) =>
    enqueue(async () => {
      const categories = [...get().data.categories].sort((a, b) => a.sortOrder - b.sortOrder);
      const index = categories.findIndex((c) => c.id === id);
      const swap = index + dir;
      if (index < 0 || swap < 0 || swap >= categories.length) return;
      const a = categories[index]!;
      const b = categories[swap]!;
      const updated = get().data.categories.map((c) => {
        if (c.id === a.id) return { ...c, sortOrder: b.sortOrder };
        if (c.id === b.id) return { ...c, sortOrder: a.sortOrder };
        return c;
      });
      const data = { ...get().data, categories: updated };
      await persistData(data);
      set({ data });
    }),

  saveBudget: (input) =>
    enqueue(async () => {
      const nowIso = new Date().toISOString();
      const current = get().data;
      const existing = input.id ? current.budgets.find((b) => b.id === input.id) : undefined;
      const row: Budget = existing
        ? touch({ ...existing, ...input, id: existing.id, fired: existing.fired }, nowIso)
        : { ...stamp(nowIso), ...input, fired: [] };
      const budgets = existing ? current.budgets.map((b) => (b.id === row.id ? row : b)) : [row, ...current.budgets];
      const data = applyEngines({ ...current, budgets });
      await persistData(data);
      set({ data, notice: { id: ++noticeSeq, key: "budgetSaved", undo: false } });
    }),

  deleteBudget: (id) =>
    enqueue(async () => {
      const nowIso = new Date().toISOString();
      const budgets = get().data.budgets.map((b) => (b.id === id ? touch({ ...b, deletedAt: nowIso }, nowIso) : b));
      const data = applyEngines({ ...get().data, budgets });
      await persistData(data);
      set({ data });
    }),

  saveGoal: (input) =>
    enqueue(async () => {
      const nowIso = new Date().toISOString();
      const current = get().data;
      const existing = input.id ? current.goals.find((g) => g.id === input.id) : undefined;
      const row: Goal = existing ? touch({ ...existing, ...input, id: existing.id }, nowIso) : { ...stamp(nowIso), ...input };
      const goals = existing ? current.goals.map((g) => (g.id === row.id ? row : g)) : [row, ...current.goals];
      const data = { ...current, goals };
      await persistData(data);
      set({ data, notice: { id: ++noticeSeq, key: "goalSaved", undo: false } });
    }),

  deleteGoal: (id) =>
    enqueue(async () => {
      const nowIso = new Date().toISOString();
      const goals = get().data.goals.map((g) => (g.id === id ? touch({ ...g, deletedAt: nowIso }, nowIso) : g));
      const data = { ...get().data, goals };
      await persistData(data);
      set({ data });
    }),

  saveRule: (input) =>
    enqueue(async () => {
      const nowIso = new Date().toISOString();
      const current = get().data;
      const existing = input.id ? current.rules.find((r) => r.id === input.id) : undefined;
      const row: RecurringRule = existing ? touch({ ...existing, ...input, id: existing.id }, nowIso) : { ...stamp(nowIso), ...input };
      const rules = existing ? current.rules.map((r) => (r.id === row.id ? row : r)) : [row, ...current.rules];
      const data = applyEngines({ ...current, rules });
      await persistData(data);
      set({ data, notice: { id: ++noticeSeq, key: "ruleSaved", undo: false } });
    }),

  deleteRule: (id) =>
    enqueue(async () => {
      const nowIso = new Date().toISOString();
      const rules = get().data.rules.map((r) => (r.id === id ? touch({ ...r, deletedAt: nowIso }, nowIso) : r));
      const data = { ...get().data, rules };
      await persistData(data);
      set({ data });
    }),

  confirmInbox: (id, amountMinor) =>
    enqueue(async () => {
      const current = get().data;
      const item = current.inbox.find((row) => row.id === id);
      if (!item || !item.localDate || !item.accountId || !item.currency || !item.txType) return;
      const amount = amountMinor ?? item.amountMinor ?? 0;
      if (amount <= 0) return;
      const nowIso = new Date().toISOString();
      const today = todayIso();
      const baseCurrency = current.settings.baseCurrency;
      const same = item.currency === baseCurrency;
      const tx: Transaction = {
        ...stamp(nowIso),
        type: item.txType,
        accountId: item.accountId,
        toAccountId: item.toAccountId ?? null,
        amountMinor: amount,
        accountAmountMinor: amount,
        toAmountMinor: item.txType === "transfer" ? amount : null,
        currency: item.currency,
        toCurrency: null,
        fxRateE8: same ? "100000000" : "100000000",
        baseAmountMinor: item.txType === "transfer" ? 0 : amount,
        localDate: item.localDate,
        occurredAt: nowIso,
        occurredTz: zoneName(),
        payee: item.payee ?? "",
        note: item.note ?? "",
        tags: item.tags ?? [],
        status: item.localDate > today ? "scheduled" : "posted",
        recurringRuleId: item.ruleId ?? null,
        occurrenceKey: item.occurrenceKey ?? null,
        seriesDetached: false,
        splits: item.categoryId ? [{ id: uid(), categoryId: item.categoryId, amountMinor: amount, note: "" }] : [],
        attachments: [],
      };
      const key = item.occurrenceKey;
      const data = applyEngines({
        ...current,
        transactions: [tx, ...current.transactions],
        inbox: current.inbox.filter((row) => row.id !== id),
        settledKeys: key ? [...current.settledKeys, key].slice(-2000) : current.settledKeys,
      });
      await persistData(data);
      set({ data, notice: { id: ++noticeSeq, key: "savedOk", undo: false } });
    }),

  skipInbox: (id) =>
    enqueue(async () => {
      const current = get().data;
      const item = current.inbox.find((row) => row.id === id);
      const key = item?.occurrenceKey;
      const data = {
        ...current,
        inbox: current.inbox.filter((row) => row.id !== id),
        settledKeys: key ? [...current.settledKeys, key].slice(-2000) : current.settledKeys,
      };
      await persistData(data);
      set({ data });
    }),

  dismissInbox: (id) =>
    enqueue(async () => {
      const inbox = get().data.inbox.map((row) => (row.id === id ? { ...row, read: true } : row));
      const data = { ...get().data, inbox };
      await persistData(data);
      set({ data });
    }),

  saveRate: (base, quote, rateE8) =>
    enqueue(async () => {
      const nowIso = new Date().toISOString();
      const rates = get().data.rates.filter((r) => !(r.base === base && r.quote === quote));
      rates.unshift({ id: uid(), base, quote, rateE8, asOf: nowIso, source: "manual" });
      const data = { ...get().data, rates };
      await persistData(data);
      set({ data, notice: { id: ++noticeSeq, key: "rateSaved", undo: false } });
    }),

  deleteRate: (id) =>
    enqueue(async () => {
      const data = { ...get().data, rates: get().data.rates.filter((r) => r.id !== id) };
      await persistData(data);
      set({ data });
    }),

  applyRevalue: async (next, rates) => {
    const result = revalue(get().data, next, rates);
    if (!result.ok) return result;
    const data = applyEngines(result.data);
    await persistData(data);
    set({ data, notice: { id: ++noticeSeq, key: "baseUpdated", undo: false } });
    return { ok: true };
  },

  replaceData: (incoming) =>
    enqueue(async () => {
      const keepPin = get().data.settings.hasPin;
      let data = withDefaults({ ...incoming, settings: { ...incoming.settings, hasPin: keepPin, biometricsEnabled: keepPin ? get().data.settings.biometricsEnabled : false } });
      data = applyEngines(data);
      await persistData(data);
      set({ data, notice: { id: ++noticeSeq, key: "restored", undo: false }, addIntent: null });
    }),

  resetAll: () =>
    enqueue(async () => {
      await wipeVault();
      const detected = detectDefaults();
      const data = freshData({ locale: detected.locale, baseCurrency: detected.currency, firstDayOfWeek: detected.weekStart });
      await persistData(data);
      set({
        data,
        unlocked: true,
        hasBio: false,
        lockout: { attempts: 0, until: null },
        undoSnapshot: null,
        notice: { id: ++noticeSeq, key: "resetDone", undo: false },
        problem: null,
        addIntent: null,
      });
    }),

  nudgeBackup: (hide) =>
    enqueue(async () => {
      const data = { ...get().data, settings: { ...get().data.settings, backupNudged: hide } };
      await persistData(data);
      set({ data });
    }),

  markBackup: () =>
    enqueue(async () => {
      const data = { ...get().data, settings: { ...get().data.settings, lastBackupAt: new Date().toISOString(), backupNudged: true } };
      await persistData(data);
      set({ data, notice: { id: ++noticeSeq, key: "backupSaved", undo: false } });
    }),

  importTransactions: (rows) =>
    enqueue(async () => {
      const nowIso = new Date().toISOString();
      let data: AppData = { ...get().data, transactions: [...rows, ...get().data.transactions] };
      data = pushAudit(data, { entity: "transaction", entityId: "import", action: "create", at: nowIso, version: rows.length });
      data = applyEngines(data);
      await persistData(data);
      set({ data, notice: { id: ++noticeSeq, key: "importDone", undo: false } });
    }),
}));

export function categoryLabel(cat: Category | undefined, t: (key: Key) => string): string {
  if (!cat) return t("uncategorized");
  if (cat.name.trim()) return cat.name;
  if (cat.nameKey) return t(cat.nameKey as Key);
  return t("uncategorized");
}

export function storageBytes(data: AppData): number {
  try {
    return new Blob([JSON.stringify(data)]).size;
  } catch {
    return JSON.stringify(data).length;
  }
}

export function photoCount(data: AppData): number {
  return data.transactions.reduce((sum, tx) => sum + (tx.deletedAt ? 0 : tx.attachments.length), 0);
}
