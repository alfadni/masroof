import { useMemo, useState } from "react";
import { CURRENCIES, currencyInfo, exponent } from "@/masroof/catalog";
import { mapCsv, toCsv } from "@/masroof/csv";
import { decryptBackup, encryptBackup } from "@/masroof/crypto";
import { addMonths, monthRange, todayIso } from "@/masroof/dates";
import { accountBalance, categorySums, currenciesInUse, duplicateKey, monthFlow, netWorth, revalue, stamp, uid } from "@/masroof/engine";
import { decimalToE8, e8ToDecimal, expressionToMinor, formatMinor, majorStringToMinor, minorToInput } from "@/masroof/money";
import { categoryLabel, photoCount, storageBytes, useMasroof } from "@/masroof/store";
import { freshData, withDefaults } from "@/masroof/seed";
import type { AccountType, AppData, Swatch, Transaction, TxType } from "@/masroof/types";
import { AppIcon } from "@/components/masroof/icons";
import type { Nav } from "@/components/masroof/nav";
import { shareOrDownload } from "@/components/masroof/photos";
import { EmptyState, fieldClass, MoneyText, PrimaryButton, QuietButton, RowButton, Screen, useI18n } from "@/components/masroof/ui";

const ICONS = ["Receipt", "Car", "House", "Baby", "Shirt", "Utensils", "Fuel", "Clapperboard", "HeartPulse", "Banknote", "Wallet", "CircleDollarSign"];
const SWATCHES: Swatch[] = ["pine", "clay", "sand", "sage"];
const TYPES: AccountType[] = ["cash", "bank", "mobile_wallet", "card", "savings", "other"];

export function More({ nav }: { nav: Nav }) {
  const { t } = useI18n();
  return (
    <div className="px-4 pt-5">
      <h1 className="font-display text-3xl">{t("more")}</h1>
      <div className="mt-4">
        <RowButton label={t("accounts")} onClick={() => nav.push({ id: "accounts" })} />
        <RowButton label={t("reports")} onClick={() => nav.push({ id: "reports" })} />
        <RowButton label={t("categories")} onClick={() => nav.push({ id: "categories" })} />
        <RowButton label={t("rates")} onClick={() => nav.push({ id: "rates" })} />
        <RowButton label={t("calculator")} onClick={() => nav.push({ id: "calculator" })} />
        <RowButton label={t("inbox")} onClick={() => nav.push({ id: "inbox" })} />
        <RowButton label={t("settings")} onClick={() => nav.push({ id: "settings" })} />
        <RowButton label={t("privacy")} onClick={() => nav.push({ id: "privacy" })} />
      </div>
    </div>
  );
}

