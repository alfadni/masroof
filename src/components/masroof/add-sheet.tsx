import { useEffect, useMemo, useRef, useState } from "react";
import { exponent } from "@/masroof/catalog";
import { todayIso, zoneName } from "@/masroof/dates";
import { accountBalance, findRate, splitsMatch, transferBlock } from "@/masroof/engine";
import { convertMinor, decimalToE8, e8ToDecimal, expressionToMinor, minorToInput, RATE_SCALE } from "@/masroof/money";
import { categoryLabel, useMasroof } from "@/masroof/store";
import type { Attachment, Draft, TxType } from "@/masroof/types";
import { AppIcon } from "@/components/masroof/icons";
import { compressImage } from "@/components/masroof/photos";
import { cn, fieldClass, haptic, useI18n } from "@/components/masroof/ui";

type SplitLine = { id: string; categoryId: string; expression: string; note: string };

export function AddSheet() {
  const { t, tf, money, settings, locale } = useI18n();
  const data = useMasroof((s) => s.data);
  const intent = useMasroof((s) => s.addIntent);
  const close = useMasroof((s) => s.closeAdd);
  const save = useMasroof((s) => s.saveTransaction);
  const saveDraft = useMasroof((s) => s.saveDraft);
  const editing = intent?.editingId ? data.transactions.find((tx) => tx.id === intent.editingId) : undefined;
  const accounts = data.accounts.filter((a) => !a.deletedAt && !a.isArchived);
  const draft = !editing ? data.settings.draft : null;
  const freshDraft = draft && Date.now() - draft.savedAt < 10 * 60 * 1000 ? draft : null;
  const [type, setType] = useState<TxType>(editing?.type ?? freshDraft?.type ?? intent?.type ?? "expense");
  const [expression, setExpression] = useState(editing ? minorToInput(editing.amountMinor, editing.currency, settings.numberFormat) : freshDraft?.expression ?? "");
  const [toExpression, setToExpression] = useState(editing?.toAmountMinor ? minorToInput(editing.toAmountMinor, editing.toCurrency || editing.currency, settings.numberFormat) : freshDraft?.toExpression ?? "");
  const [accountId, setAccountId] = useState(editing?.accountId ?? freshDraft?.accountId ?? settings.lastAccountId ?? accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(editing?.toAccountId ?? freshDraft?.toAccountId ?? accounts[1]?.id ?? "");
  const [categoryId, setCategoryId] = useState(editing?.splits[0]?.categoryId ?? freshDraft?.categoryId ?? "");
  const [splitMode, setSplitMode] = useState(Boolean(editing && editing.splits.length > 1) || Boolean(freshDraft?.splitMode));
  const [splits, setSplits] = useState<SplitLine[]>(
    editing && editing.splits.length > 1
      ? editing.splits.map((split) => ({ id: split.id, categoryId: split.categoryId, expression: minorToInput(split.amountMinor, editing.currency, settings.numberFormat), note: split.note }))
      : freshDraft?.splits ?? [],
  );
  const [note, setNote] = useState(editing?.note ?? freshDraft?.note ?? "");
  const [payee, setPayee] = useState(editing?.payee ?? freshDraft?.payee ?? "");
  const [tags, setTags] = useState((editing?.tags ?? freshDraft?.tags ?? "").toString());
  const [localDate, setLocalDate] = useState(editing?.localDate ?? freshDraft?.localDate ?? todayIso());
  const [photos, setPhotos] = useState<Attachment[]>(editing?.attachments ?? []);
  const [rateText, setRateText] = useState(editing && editing.currency !== settings.baseCurrency ? e8ToDecimal(editing.fxRateE8) : "");
  const [focus, setFocus] = useState<"amount" | "to" | number>("amount");
  const [more, setMore] = useState(false);
  const [askCollapse, setAskCollapse] = useState(false);
  const [series, setSeries] = useState<"one" | "future" | null>(intent?.series ?? null);
  const [askSeries, setAskSeries] = useState(Boolean(editing?.recurringRuleId && !intent?.series));
  const [error, setError] = useState("");
  const [warn, setWarn] = useState("");
  const [photoNote, setPhotoNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const decimal = settings.numberFormat === "dot" ? "," : ".";
  const account = accounts.find((a) => a.id === accountId);
  const dest = accounts.find((a) => a.id === toAccountId);
  const currency = account?.currency ?? settings.baseCurrency;
  const evaluated = expressionToMinor(expression, currency);
  const lastValid = evaluated.ok ? evaluated.minor : null;
  const cats = data.categories
    .filter((c) => !c.deletedAt && !c.isArchived && c.kind === (type === "income" ? "income" : "expense"))
    .sort((a, b) => {
      const ar = settings.recentCategoryIds.indexOf(a.id);
      const br = settings.recentCategoryIds.indexOf(b.id);
      if (ar !== -1 || br !== -1) return (ar === -1 ? 99 : ar) - (br === -1 ? 99 : br);
      return a.sortOrder - b.sortOrder;
    });

  useEffect(() => {
    if (freshDraft && !editing) setPhotoNote("");
  }, [freshDraft, editing]);

  useEffect(() => {
    if (editing) return;
    const handle = window.setTimeout(() => {
      const next: Draft = {
        savedAt: Date.now(),
        type,
        expression,
        toExpression,
        accountId,
        toAccountId,
        categoryId,
        splitMode,
        splits,
        note,
        payee,
        tags,
        localDate,
        editingId: null,
        series,
      };
      if (expression || note || payee) saveDraft(next);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [type, expression, toExpression, accountId, toAccountId, categoryId, splitMode, splits, note, payee, tags, localDate, series, editing, saveDraft]);

  const activeExpr = focus === "to" ? toExpression : typeof focus === "number" ? splits[focus]?.expression ?? "" : expression;
  const setActive = (value: string) => {
    if (focus === "to") setToExpression(value);
    else if (typeof focus === "number") {
      setSplits((rows) => rows.map((row, index) => (index === focus ? { ...row, expression: value } : row)));
    } else setExpression(value);
  };

  const press = (key: string) => {
    setError("");
    if (key === "c") {
      setActive("");
      return;
    }
    if (key === "b") {
      setActive(activeExpr.slice(0, -1));
      return;
    }
    if (key === "=") {
      const current = expressionToMinor(activeExpr, focus === "to" ? dest?.currency ?? currency : currency);
      if (!current.ok) {
        setError(t("badExpr"));
        return;
      }
      setActive(minorToInput(current.minor, focus === "to" ? dest?.currency ?? currency : currency, settings.numberFormat));
      return;
    }
    if ("+-*/".includes(key) && (activeExpr === "" || "+-*/".includes(activeExpr.slice(-1)))) {
      setError(t("badExpr"));
      return;
    }
    setActive(`${activeExpr}${key === "." ? decimal : key}`);
  };

  const splitParts = useMemo(() => {
    return splits.map((line) => {
      const parsed = expressionToMinor(line.expression || "0", currency);
      return parsed.ok ? parsed.minor : 0;
    });
  }, [splits, currency]);

  const onSave = async () => {
    if (!account) return;
    if (type === "transfer" && accounts.length < 2) {
      setError(t("needTwo"));
      return;
    }
    if (!evaluated.ok) {
      setError(t(evaluated.issue === "zero" ? "zeroAmount" : evaluated.issue === "negative" ? "negativeAmount" : evaluated.issue === "digits" ? "digitAmount" : evaluated.issue === "bad" ? "badExpr" : "badAmount"));
      return;
    }
    let parts = [{ categoryId, amountMinor: evaluated.minor, note: "" }];
    if (type !== "transfer" && splitMode) {
      const match = splitsMatch(evaluated.minor, splitParts);
      if (match !== "ok" || splits.some((line) => !line.categoryId)) {
        setError(t("splitsMust"));
        return;
      }
      parts = splits.map((line, index) => ({ categoryId: line.categoryId, amountMinor: splitParts[index] ?? 0, note: line.note }));
    } else if (type !== "transfer" && !categoryId) {
      setError(t("pickCategory"));
      return;
    }
    if (type === "transfer") {
      const block = transferBlock(account, dest);
      if (block === "same") return setError(t("sameAccount"));
      if (block) return setError(t("archivedAccount"));
    }
    let toMinor: number | null = null;
    if (type === "transfer" && dest && dest.currency !== account.currency) {
      const parsedTo = expressionToMinor(toExpression, dest.currency);
      if (!parsedTo.ok) return setError(t("bothAmounts"));
      toMinor = parsedTo.minor;
    } else if (type === "transfer") toMinor = evaluated.minor;
    let rate = RATE_SCALE;
    if (currency !== settings.baseCurrency) {
      const typed = decimalToE8(rateText);
      const stored = findRate(data.rates, currency, settings.baseCurrency);
      if (typed) rate = BigInt(typed);
      else if (stored) rate = stored;
      else return setError(t("rateNeeded"));
    }
    const base = currency === settings.baseCurrency ? evaluated.minor : convertMinor(evaluated.minor, exponent(currency), exponent(settings.baseCurrency), rate) ?? evaluated.minor;
    if (type !== "transfer" && accountBalance(data, account) - (type === "expense" ? evaluated.minor : 0) < 0 && type === "expense") {
      setWarn(t("lowBalance"));
    }
    const result = await save({
      id: editing?.id,
      type,
      accountId,
      toAccountId: type === "transfer" ? toAccountId : null,
      amountMinor: evaluated.minor,
      accountAmountMinor: evaluated.minor,
      toAmountMinor: toMinor,
      currency,
      toCurrency: dest?.currency ?? null,
      fxRateE8: rate.toString(),
      baseAmountMinor: base,
      localDate,
      payee: payee.trim(),
      note: note.trim(),
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      splits: type === "transfer" ? [] : parts,
      attachments: photos,
      series,
    });
    if (result.ok) {
      haptic(12);
      saveDraft(null);
    } else setError(t(result.error));
  };

  const pickCategory = (id: string) => {
    if (splitMode) {
      setSplits((rows) => {
        if (rows.some((row) => row.categoryId === id)) return rows;
        const remaining = (lastValid ?? 0) - splitParts.reduce((sum, n) => sum + n, 0);
        return [...rows, { id: crypto.randomUUID(), categoryId: id, expression: remaining > 0 ? minorToInput(remaining, currency, settings.numberFormat) : "", note: "" }];
      });
      return;
    }
    setCategoryId(id);
    if (!expression) {
      const last = settings.lastAmountByCategory[id];
      if (last && last.currency === currency) setExpression(minorToInput(last.minor, currency, settings.numberFormat));
    }
  };

  const keys = ["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", decimal, "0", "b", "+"];

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label={t("entry")}>
      <div className="mx-auto flex h-full w-full max-w-lg flex-col">
        <header className="flex items-center justify-between px-3 py-2">
          <button type="button" className="h-11 px-3" onClick={() => { saveDraft(null); close(); }} aria-label={t("closeAdd")}>{t("close")}</button>
          <div className="grid grid-cols-3 rounded-full border border-line p-1 text-sm">
            {(["expense", "income", "transfer"] as TxType[]).map((item) => (
              <button key={item} type="button" className={cn("h-9 rounded-full px-3", type === item && "bg-accent text-accent-fg")} onClick={() => { setType(item); setFocus("amount"); }}>
                {t(item)}
              </button>
            ))}
          </div>
          <span className="w-14" />
        </header>
        {askSeries ? (
          <div className="mx-4 rounded-2xl border border-line bg-surface p-4">
            <p>{t("seriesAsk")}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="h-11 rounded-full bg-accent text-accent-fg" onClick={() => { setSeries("one"); setAskSeries(false); }}>{t("thisOnly")}</button>
              <button type="button" className="h-11 rounded-full border border-line" onClick={() => { setSeries("future"); setAskSeries(false); }}>{t("thisFuture")}</button>
            </div>
          </div>
        ) : null}
        <div dir="ltr" className="px-5 pt-2">
          <p className="text-xs text-muted">{focus === "to" ? t("toAmount") : t("amount")}</p>
          <p className="nums truncate font-display text-5xl">{activeExpr || "0"}</p>
          {lastValid != null && focus === "amount" ? <p className="text-sm text-muted">{money(lastValid, currency)}</p> : null}
          {currency !== settings.baseCurrency ? (
            <label className="mt-2 block text-sm text-muted">
              {tf("oneEquals", { from: currency })} {settings.baseCurrency}
              <input className={`${fieldClass} mt-1`} value={rateText} onChange={(e) => setRateText(e.target.value)} placeholder={t("typeRate")} />
            </label>
          ) : null}
        </div>
        {error ? <p className="px-5 pt-2 text-sm text-expense" role="alert">{error}</p> : null}
        {warn ? <p className="px-5 text-sm text-warn">{warn} {t("stillSave")}</p> : null}
        {localDate > todayIso() ? <p className="px-5 text-sm text-warn">{t("futureTag")}</p> : null}
        {account && localDate < account.openingDate ? <p className="px-5 text-sm text-warn">{t("openingWarn")}</p> : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {type === "transfer" ? (
            <div className="mt-3 grid gap-2">
              <p className="text-sm text-muted">{t("transferNote")}</p>
              <AccountPicks accounts={accounts} value={accountId} onChange={setAccountId} label={t("transferFrom")} />
              <AccountPicks accounts={accounts} value={toAccountId} onChange={(id) => { setToAccountId(id); setFocus(accounts.find((a) => a.id === id)?.currency !== currency ? "to" : "amount"); }} label={t("transferTo")} />
              {dest && dest.currency !== currency ? <p className="text-sm text-muted">{t("bothAmounts")}</p> : null}
            </div>
          ) : (
            <>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-sm text-muted">{t("categoryGrid")}</p>
                <button type="button" className="text-sm" onClick={() => (splitMode && splits.length > 1 ? setAskCollapse(true) : setSplitMode((v) => !v))}>
                  {splitMode ? t("oneCat") : t("splitToggle")}
                </button>
              </div>
              {askCollapse ? (
                <div className="mt-2 rounded-xl border border-line p-3 text-sm">
                  <p>{t("collapseAsk")}</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="h-10 rounded-full bg-accent px-3 text-accent-fg" onClick={() => { setSplitMode(false); setSplits([]); setAskCollapse(false); }}>{t("collapse")}</button>
                    <button type="button" className="h-10 px-3" onClick={() => setAskCollapse(false)}>{t("keepSplit")}</button>
                  </div>
                </div>
              ) : null}
              {splitMode ? (
                <div className="mt-2 space-y-2">
                  {splits.map((line, index) => {
                    const parsed = expressionToMinor(line.expression || "0", currency);
                    return (
                      <div key={line.id} className={cn("rounded-xl border px-3 py-2", focus === index ? "border-accent" : "border-line")}>
                        <button type="button" className="text-sm" onClick={() => setFocus(index)}>{categoryLabel(data.categories.find((c) => c.id === line.categoryId), t)}</button>
                        <p className="nums">{parsed.ok ? money(parsed.minor, currency) : line.expression}</p>
                      </div>
                    );
                  })}
                  <p className="text-sm text-muted">
                    {lastValid != null && splitsMatch(lastValid, splitParts) === "ok"
                      ? t("balanced")
                      : lastValid != null && splitParts.reduce((s, n) => s + n, 0) > lastValid
                        ? tf("overSplit", { amount: money(splitParts.reduce((s, n) => s + n, 0) - lastValid, currency) })
                        : tf("remaining", { amount: money(Math.max(0, (lastValid ?? 0) - splitParts.reduce((s, n) => s + n, 0)), currency) })}
                  </p>
                </div>
              ) : null}
              <div className="mt-3 grid grid-cols-4 gap-2">
                {cats.map((cat) => {
                  const on = splitMode ? splits.some((s) => s.categoryId === cat.id) : categoryId === cat.id;
                  return (
                    <button key={cat.id} type="button" onClick={() => pickCategory(cat.id)} className={cn("flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border text-xs", on ? "border-accent bg-accent text-accent-fg" : "border-line bg-surface")}>
                      <AppIcon name={cat.icon} />
                      <span className="max-w-full truncate px-1">{categoryLabel(cat, t)}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="text-sm text-muted">
              {t("date")}
              <input type="date" className={`${fieldClass} mt-1`} value={localDate} onChange={(e) => setLocalDate(e.target.value)} />
            </label>
          </div>
          <button type="button" className="mt-3 text-sm text-muted" onClick={() => setMore((v) => !v)}>{more ? t("lessFields") : t("moreFields")}</button>
          {more ? (
            <div className="mt-2 grid gap-2">
              <input className={fieldClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePh")} aria-label={t("note")} />
              <input className={fieldClass} value={payee} onChange={(e) => setPayee(e.target.value)} placeholder={t("payeePh")} aria-label={t("payee")} list="payees" />
              <datalist id="payees">
                {[...new Set(data.transactions.map((tx) => tx.payee).filter(Boolean))].slice(0, 12).map((item) => <option key={item} value={item} />)}
              </datalist>
              <input className={fieldClass} value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t("tagsPh")} aria-label={t("tags")} />
              <div className="flex items-center gap-2">
                <button type="button" className="h-11 rounded-full border border-line px-4" onClick={() => fileRef.current?.click()}>{t("photoButton")}</button>
                <span className="text-sm text-muted">{tf("photosUsed", { n: photos.length })}</span>
              </div>
              <p className="text-sm text-muted">{t("photoPermission")}</p>
              {photoNote ? <p className="text-sm text-warn">{photoNote}</p> : null}
              <div className="flex gap-2 overflow-x-auto">
                {photos.map((photo) => (
                  <button key={photo.id} type="button" className="relative" onClick={() => setPhotos((rows) => rows.filter((row) => row.id !== photo.id))} aria-label={t("remove")}>
                    <img src={photo.dataUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
                  </button>
                ))}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (photos.length >= 5) {
                  setPhotoNote(t("photoLimit"));
                  return;
                }
                const image = await compressImage(file).catch(() => null);
                if (!image) {
                  setPhotoNote(t("photoRead"));
                  return;
                }
                setPhotos((rows) => [...rows, image]);
                setPhotoNote("");
              }} />
            </div>
          ) : null}
          <p className="py-2 text-xs text-muted">{zoneName()}</p>
        </div>
        <div dir="ltr" className="grid grid-cols-4 gap-1 px-3 pt-2">
          {keys.map((key) => (
            <button key={key} type="button" className="h-12 rounded-xl bg-surface text-lg" onClick={() => press(key === decimal ? "." : key)} aria-label={key === "b" ? t("backspace") : key === "/" ? t("divOp") : key === "*" ? t("mulOp") : key === "+" ? t("addOp") : key === "-" ? t("subOp") : key}>
              {key === "b" ? "⌫" : key === "/" ? "÷" : key === "*" ? "×" : key === "." ? decimal : key}
            </button>
          ))}
        </div>
        <div className="safe-bottom grid grid-cols-[auto_1fr] gap-2 px-3 pt-2">
          <button type="button" className="h-12 rounded-full border border-line px-4" onClick={() => press("=")} aria-label={t("equals")}>=</button>
          <button type="button" className="h-12 rounded-full bg-accent font-medium text-accent-fg disabled:opacity-40" disabled={!evaluated.ok} onClick={() => void onSave()}>
            {type === "transfer" ? t("saveTransfer") : t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function AccountPicks({
  accounts,
  value,
  onChange,
  label,
}: {
  accounts: { id: string; name: string; currency: string }[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted">{label}</p>
      <div className="flex gap-2 overflow-x-auto">
        {accounts.map((account) => (
          <button key={account.id} type="button" onClick={() => onChange(account.id)} className={cn("h-11 shrink-0 rounded-full border px-3 text-sm", value === account.id ? "border-accent bg-accent text-accent-fg" : "border-line")}>
            {account.name} · {account.currency}
          </button>
        ))}
      </div>
    </div>
  );
}
