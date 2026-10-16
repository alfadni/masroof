import { useMemo, useState } from "react";
import { formatPrettyDate } from "@/masroof/dates";
import { categoryLabel, useMasroof } from "@/masroof/store";
import { AppIcon } from "@/components/masroof/icons";
import type { Nav } from "@/components/masroof/nav";
import { EmptyState, fieldClass, MoneyText, useI18n } from "@/components/masroof/ui";

export function Activity({ nav }: { nav: Nav }) {
  const { t, locale, settings } = useI18n();
  const data = useMasroof((s) => s.data);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [accountId, setAccountId] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [tag, setTag] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [openFilters, setOpenFilters] = useState(false);
  const [limit, setLimit] = useState(40);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.transactions.filter((tx) => {
      if (tx.deletedAt) return false;
      if (type !== "all" && tx.type !== type) return false;
      if (accountId !== "all" && tx.accountId !== accountId && tx.toAccountId !== accountId) return false;
      if (categoryId !== "all" && !tx.splits.some((split) => split.categoryId === categoryId)) return false;
      if (tag && !tx.tags.some((item) => item.toLowerCase().includes(tag.toLowerCase()))) return false;
      if (from && tx.localDate < from) return false;
      if (to && tx.localDate > to) return false;
      if (!q) return true;
      const amount = String(tx.amountMinor);
      return tx.note.toLowerCase().includes(q) || tx.payee.toLowerCase().includes(q) || amount.includes(q.replace(/\D/g, "")) || tx.tags.some((item) => item.toLowerCase().includes(q));
    });
  }, [data.transactions, query, type, accountId, categoryId, tag, from, to]);
  const shown = rows.slice(0, limit);
  const groups = new Map<string, typeof shown>();
  for (const tx of shown) {
    const list = groups.get(tx.localDate) ?? [];
    list.push(tx);
    groups.set(tx.localDate, list);
  }
  return (
    <div className="flex flex-1 flex-col px-4 pt-5">
      <h1 className="font-display text-3xl">{t("activity")}</h1>
      <input className={`${fieldClass} mt-4`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
      <button type="button" className="mt-2 h-10 self-start text-sm text-muted" onClick={() => setOpenFilters((v) => !v)}>{openFilters ? t("lessFields") : t("filters")}</button>
      {openFilters ? (
        <div className="grid gap-2 rounded-2xl border border-line p-3">
          <select className={fieldClass} value={type} onChange={(e) => setType(e.target.value)} aria-label={t("type")}>
            <option value="all">{t("all")}</option>
            <option value="expense">{t("expense")}</option>
            <option value="income">{t("income")}</option>
            <option value="transfer">{t("transfer")}</option>
          </select>
          <select className={fieldClass} value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label={t("account")}>
            <option value="all">{t("all")}</option>
            {data.accounts.filter((a) => !a.deletedAt).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select className={fieldClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label={t("category")}>
            <option value="all">{t("all")}</option>
            {data.categories.filter((c) => !c.deletedAt).map((c) => <option key={c.id} value={c.id}>{categoryLabel(c, t)}</option>)}
          </select>
          <input className={fieldClass} value={tag} onChange={(e) => setTag(e.target.value)} placeholder={t("filterTag")} aria-label={t("filterTag")} />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" className={fieldClass} value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("from")} />
            <input type="date" className={fieldClass} value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("to")} />
          </div>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState title={t("noResults")} body={t("searchEmpty")} />
        </div>
      ) : (
        <div className="mt-2">
          {[...groups.entries()].map(([day, list]) => (
            <section key={day}>
              <h2 className="sticky top-0 bg-bg py-2 text-sm text-muted">{formatPrettyDate(day, locale, settings.easternDigits)}</h2>
              <ul className="divide-y divide-line">
                {list.map((tx) => {
                  const cat = data.categories.find((c) => c.id === tx.splits[0]?.categoryId);
                  return (
                    <li key={tx.id}>
                      <button type="button" className="flex w-full items-center gap-3 py-3 text-start" onClick={() => nav.push({ id: "tx", txId: tx.id })}>
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface">
                          <AppIcon name={tx.type === "transfer" ? "ArrowLeftRight" : cat?.icon ?? "CircleDollarSign"} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{tx.type === "transfer" ? t("transfer") : categoryLabel(cat, t)}{tx.payee ? ` · ${tx.payee}` : ""}</span>
                          <span className="block truncate text-sm text-muted">{tx.note || tx.status}{tx.status === "scheduled" ? ` · ${t("scheduledShort")}` : ""}</span>
                        </span>
                        <MoneyText minor={tx.amountMinor} currency={tx.currency} kind={tx.type === "transfer" ? "transfer" : tx.type} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {rows.length > limit ? (
            <button type="button" className="my-4 h-11 w-full rounded-full border border-line" onClick={() => setLimit((n) => n + 40)}>{t("seeAll")}</button>
          ) : null}
        </div>
      )}
    </div>
  );
}