export function SettingsScreen({ nav }: { nav: Nav }) {
  const { t, settings } = useI18n();
  const data = useMasroof((s) => s.data);
  const patch = useMasroof((s) => s.patchSettings);
  const setPin = useMasroof((s) => s.setPin);
  const change = useMasroof((s) => s.changePin);
  const clear = useMasroof((s) => s.clearPin);
  const bioOn = useMasroof((s) => s.turnOnBio);
  const bioOff = useMasroof((s) => s.turnOffBio);
  const [pin, setPinValue] = useState("");
  const [pin2, setPin2] = useState("");
  const [oldPin, setOld] = useState("");
  const [msg, setMsg] = useState("");
  const bytes = storageBytes(data);
  const photos = photoCount(data);
  return (
    <Screen title={t("settings")} onBack={nav.pop}>
      <p className="text-sm text-muted">{t("appearance")}</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {(["light", "dark", "system"] as const).map((theme) => (
          <button key={theme} type="button" className={`h-11 rounded-full border ${settings.theme === theme ? "border-accent bg-accent text-accent-fg" : "border-line"}`} onClick={() => void patch({ theme })}>{t(theme)}</button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className={`h-11 rounded-full border ${settings.locale === "en" ? "border-accent bg-accent text-accent-fg" : "border-line"}`} onClick={() => void patch({ locale: "en" })}>{t("langEnglish")}</button>
        <button type="button" className={`h-11 rounded-full border ${settings.locale === "ar" ? "border-accent bg-accent text-accent-fg" : "border-line"}`} onClick={() => void patch({ locale: "ar" })}>{t("langArabic")}</button>
      </div>
      <label className="mt-4 block text-sm text-muted">{t("weekStart")}
        <select className={`${fieldClass} mt-1`} value={settings.firstDayOfWeek} onChange={(e) => void patch({ firstDayOfWeek: Number(e.target.value) as 0 | 1 | 6 })}>
          <option value={0}>{t("sunday")}</option>
          <option value={1}>{t("monday")}</option>
          <option value={6}>{t("saturday")}</option>
        </select>
      </label>
      <label className="mt-3 block text-sm text-muted">{t("numberFormat")}
        <select className={`${fieldClass} mt-1`} value={settings.numberFormat} onChange={(e) => void patch({ numberFormat: e.target.value as typeof settings.numberFormat })}>
          <option value="comma">{t("formatComma")}</option>
          <option value="dot">{t("formatDot")}</option>
          <option value="space">{t("formatSpace")}</option>
        </select>
      </label>
      <label className="mt-3 flex min-h-12 items-center justify-between gap-3 text-sm">
        <span>{t("easternDigits")}</span>
        <input type="checkbox" checked={settings.easternDigits} onChange={(e) => void patch({ easternDigits: e.target.checked })} />
      </label>
      <label className="mt-3 block text-sm text-muted">{t("lockTimeout")}
        <select className={`${fieldClass} mt-1`} value={settings.lockTimeoutSec} onChange={(e) => void patch({ lockTimeoutSec: Number(e.target.value) })}>
          <option value={1}>{t("immediately")}</option>
          <option value={60}>{t("oneMin")}</option>
          <option value={300}>{t("fiveMin")}</option>
          <option value={900}>{t("fifteen")}</option>
          <option value={0}>{t("never")}</option>
        </select>
      </label>
      <div className="mt-6 border-t border-line pt-4">
        <p className="text-sm text-muted">{t("security")}</p>
        <p className="mt-1 text-sm">{settings.hasPin ? t("pinOn") : t("pinOff")}</p>
        {!settings.hasPin ? (
          <div className="mt-2 grid gap-2">
            <input className={fieldClass} inputMode="numeric" value={pin} onChange={(e) => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder={t("pinNew")} />
            <input className={fieldClass} inputMode="numeric" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder={t("pinAgain")} />
            <PrimaryButton onClick={async () => {
              if (pin.length < 4 || pin !== pin2) return setMsg(t("pinMismatch"));
              const ok = await setPin(pin);
              setMsg(ok ? t("pinUpdated") : t("failed"));
            }}>{t("setPin")}</PrimaryButton>
          </div>
        ) : (
          <div className="mt-2 grid gap-2">
            <input className={fieldClass} inputMode="numeric" value={oldPin} onChange={(e) => setOld(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder={t("pinCurrent")} />
            <input className={fieldClass} inputMode="numeric" value={pin} onChange={(e) => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder={t("pinNew")} />
            <QuietButton onClick={async () => setMsg((await change(oldPin, pin)) ? t("pinUpdated") : t("wrongOld"))}>{t("changePin")}</QuietButton>
            <button type="button" className="h-11 text-expense" onClick={async () => setMsg((await clear(oldPin)) ? t("pinRemoved") : t("wrongOld"))}>{t("removePin")}</button>
            <QuietButton onClick={async () => setMsg((await bioOn()) ? t("bioSaved") : t("bioNo"))}>{t("biometrics")}</QuietButton>
            {settings.biometricsEnabled ? <button type="button" className="h-11 text-sm" onClick={() => void bioOff()}>{t("bioOff")}</button> : null}
          </div>
        )}
        {msg ? <p className="mt-2 text-sm" role="status">{msg}</p> : null}
        <p className="mt-2 text-sm text-muted">{t("neverWipes")}</p>
      </div>
      <div className="mt-6 border-t border-line pt-4">
        <RowButton label={t("baseCurrency")} hint={settings.baseCurrency} onClick={() => nav.push({ id: "revalue" })} />
        <RowButton label={t("backup")} onClick={() => nav.push({ id: "backup" })} />
        <RowButton label={t("importCsv")} onClick={() => nav.push({ id: "import" })} />
        <RowButton label={t("trash")} onClick={() => nav.push({ id: "trash" })} />
        <RowButton label={t("reset")} danger onClick={() => nav.push({ id: "reset" })} />
        <p className="mt-4 text-sm text-muted">{t("storageUsed")}: {Math.round(bytes / 1024)} KB · {t("photosCount").replace("{count}", String(photos))}</p>
        {bytes > 3_500_000 ? <p className="text-sm text-warn">{t("storageWarn")}</p> : null}
      </div>
    </Screen>
  );
}

export function InboxScreen({ nav }: { nav: Nav }) {
  const { t, tf, money } = useI18n();
  const data = useMasroof((s) => s.data);
  const confirm = useMasroof((s) => s.confirmInbox);
  const skip = useMasroof((s) => s.skipInbox);
  const dismiss = useMasroof((s) => s.dismissInbox);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const items = data.inbox;
  return (
    <Screen title={t("inbox")} onBack={nav.pop}>
      {typeof Notification !== "undefined" && Notification.permission === "denied" ? <p className="mb-3 text-sm text-warn">{t("notifOff")}</p> : null}
      {items.length === 0 ? <EmptyState title={t("emptyInbox")} body={t("clockNote")} /> : items.map((item) => {
        const cat = data.categories.find((c) => c.id === item.categoryId);
        const name = item.kind === "budget" ? (item.categoryId ? categoryLabel(cat, t) : t("overall")) : item.payee || item.note || t("rules");
        const title = item.kind === "budget" ? tf("budgetNote", { name, threshold: item.threshold ?? 0 }) : item.kind === "posted" ? tf("postedNote", { name }) : item.kind === "remind" ? tf("remindNote", { name }) : tf("confirmNote", { name });
        return (
          <article key={item.id} className="mb-3 rounded-2xl border border-line p-4">
            <p className="font-medium">{title}</p>
            {item.localDate ? <p className="text-sm text-muted">{item.localDate}</p> : null}
            {item.amountMinor && item.currency ? <p className="mt-1 nums">{money(item.amountMinor, item.currency)}</p> : null}
            {item.kind === "confirm" ? (
              <div className="mt-3 grid gap-2">
                <input className={fieldClass} value={amounts[item.id] ?? (item.amountMinor && item.currency ? minorToInput(item.amountMinor, item.currency, "comma") : "")} onChange={(e) => setAmounts((m) => ({ ...m, [item.id]: e.target.value }))} aria-label={t("editAmount")} />
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="h-11 rounded-full bg-accent text-accent-fg" onClick={() => {
                    const raw = amounts[item.id];
                    const parsed = raw ? majorStringToMinor(raw, item.currency || data.settings.baseCurrency) : item.amountMinor;
                    void confirm(item.id, parsed ?? undefined);
                  }}>{t("post")}</button>
                  <button type="button" className="h-11 rounded-full border border-line" onClick={() => void skip(item.id)}>{t("skip")}</button>
                </div>
              </div>
            ) : (
              <button type="button" className="mt-3 h-10 text-sm text-muted" onClick={() => void dismiss(item.id)}>{t("markRead")}</button>
            )}
          </article>
        );
      })}
    </Screen>
  );
}

export function TxScreen({ nav, id }: { nav: Nav; id: string }) {
  const { t } = useI18n();
  const tx = useMasroof((s) => s.data.transactions.find((row) => row.id === id));
  const data = useMasroof((s) => s.data);
  const remove = useMasroof((s) => s.deleteTransaction);
  const openAdd = useMasroof((s) => s.openAdd);
  const [ask, setAsk] = useState(false);
  if (!tx || tx.deletedAt) return <Screen title={t("details")} onBack={nav.pop}><EmptyState title={t("noTx")} body={t("trashHint")} /></Screen>;
  const account = data.accounts.find((a) => a.id === tx.accountId);
  return (
    <Screen title={t("details")} onBack={nav.pop}>
      <p className="font-display text-4xl"><MoneyText minor={tx.amountMinor} currency={tx.currency} kind={tx.type === "transfer" ? "transfer" : tx.type} /></p>
      <p className="mt-2 text-sm text-muted">{tx.localDate} · {tx.status === "scheduled" ? t("scheduled") : t("posted")}</p>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between"><dt className="text-muted">{t("account")}</dt><dd>{account?.name}</dd></div>
        {tx.payee ? <div className="flex justify-between"><dt className="text-muted">{t("payee")}</dt><dd>{tx.payee}</dd></div> : null}
        {tx.note ? <div className="flex justify-between gap-4"><dt className="text-muted">{t("note")}</dt><dd className="text-end">{tx.note}</dd></div> : null}
        {tx.tags.length > 0 ? <div className="flex justify-between"><dt className="text-muted">{t("tags")}</dt><dd>{tx.tags.join(", ")}</dd></div> : null}
      </dl>
      {tx.splits.length > 0 ? (
        <ul className="mt-4 divide-y divide-line">
          {tx.splits.map((split) => (
            <li key={split.id} className="flex justify-between py-2 text-sm">
              <span>{categoryLabel(data.categories.find((c) => c.id === split.categoryId), t)}</span>
              <span className="nums">{formatMinor(split.amountMinor, tx.currency, data.settings)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {tx.type === "transfer" ? <p className="mt-3 text-sm text-muted">{t("transferNote")}</p> : null}
      <div className="mt-3 flex gap-2 overflow-x-auto">
        {tx.attachments.map((photo) => <img key={photo.id} src={photo.dataUrl} alt="" className="h-24 w-24 rounded-xl object-cover" />)}
      </div>
      <div className="mt-6 grid gap-2">
        <PrimaryButton onClick={() => { openAdd({ type: tx.type, editingId: tx.id }); }}>{t("editTx")}</PrimaryButton>
        {ask ? (
          <div className="rounded-2xl border border-line p-3">
            <p>{t("deleteAsk")}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" className="h-11 rounded-full bg-expense text-accent-fg" onClick={() => { void remove(tx.id); nav.pop(); }}>{t("toTrash")}</button>
              <button type="button" className="h-11" onClick={() => setAsk(false)}>{t("keep")}</button>
            </div>
          </div>
        ) : <button type="button" className="h-11 text-expense" onClick={() => setAsk(true)}>{t("deleteTx")}</button>}
      </div>
    </Screen>
  );
}

export function AccountsScreen({ nav }: { nav: Nav }) {
  const { t } = useI18n();
  const accounts = useMasroof((s) => s.data.accounts.filter((a) => !a.deletedAt));
  const data = useMasroof((s) => s.data);
  return (
    <Screen title={t("accounts")} onBack={nav.pop} action={<button type="button" className="text-sm" onClick={() => nav.push({ id: "account" })}>{t("add")}</button>}>
      {accounts.length === 0 ? <EmptyState title={t("emptyAccounts")} body={t("accountHelp")} /> : (
        <ul className="divide-y divide-line">
          {accounts.map((account) => (
            <li key={account.id}>
              <button type="button" className="flex w-full items-center gap-3 py-3 text-start" onClick={() => nav.push({ id: "account", accountId: account.id })}>
                <span className="grid size-10 place-items-center rounded-full bg-surface"><AppIcon name={account.icon} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block">{account.name}{account.isArchived ? ` · ${t("archived")}` : ""}</span>
                  <span className="text-sm text-muted">{account.currency}</span>
                </span>
                <MoneyText minor={accountBalance(data, account)} currency={account.currency} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-sm text-muted">{t("positiveMeans")}</p>
    </Screen>
  );
}

export function AccountEditor({ nav, accountId }: { nav: Nav; accountId?: string }) {
  const { t, settings } = useI18n();
  const existing = useMasroof((s) => s.data.accounts.find((a) => a.id === accountId));
  const save = useMasroof((s) => s.saveAccount);
  const archive = useMasroof((s) => s.archiveAccount);
  const [name, setName] = useState(existing?.name ?? "");
  const [type, setType] = useState<AccountType>(existing?.type ?? "cash");
  const [currency, setCurrency] = useState(existing?.currency ?? settings.baseCurrency);
  const [opening, setOpening] = useState(existing ? minorToInput(existing.openingBalanceMinor, existing.currency, settings.numberFormat) : "0");
  const [openingDate, setOpeningDate] = useState(existing?.openingDate ?? todayIso());
  const [include, setInclude] = useState(existing?.includeInTotals ?? true);
  const [error, setError] = useState("");
  return (
    <Screen title={existing ? t("editAccount") : t("newAccount")} onBack={nav.pop}>
      <div className="grid gap-3">
        <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("name")} aria-label={t("name")} />
        <select className={fieldClass} value={type} onChange={(e) => setType(e.target.value as AccountType)} aria-label={t("type")}>
          {TYPES.map((item) => <option key={item} value={item}>{t(item === "mobile_wallet" ? "mobileWallet" : item)}</option>)}
        </select>
        <select className={fieldClass} value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label={t("currency")} disabled={Boolean(existing)}>
          {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
        </select>
        <input className={fieldClass} value={opening} onChange={(e) => setOpening(e.target.value)} aria-label={t("openingBalance")} />
        <input type="date" className={fieldClass} value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} aria-label={t("openingDate")} />
        <label className="flex items-center justify-between text-sm"><span>{t("includeTotals")}</span><input type="checkbox" checked={include} onChange={(e) => setInclude(e.target.checked)} /></label>
        {error ? <p className="text-sm text-expense">{error}</p> : null}
        <PrimaryButton onClick={() => {
          if (!name.trim()) return setError(t("nameEmpty"));
          const minor = majorStringToMinor(opening || "0", currency);
          if (minor == null) return setError(t("badAmount"));
          void save({
            id: existing?.id,
            name: name.trim(),
            type,
            currency,
            openingBalanceMinor: minor,
            openingDate,
            icon: type === "cash" ? "Wallet" : type === "bank" ? "Landmark" : type === "mobile_wallet" ? "Smartphone" : type === "card" ? "CreditCard" : type === "savings" ? "PiggyBank" : "CircleDollarSign",
            swatch: type === "savings" ? "pine" : "sand",
            isArchived: existing?.isArchived ?? false,
            includeInTotals: include,
          });
          nav.pop();
        }}>{t("saveAccount")}</PrimaryButton>
        {existing ? <QuietButton onClick={() => { void archive(existing.id, !existing.isArchived); nav.pop(); }}>{existing.isArchived ? t("unarchive") : t("archive")}</QuietButton> : null}
        <p className="text-sm text-muted">{t("positiveMeans")}</p>
      </div>
    </Screen>
  );
}

export function CategoriesScreen({ nav }: { nav: Nav }) {
  const { t } = useI18n();
  const data = useMasroof((s) => s.data);
  const save = useMasroof((s) => s.saveCategory);
  const archive = useMasroof((s) => s.archiveCategory);
  const merge = useMasroof((s) => s.mergeCategory);
  const move = useMasroof((s) => s.moveCategory);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [icon, setIcon] = useState("CircleDollarSign");
  const [swatch, setSwatch] = useState<Swatch>("pine");
  const [mergeFrom, setMergeFrom] = useState("");
  const [mergeTo, setMergeTo] = useState("");
  const cats = data.categories.filter((c) => !c.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <Screen title={t("categories")} onBack={nav.pop}>
      <div className="grid gap-2">
        <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("newCategory")} aria-label={t("name")} />
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={`h-11 rounded-full border ${kind === "expense" ? "bg-accent text-accent-fg" : "border-line"}`} onClick={() => setKind("expense")}>{t("expense")}</button>
          <button type="button" className={`h-11 rounded-full border ${kind === "income" ? "bg-accent text-accent-fg" : "border-line"}`} onClick={() => setKind("income")}>{t("income")}</button>
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {ICONS.map((item) => <button key={item} type="button" className={`grid size-11 place-items-center rounded-full border ${icon === item ? "border-accent bg-accent text-accent-fg" : "border-line"}`} onClick={() => setIcon(item)} aria-label={item}><AppIcon name={item} /></button>)}
        </div>
        <PrimaryButton onClick={() => { if (!name.trim()) return; void save({ name: name.trim(), kind, icon, swatch }); setName(""); }}>{t("add")}</PrimaryButton>
      </div>
      <ul className="mt-4 divide-y divide-line">
        {cats.map((cat) => (
          <li key={cat.id} className="flex items-center gap-2 py-2">
            <AppIcon name={cat.icon} />
            <span className="min-w-0 flex-1 truncate">{categoryLabel(cat, t)}{cat.isArchived ? ` · ${t("archived")}` : ""}</span>
            <button type="button" className="h-10 px-2 text-sm" onClick={() => void move(cat.id, -1)} aria-label={t("sortUp")}>↑</button>
            <button type="button" className="h-10 px-2 text-sm" onClick={() => void move(cat.id, 1)} aria-label={t("sortDown")}>↓</button>
            <button type="button" className="h-10 px-2 text-sm" onClick={() => void archive(cat.id, !cat.isArchived)}>{cat.isArchived ? t("unarchive") : t("archive")}</button>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid gap-2">
        <p className="text-sm text-muted">{t("cannotDelete")}</p>
        <select className={fieldClass} value={mergeFrom} onChange={(e) => setMergeFrom(e.target.value)} aria-label={t("merge")}>
          <option value="">{t("merge")}</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{categoryLabel(c, t)}</option>)}
        </select>
        <select className={fieldClass} value={mergeTo} onChange={(e) => setMergeTo(e.target.value)} aria-label={t("mergeInto")}>
          <option value="">{t("mergeInto")}</option>
          {cats.filter((c) => c.id !== mergeFrom).map((c) => <option key={c.id} value={c.id}>{categoryLabel(c, t)}</option>)}
        </select>
        <QuietButton onClick={() => { if (mergeFrom && mergeTo) void merge(mergeFrom, mergeTo); }}>{t("doMerge")}</QuietButton>
      </div>
      <span className="hidden">{swatch}</span>
    </Screen>
  );
}

export function ReportsScreen({ nav }: { nav: Nav }) {
  const { t, money, settings } = useI18n();
  const data = useMasroof((s) => s.data);
  const [range, setRange] = useState<"month" | "last" | "3" | "year">("month");
  const today = todayIso();
  const anchor = range === "last" ? addMonths(today, -1) : today;
  const flow = monthFlow(data, anchor);
  const sums = categorySums(data, anchor, "expense");
  const total = sums.reduce((s, r) => s + r.baseMinor, 0);
  const months = [5, 4, 3, 2, 1, 0].map((n) => {
    const iso = addMonths(today, -n);
    const f = monthFlow(data, iso);
    return { iso: iso.slice(0, 7), income: f.income, expense: f.expense };
  });
  const prev = monthFlow(data, addMonths(anchor, -1));
  const payeeMap = new Map<string, number>();
  const span = range === "year" ? monthRange(addMonths(today, -11)) : range === "3" ? monthRange(addMonths(today, -2)) : monthRange(anchor);
  for (const tx of data.transactions) {
    if (tx.deletedAt || tx.status !== "posted" || tx.type !== "expense") continue;
    if (tx.localDate < span.start || tx.localDate > (range === "month" || range === "last" ? monthRange(anchor).end : today)) continue;
    const key = tx.payee || t("noPayee");
    payeeMap.set(key, (payeeMap.get(key) ?? 0) + tx.baseAmountMinor);
  }
  const payees = [...payeeMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxBar = Math.max(...months.map((m) => m.expense), 1);
  return (
    <Screen title={t("reports")} onBack={nav.pop}>
      <div className="grid grid-cols-4 gap-1">
        {([["month", "thisMonth"], ["last", "lastMonth"], ["3", "threeMonths"], ["year", "thisYear"]] as const).map(([id, key]) => (
          <button key={id} type="button" className={`h-10 rounded-full text-xs ${range === id ? "bg-accent text-accent-fg" : "border border-line"}`} onClick={() => setRange(id)}>{t(key)}</button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-income-soft p-3"><p className="text-sm">{t("income")}</p><p className="nums font-display text-xl">{money(flow.income)}</p></div>
        <div className="rounded-2xl bg-expense-soft p-3"><p className="text-sm">{t("expense")}</p><p className="nums font-display text-xl">{money(flow.expense)}</p></div>
      </div>
      <h2 className="mt-6 text-sm text-muted">{t("trend")}</h2>
      <div className="mt-2 flex h-28 items-end gap-2">
        {months.map((m) => (
          <div key={m.iso} className="flex flex-1 flex-col items-center gap-1">
            <div className="w-full rounded-t bg-expense" style={{ height: `${Math.max(4, Math.round((m.expense / maxBar) * 96))}px` }} />
            <span className="text-xs text-muted">{m.iso.slice(5)}</span>
          </div>
        ))}
      </div>
      <h2 className="mt-6 text-sm text-muted">{t("bars")}</h2>
      {sums.length === 0 ? <p className="mt-2 text-sm text-muted">{t("reportsEmpty")}</p> : sums.map((row) => {
        const cat = data.categories.find((c) => c.id === row.categoryId);
        const prevSum = categorySums(data, addMonths(anchor, -1), "expense").find((item) => item.categoryId === row.categoryId)?.baseMinor ?? 0;
        const delta = prevSum === 0 ? t("flat") : row.baseMinor > prevSum ? t("higher") : row.baseMinor < prevSum ? t("lower") : t("flat");
        return (
          <div key={row.categoryId} className="mt-3">
            <div className="flex justify-between text-sm"><span>{categoryLabel(cat, t)}</span><span className="nums">{money(row.baseMinor)} · {delta}</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-line"><div className="h-full rounded-full bg-expense" style={{ width: `${total ? (row.baseMinor / total) * 100 : 0}%` }} /></div>
          </div>
        );
      })}
      <h2 className="mt-6 text-sm text-muted">{t("mom")}</h2>
      <p className="text-sm">{t("expense")} {money(flow.expense)} / {money(prev.expense)}</p>
      <h2 className="mt-6 text-sm text-muted">{t("payees")}</h2>
      {payees.length === 0 ? <p className="text-sm text-muted">{t("reportsEmpty")}</p> : payees.map(([name, amount]) => (
        <div key={name} className="flex justify-between py-1 text-sm"><span>{name}</span><span className="nums">{money(amount)}</span></div>
      ))}
      <p className="mt-4 text-xs text-muted">{settings.baseCurrency}</p>
    </Screen>
  );
}

export function RatesScreen({ nav }: { nav: Nav }) {
  const { t, tf, settings } = useI18n();
  const data = useMasroof((s) => s.data);
  const save = useMasroof((s) => s.saveRate);
  const remove = useMasroof((s) => s.deleteRate);
  const [base, setBase] = useState("USD");
  const [quote, setQuote] = useState(settings.baseCurrency);
  const [rate, setRate] = useState("");
  return (
    <Screen title={t("rates")} onBack={nav.pop}>
      <p className="text-sm text-muted">{tf("oneEquals", { from: base })}</p>
      <div className="mt-3 grid gap-2">
        <select className={fieldClass} value={base} onChange={(e) => setBase(e.target.value)} aria-label={t("baseWord")}>{CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</select>
        <select className={fieldClass} value={quote} onChange={(e) => setQuote(e.target.value)} aria-label={t("quote")}>{CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</select>
        <input className={fieldClass} value={rate} onChange={(e) => setRate(e.target.value)} placeholder="3.64" aria-label={t("rateLabel")} />
        <PrimaryButton onClick={() => { const e8 = decimalToE8(rate); if (e8 && base !== quote) void save(base, quote, e8); }}>{t("saveRate")}</PrimaryButton>
      </div>
      <ul className="mt-4 divide-y divide-line">
        {data.rates.map((row) => (
          <li key={row.id} className="flex items-center justify-between py-3 text-sm">
            <span>1 {row.base} = {e8ToDecimal(row.rateE8)} {row.quote}</span>
            <button type="button" onClick={() => void remove(row.id)}>{t("remove")}</button>
          </li>
        ))}
      </ul>
      <div className="mt-4"><QuietButton onClick={() => nav.push({ id: "revalue" })}>{t("revalueTitle")}</QuietButton></div>
    </Screen>
  );
}

export function RevalueScreen({ nav }: { nav: Nav }) {
  const { t, tf, money, settings } = useI18n();
  const data = useMasroof((s) => s.data);
  const apply = useMasroof((s) => s.applyRevalue);
  const [next, setNext] = useState(settings.baseCurrency === "USD" ? "QAR" : "USD");
  const need = currenciesInUse(data).filter((code) => code !== next);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const preview = useMemo(() => {
    const list = need.map((currency) => ({ currency, rateE8: decimalToE8(rates[currency] || "") || "" })).filter((r) => r.rateE8);
    if (list.length !== need.length) return null;
    const result = revalue(data, next, list);
    return result.ok ? result.data : null;
  }, [data, need, next, rates]);
  const before = netWorth(data);
  const after = preview ? netWorth(preview) : null;
  return (
    <Screen title={t("revalueTitle")} onBack={nav.pop}>
      <p className="text-sm leading-relaxed text-muted">{t("revalueHelp")}</p>
      <select className={`${fieldClass} mt-4`} value={next} onChange={(e) => setNext(e.target.value)} aria-label={t("baseCurrency")}>
        {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} · {currencyInfo(c.code).en}</option>)}
      </select>
      <div className="mt-3 grid gap-2">
        {need.map((code) => (
          <label key={code} className="text-sm text-muted">{tf("oneEquals", { from: code })} {next}
            <input className={`${fieldClass} mt-1`} value={rates[code] ?? ""} onChange={(e) => setRates((m) => ({ ...m, [code]: e.target.value }))} />
          </label>
        ))}
      </div>
      {need.length > 0 && !preview ? <p className="mt-3 text-sm text-warn">{tf("missingRates", { list: need.join(", ") })}</p> : null}
      {preview && after ? (
        <div className="mt-4 rounded-2xl bg-surface p-4 text-sm">
          <p>{t("oldTotal")}: {money(before.minor, settings.baseCurrency)}</p>
          <p className="mt-1">{t("newTotal")}: {formatMinor(after.minor, next, settings)}</p>
          <p className="mt-1 text-muted">{tf("txTouched", { count: preview.transactions.length })}</p>
        </div>
      ) : null}
      {msg ? <p className="mt-2 text-sm">{msg}</p> : null}
      <div className="mt-4">
        <PrimaryButton disabled={!preview && need.length > 0} onClick={async () => {
          const list = need.map((currency) => ({ currency, rateE8: decimalToE8(rates[currency] || "") || "" }));
          const result = await apply(next, list);
          if (!result.ok) setMsg(tf("missingRates", { list: result.missing.join(", ") }));
          else nav.pop();
        }}>{t("confirmChange")}</PrimaryButton>
      </div>
    </Screen>
  );
}

export function BackupScreen({ nav }: { nav: Nav }) {
  const { t, tf } = useI18n();
  const data = useMasroof((s) => s.data);
  const mark = useMasroof((s) => s.markBackup);
  const replace = useMasroof((s) => s.replaceData);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [msg, setMsg] = useState("");
  const [preview, setPreview] = useState<AppData | null>(null);
  const [fileText, setFileText] = useState("");
  const exportCsv = () => {
    const header = ["date", "type", "account", "to_account", "amount", "currency", "to_amount", "to_currency", "category", "note", "payee", "tags"];
    const rows = data.transactions.filter((tx) => !tx.deletedAt).map((tx) => {
      const account = data.accounts.find((a) => a.id === tx.accountId)?.name ?? "";
      const to = data.accounts.find((a) => a.id === tx.toAccountId)?.name ?? "";
      const category = tx.splits.map((s) => `${categoryLabel(data.categories.find((c) => c.id === s.categoryId), t)}:${minorToInput(s.amountMinor, tx.currency, "comma")}`).join("|");
      return [tx.localDate, tx.type, account, to, minorToInput(tx.amountMinor, tx.currency, "comma"), tx.currency, tx.toAmountMinor != null ? minorToInput(tx.toAmountMinor, tx.toCurrency || tx.currency, "comma") : "", tx.toCurrency ?? "", category, tx.note, tx.payee, tx.tags.join("|")];
    });
    void shareOrDownload(`masroof-${todayIso()}.csv`, toCsv([header, ...rows]), "text/csv");
    setMsg(t("exportReady"));
  };
  return (
    <Screen title={t("backup")} onBack={nav.pop}>
      <p className="text-sm leading-relaxed text-muted">{t("backupHelp")}</p>
      <div className="mt-3 rounded-2xl bg-warn-soft p-3 text-sm">{t("csvWarn")}</div>
      <input className={`${fieldClass} mt-3`} type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={t("passphrase")} aria-label={t("passphrase")} />
      <input className={`${fieldClass} mt-2`} type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder={t("passphraseAgain")} aria-label={t("passphraseAgain")} />
      <div className="mt-3"><PrimaryButton onClick={async () => {
        if (pass.length < 8) return setMsg(t("passphraseShort"));
        if (pass !== pass2) return setMsg(t("passphraseMismatch"));
        const payload = { ...data, settings: { ...data.settings, hasPin: false, draft: null } };
        const envelope = await encryptBackup(payload, pass);
        await shareOrDownload(`masroof-${todayIso()}.masroof`, JSON.stringify(envelope), "application/json");
        await mark();
        setMsg(t("backupSaved"));
      }}>{t("createBackup")}</PrimaryButton></div>
      <div className="mt-6 border-t border-line pt-4">
        <p className="text-sm text-muted">{t("restoreHelp")}</p>
        <input className="mt-2 block w-full text-sm" type="file" accept=".masroof,application/json" aria-label={t("restoreFile")} onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setFileText(await file.text());
          setPreview(null);
          setMsg("");
        }} />
        <div className="mt-2"><QuietButton onClick={async () => {
          if (!fileText) return;
          const opened = await decryptBackup(fileText, pass);
          if (!opened.ok) return setMsg(opened.reason === "newer" ? t("newerBackup") : opened.reason === "corrupt" ? t("corruptFile") : t("wrongPassphrase"));
          const restored = withDefaults(opened.payload as AppData);
          setPreview(restored);
          setMsg(tf("previewCounts", { accounts: restored.accounts.length, tx: restored.transactions.length }));
        }}>{t("preview")}</QuietButton></div>
        {preview ? (
          <div className="mt-3 grid gap-2">
            <p className="text-sm">{t("safetyFirst")}</p>
            <PrimaryButton onClick={async () => {
              if (pass.length < 8) return;
              const safety = await encryptBackup({ ...data, settings: { ...data.settings, hasPin: false, draft: null } }, pass);
              await shareOrDownload(`masroof-safety-${todayIso()}.masroof`, JSON.stringify(safety), "application/json");
              await replace(preview);
              nav.pop();
            }}>{t("replaceNow")}</PrimaryButton>
            <QuietButton onClick={() => setPreview(null)}>{t("cancelRestore")}</QuietButton>
          </div>
        ) : null}
      </div>
      <div className="mt-6"><QuietButton onClick={exportCsv}>{t("exportCsv")}</QuietButton></div>
      {msg ? <p className="mt-3 text-sm" role="status">{msg}</p> : null}
    </Screen>
  );
}

export function ImportScreen({ nav }: { nav: Nav }) {
  const { t, tf, settings } = useI18n();
  const data = useMasroof((s) => s.data);
  const insert = useMasroof((s) => s.importTransactions);
  const [text, setText] = useState("");
  const [includeDups, setIncludeDups] = useState(false);
  const [map, setMap] = useState<Record<string, string>>({});
  const parsed = useMemo(() => (text.trim() ? mapCsv(text) : null), [text]);
  const existing = new Set(data.transactions.filter((tx) => !tx.deletedAt).map((tx) => duplicateKey(tx)));
  type Ready = { line: number; tx?: Transaction; issue?: string };
  const review: Ready[] = [];
  if (parsed) {
    for (const row of parsed.rows) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
        review.push({ line: row.line, issue: t("badDate") });
        continue;
      }
      const type = (["expense", "income", "transfer"].includes(row.type) ? row.type : "") as TxType | "";
      if (!type) {
        review.push({ line: row.line, issue: t("badAmount") });
        continue;
      }
      const currency = row.currency || settings.baseCurrency;
      const amount = majorStringToMinor(row.amount, currency);
      if (amount == null || amount <= 0) {
        review.push({ line: row.line, issue: t("badAmount") });
        continue;
      }
      const account = data.accounts.find((a) => a.name.toLowerCase() === row.account.toLowerCase() && !a.deletedAt) ?? data.accounts.find((a) => !a.deletedAt);
      if (!account) {
        review.push({ line: row.line, issue: t("emptyAccounts") });
        continue;
      }
      const catName = row.category.split(":")[0] || "";
      const mapped = map[catName] || data.categories.find((c) => categoryLabel(c, t).toLowerCase() === catName.toLowerCase() || c.nameKey === catName)?.id || "";
      if (type !== "transfer" && catName && !mapped) {
        review.push({ line: row.line, issue: t("unknownCat") });
        continue;
      }
      const key = duplicateKey({ localDate: row.date, type, amountMinor: amount, currency, accountId: account.id, note: row.note });
      if (!includeDups && existing.has(key)) {
        review.push({ line: row.line, issue: t("duplicate") });
        continue;
      }
      const base = currency === settings.baseCurrency ? amount : amount;
      const now = new Date().toISOString();
      review.push({
        line: row.line,
        tx: {
          ...stamp(now),
          type,
          accountId: account.id,
          toAccountId: null,
          amountMinor: amount,
          accountAmountMinor: amount,
          toAmountMinor: null,
          currency,
          toCurrency: null,
          fxRateE8: "100000000",
          baseAmountMinor: type === "transfer" ? 0 : base,
          localDate: row.date,
          occurredAt: now,
          occurredTz: "UTC",
          payee: row.payee,
          note: row.note,
          tags: row.tags ? row.tags.split("|").filter(Boolean) : [],
          status: row.date > todayIso() ? "scheduled" : "posted",
          recurringRuleId: null,
          occurrenceKey: null,
          seriesDetached: false,
          splits: type === "transfer" || !mapped ? [] : [{ id: uid(), categoryId: mapped, amountMinor: amount, note: "" }],
          attachments: [],
        },
      });
    }
  }
  const unknown = [...new Set((parsed?.rows ?? []).map((r) => r.category.split(":")[0]).filter((name) => name && !data.categories.some((c) => categoryLabel(c, t).toLowerCase() === name.toLowerCase())))];
  const good = review.filter((row) => row.tx);
  return (
    <Screen title={t("importCsv")} onBack={nav.pop}>
      <p className="text-sm text-muted">{t("importHelp")}</p>
      <p className="mt-2 text-sm text-warn">{t("csvWarn")}</p>
      <input className="mt-3 block w-full text-sm" type="file" accept=".csv,text/csv" aria-label={t("importFile")} onChange={async (e) => setText(await (e.target.files?.[0]?.text() ?? Promise.resolve("")))} />
      {!parsed && text ? <p className="mt-2 text-sm text-expense">{t("headerBad")}</p> : null}
      {unknown.map((name) => (
        <label key={name} className="mt-2 block text-sm">{name}
          <select className={`${fieldClass} mt-1`} value={map[name] ?? ""} onChange={(e) => setMap((m) => ({ ...m, [name]: e.target.value }))}>
            <option value="">{t("leaveSkip")}</option>
            {data.categories.filter((c) => !c.deletedAt).map((c) => <option key={c.id} value={c.id}>{categoryLabel(c, t)}</option>)}
          </select>
        </label>
      ))}
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={includeDups} onChange={(e) => setIncludeDups(e.target.checked)} />{t("includeDups")}</label>
      <ul className="mt-3 max-h-64 overflow-auto text-sm">
        {review.map((row) => <li key={row.line} className="flex justify-between border-b border-line py-1"><span>#{row.line}</span><span>{row.issue ?? t("rowOk")}</span></li>)}
      </ul>
      <div className="mt-3"><PrimaryButton disabled={good.length === 0} onClick={() => { void insert(good.map((row) => row.tx!)); nav.pop(); }}>{tf("importN", { count: good.length })}</PrimaryButton></div>
      <p className="mt-2 text-sm text-muted">{tf("willSkip", { count: review.length - good.length })}</p>
    </Screen>
  );
}

export function TrashScreen({ nav }: { nav: Nav }) {
  const { t } = useI18n();
  const txs = useMasroof((s) => s.data.transactions.filter((tx) => tx.deletedAt));
  const restore = useMasroof((s) => s.restoreTransaction);
  const purge = useMasroof((s) => s.purgeTrash);
  const [ask, setAsk] = useState(false);
  return (
    <Screen title={t("trash")} onBack={nav.pop}>
      <p className="text-sm text-muted">{t("trashHint")}</p>
      {txs.length === 0 ? <div className="mt-4"><EmptyState title={t("emptyTrash")} body={t("trash30")} /></div> : (
        <ul className="mt-3 divide-y divide-line">
          {txs.map((tx) => (
            <li key={tx.id} className="flex items-center justify-between py-3">
              <span className="text-sm">{tx.localDate} · {tx.note || tx.payee || tx.type}</span>
              <button type="button" className="h-10 px-3" onClick={() => void restore(tx.id)}>{t("restoreItem")}</button>
            </li>
          ))}
        </ul>
      )}
      {ask ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className="h-11 rounded-full bg-expense text-accent-fg" onClick={() => void purge()}>{t("yesRemove")}</button>
          <button type="button" className="h-11" onClick={() => setAsk(false)}>{t("noKeep")}</button>
        </div>
      ) : <button type="button" className="mt-4 h-11 text-expense" onClick={() => setAsk(true)}>{t("purgeTrash")}</button>}
    </Screen>
  );
}

export function PrivacyScreen({ nav }: { nav: Nav }) {
  const { t } = useI18n();
  return (
    <Screen title={t("privacy")} onBack={nav.pop}>
      <div className="space-y-4 text-sm leading-relaxed">
        <p>{t("privacy1")}</p>
        <p>{t("privacy2")}</p>
        <p>{t("privacy3")}</p>
        <p>{t("privacy4")}</p>
        <p>{t("privacy5")}</p>
        <p className="text-muted">{t("aboutBody")}</p>
      </div>
    </Screen>
  );
}

export function ResetScreen({ nav }: { nav: Nav }) {
  const { t } = useI18n();
  const reset = useMasroof((s) => s.resetAll);
  const [word, setWord] = useState("");
  const [backed, setBacked] = useState(false);
  return (
    <Screen title={t("reset")} onBack={nav.pop}>
      <p className="text-sm leading-relaxed">{t("resetExplain")}</p>
      <div className="mt-4 grid gap-2">
        <QuietButton onClick={() => nav.push({ id: "backup" })}>{t("makeBackup")}</QuietButton>
        <button type="button" className="h-11 text-sm" onClick={() => setBacked(true)}>{t("haveBackup")}</button>
      </div>
      {backed ? (
        <div className="mt-4 grid gap-2">
          <p className="text-sm">{t("typeReset")}</p>
          <input className={fieldClass} value={word} onChange={(e) => setWord(e.target.value)} aria-label={t("typed")} />
          <PrimaryButton disabled={word !== "RESET"} onClick={() => void reset()}>{t("erase")}</PrimaryButton>
          <QuietButton onClick={nav.pop}>{t("cancel")}</QuietButton>
        </div>
      ) : <p className="mt-4 text-sm text-muted">{t("nothingChanged")}</p>}
    </Screen>
  );
}

export function CalculatorScreen({ nav }: { nav: Nav }) {
  const { t, money, settings } = useI18n();
  const openAdd = useMasroof((s) => s.openAdd);
  const [expr, setExpr] = useState("");
  const parsed = expressionToMinor(expr || "0", settings.baseCurrency);
  return (
    <Screen title={t("calcTitle")} onBack={nav.pop}>
      <p className="text-sm text-muted">{t("calcSub")}</p>
      <p className="nums mt-4 font-display text-4xl">{expr || "0"}</p>
      <p className="text-sm text-muted">{parsed.ok ? money(parsed.minor) : t("calcError")}</p>
      <div dir="ltr" className="mt-4 grid grid-cols-4 gap-2">
        {["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "b", "+"].map((key) => (
          <button key={key} type="button" className="h-12 rounded-xl bg-surface" onClick={() => setExpr((v) => (key === "b" ? v.slice(0, -1) : `${v}${key === "." ? (settings.numberFormat === "dot" ? "," : ".") : key}`))}>{key === "b" ? "⌫" : key === "*" ? "×" : key === "/" ? "÷" : key}</button>
        ))}
      </div>
      <div className="mt-3"><PrimaryButton disabled={!parsed.ok} onClick={() => { openAdd({ type: "expense" }); nav.tab("home"); }}>{t("putInEntry")}</PrimaryButton></div>
    </Screen>
  );
}

export function BudgetEditor({ nav, budgetId }: { nav: Nav; budgetId?: string }) {
  const { t, settings } = useI18n();
  const data = useMasroof((s) => s.data);
  const existing = data.budgets.find((b) => b.id === budgetId);
  const save = useMasroof((s) => s.saveBudget);
  const remove = useMasroof((s) => s.deleteBudget);
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? "cat_food");
  const [overall, setOverall] = useState(existing ? existing.categoryId == null : false);
  const [period, setPeriod] = useState<"monthly" | "weekly">(existing?.period ?? "monthly");
  const [amount, setAmount] = useState(existing ? minorToInput(existing.amountMinor, existing.currency, settings.numberFormat) : "");
  const [rollover, setRollover] = useState(existing?.rollover ?? false);
  const [thresholds, setThresholds] = useState<number[]>(existing?.alertThresholds ?? [50, 80, 100]);
  return (
    <Screen title={existing ? t("editBudget") : t("newBudget")} onBack={nav.pop}>
      <div className="grid gap-3">
        <label className="flex items-center justify-between text-sm"><span>{t("overall")}</span><input type="checkbox" checked={overall} onChange={(e) => setOverall(e.target.checked)} /></label>
        {!overall ? (
          <select className={fieldClass} value={categoryId ?? ""} onChange={(e) => setCategoryId(e.target.value)}>
            {data.categories.filter((c) => c.kind === "expense" && !c.deletedAt).map((c) => <option key={c.id} value={c.id}>{categoryLabel(c, t)}</option>)}
          </select>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={`h-11 rounded-full border ${period === "monthly" ? "bg-accent text-accent-fg" : "border-line"}`} onClick={() => setPeriod("monthly")}>{t("monthly")}</button>
          <button type="button" className={`h-11 rounded-full border ${period === "weekly" ? "bg-accent text-accent-fg" : "border-line"}`} onClick={() => setPeriod("weekly")}>{t("weekly")}</button>
        </div>
        <input className={fieldClass} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t("amount")} aria-label={t("amount")} />
        <label className="flex items-center justify-between text-sm"><span>{t("rollover")}</span><input type="checkbox" checked={rollover} onChange={(e) => setRollover(e.target.checked)} /></label>
        <div className="flex gap-3 text-sm">
          {[50, 80, 100].map((n) => (
            <label key={n} className="flex items-center gap-1"><input type="checkbox" checked={thresholds.includes(n)} onChange={(e) => setThresholds((list) => e.target.checked ? [...list, n] : list.filter((x) => x !== n))} />{n}%</label>
          ))}
        </div>
        <PrimaryButton onClick={() => {
          const minor = majorStringToMinor(amount, settings.baseCurrency);
          if (minor == null || minor <= 0) return;
          void save({
            id: existing?.id,
            categoryId: overall ? null : categoryId,
            period,
            amountMinor: minor,
            currency: settings.baseCurrency,
            rollover,
            alertThresholds: thresholds.length ? thresholds : [80, 100],
          });
          nav.pop();
        }}>{t("saveBudget")}</PrimaryButton>
        {existing ? <button type="button" className="h-11 text-expense" onClick={() => { void remove(existing.id); nav.pop(); }}>{t("deleteBudget")}</button> : null}
      </div>
    </Screen>
  );
}

export function GoalEditor({ nav, goalId }: { nav: Nav; goalId?: string }) {
  const { t, settings } = useI18n();
  const data = useMasroof((s) => s.data);
  const existing = data.goals.find((g) => g.id === goalId);
  const save = useMasroof((s) => s.saveGoal);
  const remove = useMasroof((s) => s.deleteGoal);
  const [name, setName] = useState(existing?.name ?? "");
  const [amount, setAmount] = useState(existing ? minorToInput(existing.targetMinor, existing.currency, settings.numberFormat) : "");
  const [date, setDate] = useState(existing?.targetDate ?? "");
  const [accountId, setAccountId] = useState(existing?.linkedAccountId ?? data.accounts.find((a) => a.type === "savings")?.id ?? "");
  return (
    <Screen title={existing ? t("editGoal") : t("newGoal")} onBack={nav.pop}>
      <div className="grid gap-3">
        <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("name")} aria-label={t("name")} />
        <input className={fieldClass} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t("target")} aria-label={t("target")} />
        <input type="date" className={fieldClass} value={date} onChange={(e) => setDate(e.target.value)} aria-label={t("targetDate")} />
        <select className={fieldClass} value={accountId ?? ""} onChange={(e) => setAccountId(e.target.value)} aria-label={t("linkedAccount")}>
          <option value="">{t("none")}</option>
          {data.accounts.filter((a) => !a.deletedAt).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <p className="text-sm text-muted">{t("goalNote")}</p>
        <PrimaryButton onClick={() => {
          const minor = majorStringToMinor(amount, settings.baseCurrency);
          if (!name.trim() || minor == null) return;
          void save({ id: existing?.id, name: name.trim(), targetMinor: minor, currency: settings.baseCurrency, targetDate: date || null, linkedAccountId: accountId || null });
          nav.pop();
        }}>{t("saveGoal")}</PrimaryButton>
        {existing ? <button type="button" className="h-11 text-expense" onClick={() => { void remove(existing.id); nav.pop(); }}>{t("deleteGoal")}</button> : null}
      </div>
    </Screen>
  );
}

export function RuleEditor({ nav, ruleId }: { nav: Nav; ruleId?: string }) {
  const { t, settings } = useI18n();
  const data = useMasroof((s) => s.data);
  const existing = data.rules.find((r) => r.id === ruleId);
  const save = useMasroof((s) => s.saveRule);
  const remove = useMasroof((s) => s.deleteRule);
  const [amount, setAmount] = useState(existing ? minorToInput(existing.template.amountMinor, existing.template.currency, settings.numberFormat) : "");
  const [freq, setFreq] = useState(existing?.freq ?? "monthly");
  const [mode, setMode] = useState(existing?.mode ?? "auto_post");
  const [day, setDay] = useState(String(existing?.byMonthDay ?? new Date().getDate()));
  const [start, setStart] = useState(existing?.startDate ?? todayIso());
  const [accountId, setAccountId] = useState(existing?.template.accountId ?? data.accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState(existing?.template.categoryId ?? "cat_bills");
  const [payee, setPayee] = useState(existing?.template.payee ?? "");
  const [note, setNote] = useState(existing?.template.note ?? "");
  return (
    <Screen title={existing ? t("editRule") : t("newRule")} onBack={nav.pop}>
      <div className="grid gap-3">
        <input className={fieldClass} value={payee} onChange={(e) => setPayee(e.target.value)} placeholder={t("payee")} aria-label={t("payee")} />
        <input className={fieldClass} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t("amount")} aria-label={t("amount")} />
        <select className={fieldClass} value={freq} onChange={(e) => setFreq(e.target.value as typeof freq)}>
          <option value="weekly">{t("freqWeekly")}</option>
          <option value="monthly">{t("freqMonthly")}</option>
          <option value="yearly">{t("freqYearly")}</option>
        </select>
        {freq !== "weekly" ? <input className={fieldClass} inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, "").slice(0, 2))} aria-label={t("dayOfMonth")} /> : null}
        <select className={fieldClass} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          <option value="auto_post">{t("modeAuto")}</option>
          <option value="confirm_before_post">{t("modeConfirm")}</option>
          <option value="remind_only">{t("modeRemind")}</option>
        </select>
        <select className={fieldClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {data.accounts.filter((a) => !a.deletedAt && !a.isArchived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className={fieldClass} value={categoryId ?? ""} onChange={(e) => setCategoryId(e.target.value)}>
          {data.categories.filter((c) => !c.deletedAt && c.kind === "expense").map((c) => <option key={c.id} value={c.id}>{categoryLabel(c, t)}</option>)}
        </select>
        <input type="date" className={fieldClass} value={start} onChange={(e) => setStart(e.target.value)} aria-label={t("starts")} />
        <input className={fieldClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("note")} aria-label={t("note")} />
        <p className="text-sm text-muted">{t("day31")} {t("backfill")}</p>
        <PrimaryButton onClick={() => {
          const minor = majorStringToMinor(amount, settings.baseCurrency);
          if (minor == null || !accountId) return;
          const byMonthDay = Math.min(31, Math.max(1, Number(day) || 1));
          void save({
            id: existing?.id,
            freq,
            interval: 1,
            byMonthDay: freq === "weekly" ? null : byMonthDay,
            byWeekday: freq === "weekly" ? new Date(`${start}T12:00:00`).getDay() : null,
            startDate: start,
            endDate: null,
            mode,
            template: {
              type: "expense",
              accountId,
              toAccountId: null,
              amountMinor: minor,
              currency: settings.baseCurrency,
              categoryId,
              payee,
              note,
              tags: [],
            },
          });
          nav.pop();
        }}>{t("saveRule")}</PrimaryButton>
        {existing ? <button type="button" className="h-11 text-expense" onClick={() => { void remove(existing.id); nav.pop(); }}>{t("deleteRule")}</button> : null}
      </div>
    </Screen>
  );
}

export function ProblemScreen({ kind }: { kind: "corrupt" | "newer" }) {
  const { t } = useI18n();
  const reset = useMasroof((s) => s.resetAll);
  const [word, setWord] = useState("");
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6">
      <h1 className="font-display text-4xl">{kind === "newer" ? t("newerData") : t("corrupt")}</h1>
      <p className="mt-3 text-sm text-muted">{t("resetExplain")}</p>
      <input className={`${fieldClass} mt-4`} value={word} onChange={(e) => setWord(e.target.value)} aria-label={t("typed")} />
      <div className="mt-3"><PrimaryButton disabled={word !== "RESET"} onClick={() => void reset()}>{t("erase")}</PrimaryButton></div>
    </main>
  );
}

void freshData;
void exponent;
void expressionToMinor;
void SWATCHES;
