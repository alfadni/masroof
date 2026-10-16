export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i] ?? "";
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (/[",\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
          return cell;
        })
        .join(","),
    )
    .join("\n");
}

export type CsvRow = {
  line: number;
  date: string;
  type: string;
  account: string;
  toAccount: string;
  amount: string;
  currency: string;
  toAmount: string;
  toCurrency: string;
  category: string;
  note: string;
  payee: string;
  tags: string;
};

export function mapCsv(text: string): { headers: string[]; rows: CsvRow[] } | null {
  const table = parseCsv(text.trim());
  if (table.length < 2) return null;
  const headers = (table[0] ?? []).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => headers.indexOf(name);
  const need = ["date", "type", "amount"];
  if (need.some((n) => idx(n) < 0)) return null;
  const rows: CsvRow[] = [];
  for (let r = 1; r < table.length; r += 1) {
    const cols = table[r] ?? [];
    const get = (name: string) => (idx(name) >= 0 ? (cols[idx(name)] ?? "").trim() : "");
    rows.push({
      line: r + 1,
      date: get("date"),
      type: get("type").toLowerCase(),
      account: get("account"),
      toAccount: get("to_account"),
      amount: get("amount"),
      currency: get("currency").toUpperCase(),
      toAmount: get("to_amount"),
      toCurrency: get("to_currency").toUpperCase(),
      category: get("category"),
      note: get("note"),
      payee: get("payee"),
      tags: get("tags"),
    });
  }
  return { headers, rows };
}
