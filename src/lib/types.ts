export interface Product {
  id: string; name: string; category: string; description: string;
  price: number; icon: string; accent: string; tag?: string;
}
export interface Me {
  id: number; first_name?: string; username?: string; balance: number; orders_count: number;
}
export interface Topup {
  id: string; method: string; status: string; reference: string; amount: number;
  expected_amount: number; expires_at: string; tx_reference?: string; created_at: string;
}
export interface Order {
  id: string; product_id: string; price: number; status: string; created_at: string; delivery_note?: string;
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
  product_id: string; status: string; price: number; created_at: string;
}
export interface AdminUser {
  telegram_id: number; username?: string; first_name?: string; balance: number; orders_count: number;
}
