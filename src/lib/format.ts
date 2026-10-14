const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const money = (n: number | null | undefined) => usd.format(Number(n ?? 0));

export function moneyParts(n: number | null | undefined) {
  const [whole, cents] = Number(n ?? 0).toFixed(2).split(".");
  return { whole: Number(whole).toLocaleString("en-US"), cents };
}

export const titleCase = (s: string) => s.replaceAll("_", " ").replaceAll("-", " ");

export function shortDate(iso: string) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export type Tone = "up" | "down" | "warn" | "neutral";
export function statusTone(status: string): Tone {
  if (["approved", "delivered", "active"].includes(status)) return "up";
  if (["rejected", "failed", "refunded", "expired"].includes(status)) return "down";
  if (["pending", "pending_review", "processing"].includes(status)) return "warn";
  return "neutral";
}

/** Short billing suffix for subscription prices. */
export const periodSuffix = (p?: string) => (p === "month" ? "/month" : p === "year" ? "/year" : "");
