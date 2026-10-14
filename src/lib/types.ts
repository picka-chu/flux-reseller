export type Period = "month" | "year" | "one-time";

export interface Product {
  id: string; name: string; category: string; description: string;
  price: number; period: Period; icon: string; accent: string; tag?: string; features: string[]; in_stock: boolean;
  image_url?: string | null; sticker: string;
}
export interface Ad {
  id: string; title: string; body?: string | null; cta?: string | null;
  link_url?: string | null; image_url?: string | null; placement: string; ends_at?: string | null;
}
export interface AdminAd extends Ad {
  active: boolean; created_at: string;
}
export interface Me {
  id: number; first_name?: string; username?: string; balance: number; orders_count: number;
}
export interface Topup {
  id: string; method: string; status: string; reference: string; amount: number;
  expected_amount: number; expires_at: string; tx_reference?: string; created_at: string;
}
export interface Order {
  id: string; product_id: string; product_name?: string; price: number; status: string; created_at: string; delivery_note?: string;
}
export interface AdminOverview {
  users: number; orders: number; pending_topups: number; pending_orders: number;
  wallet_liabilities: number; approved_topups: number;
}
export interface AdminTopup {
  id: string; telegram_id: number; username?: string; method: string; status: string;
  tx_reference?: string; reference: string; created_at: string; base_cents: number;
}
export interface AdminOrder {
  id: string; telegram_id: number; username?: string; first_name?: string;
  product_id: string; product_name?: string; status: string; price: number; cost: number; created_at: string;
}
export interface AdminUser {
  telegram_id: number; username?: string; first_name?: string; balance: number; orders_count: number;
}
export interface AdminDashboard {
  generated_at: string;
  totals: {
    users: number; orders: number; revenue: number; paying_customers: number;
    pending_topups: number; pending_orders: number; wallet_liabilities: number;
    approved_topups: number; live_ads: number; profit: number;
  };
  series: { date: string; orders: number; revenue: number; customers: number }[];
  status_breakdown: { status: string; count: number }[];
  top_products: { product_id: string; name: string; orders: number; revenue: number }[];
  recent: { kind: "order" | "topup"; id: string; title: string; subtitle: string; status: string; amount: number; at: string }[];
}

export interface CatalogDefaults { margin_percent: number; markup_cents: number }
export interface AdminCatalogItem {
  id: number; sid: string; name: string; display_name?: string | null; category: string; period: Period;
  tag?: string | null; enabled: boolean; in_stock: boolean; stock: number; supplier_price: number;
  cost_cents: number; margin_percent: number | null; markup_cents: number | null;
  sell_cents: number; profit_cents: number; synced_at: string | null;
  image_url: string | null; supplier_image: string | null; sticker: string; featured: boolean;
}
export interface AdminCatalog { defaults: CatalogDefaults; items: AdminCatalogItem[] }
export interface AdminSettings {
  default_margin_percent: number; default_markup_cents: number; bybit_address: string;
  telegram_wallet_address: string; catalog_synced_at: string | null; catalog_count: number;
  supplier: { configured: boolean; store: string | null; ordering_enabled: boolean | null; balance: number | null; currency: string | null; error: string | null };
}

export interface SupportMessage { id: string; sender: "customer" | "admin"; body: string; created_at: string }
export interface SupportState { thread: { id: string; status: string } | null; messages: SupportMessage[] }

export interface FeedSection { key: string; title: string; subtitle: string; items: Product[] }
