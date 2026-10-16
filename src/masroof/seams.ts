import type { AuditRow, Transaction } from "@/masroof/types";

/** v2 seam — encrypted sync. Not implemented in this edition. */
export interface SyncAdapter {
  push(changes: AuditRow[]): Promise<void>;
  pull(sinceVersion: number): Promise<AuditRow[]>;
}

/** v2 seam — bank or SMS import. Not implemented. */
export interface ImportSource {
  id: string;
  pull(): Promise<Pick<Transaction, "localDate" | "amountMinor" | "note" | "currency">[]>;
}

/** v2 seam — on-device receipt scan. Not implemented. */
export interface OcrProvider {
  scan(image: Blob): Promise<{ amount?: string; note?: string }>;
}
