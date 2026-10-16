import type { TxType } from "@/masroof/types";

export type View =
  | { id: "home" }
  | { id: "activity" }
  | { id: "plan" }
  | { id: "more" }
  | { id: "inbox" }
  | { id: "reports" }
  | { id: "accounts" }
  | { id: "account"; accountId?: string }
  | { id: "categories" }
  | { id: "rates" }
  | { id: "revalue" }
  | { id: "backup" }
  | { id: "import" }
  | { id: "trash" }
  | { id: "privacy" }
  | { id: "settings" }
  | { id: "calculator" }
  | { id: "reset" }
  | { id: "tx"; txId: string }
  | { id: "budget"; budgetId?: string }
  | { id: "goal"; goalId?: string }
  | { id: "rule"; ruleId?: string };

export type Nav = {
  view: View;
  push: (view: View) => void;
  pop: () => void;
  tab: (id: "home" | "activity" | "plan" | "more") => void;
  openAdd: (type?: TxType, editingId?: string, series?: "one" | "future" | null) => void;
};
