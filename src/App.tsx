import { useCallback, useEffect, useState } from "react";
import { BottomNav, Header, type Tab } from "./components/Chrome";
import { Sheet, ToastProvider } from "./components/ui";
import { useBackButton } from "./hooks/useBackButton";
import { useFullscreen } from "./hooks/useFullscreen";
import { useResource } from "./hooks/useResource";
import { useTheme } from "./hooks/useTheme";
import { request } from "./lib/api";

import type { FeedSection, Me, Order, Product, Topup } from "./lib/types";
import { Home } from "./pages/Home";
import { Orders } from "./pages/Orders";
import { Shop } from "./pages/Shop";
import { Profile } from "./pages/Profile";
import { Wallet } from "./pages/Wallet";
import { InfoSheet, SuccessSheet } from "./sheets/InfoSheets";
import { SupportSheet } from "./sheets/SupportSheet";
import { PaymentSheet } from "./sheets/PaymentSheet";
import { ProductPage } from "./pages/ProductPage";
import { TopUpSheet, type TopupCreated } from "./sheets/TopUpSheet";

type SheetState =
  | { type: "topup" }
  | { type: "payment"; data: TopupCreated }
  | { type: "submitted" }
  | { type: "purchased"; id: string }
  | { type: "info"; kind: "safety" }
  | { type: "support" };

export default function App() {
  const theme = useTheme();
  const fullscreen = useFullscreen();
  const [tab, setTab] = useState<Tab>("home");
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [shopCategory, setShopCategory] = useState("All");

  const me = useResource(() => request<Me>("/api/me"));
  const products = useResource(() => request<Product[]>("/api/products"));
  const feed = useResource(() => request<FeedSection[]>("/api/feed"));
  const orders = useResource(() => request<Order[]>("/api/orders"), false);
  const topups = useResource(() => request<Topup[]>("/api/topups"), false);

  useEffect(() => {
    if (tab === "wallet") { void topups.reload(); void me.reload(); }
    if (tab === "orders") void orders.reload();
    if (tab === "profile") void me.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const closeSheet = useCallback(() => setSheet(null), []);
  const go = useCallback((t: Tab) => { setTab(t); setSheet(null); setSelectedProduct(null); window.scrollTo({ top: 0, behavior: "smooth" }); }, []);
  const closeProduct = useCallback(() => { setSelectedProduct(null); window.scrollTo({ top: 0, behavior: "smooth" }); }, []);
  useBackButton(sheet !== null || selectedProduct !== null || tab !== "home", () => (sheet ? closeSheet() : selectedProduct ? closeProduct() : go("home")));

  const openTopup = () => setSheet({ type: "topup" });
  const openHelp = () => setSheet({ type: "support" });
  const openShop = useCallback((category = "All") => {
    setShopCategory(category);
    setTab("shop");
    setSheet(null);
    setSelectedProduct(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <ToastProvider>
      <div className="app-shell mx-auto w-full max-w-[480px] overflow-x-clip px-4 pb-[calc(104px+var(--safe-bottom))] sm:px-5">
        {!selectedProduct && <Header name={me.data?.first_name} onProfile={() => go("profile")} />}
        <main key={selectedProduct ? `product-${selectedProduct.id}` : tab}>
          {selectedProduct ? (
            <div className="pt-[var(--safe-top)]"><ProductPage product={selectedProduct} me={me.data} meLoading={me.loading} onBack={closeProduct} onTopup={openTopup} onPurchased={(id) => { setSelectedProduct(null); setSheet({ type: "purchased", id }); void me.reload(); void orders.reload(); }}  /></div>
          ) : <>
          {tab === "home" && (
            <Home
              me={me.data} meLoading={me.loading}
              products={products.data} productsLoading={products.loading} productsError={products.error}
              feed={feed.data} feedLoading={feed.loading} feedError={feed.error}
              onBuy={setSelectedProduct}
              onTopup={openTopup} onShop={openShop} onHelp={openHelp} onRetry={() => { void feed.reload(); void products.reload(); }}
            />
          )}
          {tab === "shop" && (
            <Shop
              key={shopCategory} initialCategory={shopCategory}
              products={products.data} productsLoading={products.loading} productsError={products.error}
              onBuy={setSelectedProduct} onRetry={products.reload}
            />
          )}
          {tab === "wallet" && <Wallet me={me.data} meLoading={me.loading} topups={topups.data} loading={topups.loading} error={topups.error} onTopup={openTopup} onRefresh={topups.reload} />}
          {tab === "orders" && <Orders orders={orders.data} loading={orders.loading} error={orders.error} onRefresh={orders.reload} onExplore={() => go("home")} />}
          {tab === "profile" && <Profile me={me.data} meLoading={me.loading} mode={theme.mode} onMode={theme.setMode} go={go} onHelp={openHelp} onSafety={() => setSheet({ type: "info", kind: "safety" })} fullscreen={fullscreen} />}
          </>}
        </main>
      </div>
      {!selectedProduct && <BottomNav tab={tab} onChange={go} />}

      {sheet && (
        <Sheet onClose={closeSheet}>
          {sheet.type === "topup" && <TopUpSheet onCreated={(data) => { setSheet({ type: "payment", data }); void topups.reload(); }} />}
          {sheet.type === "payment" && <PaymentSheet data={sheet.data} onSubmitted={() => { setSheet({ type: "submitted" }); void topups.reload(); }} />}
          {sheet.type === "submitted" && <SuccessSheet title="Sent for review" body="Your balance updates once an administrator confirms the funds arrived." cta="Done" onDone={() => go("wallet")} />}
          {sheet.type === "purchased" && <SuccessSheet title="Order placed" body={`Order ${sheet.id} is being processed. Your access details will appear under Orders once it is delivered.`} cta="View orders" onDone={() => go("orders")} />}
          {sheet.type === "info" && <InfoSheet kind={sheet.kind} onClose={closeSheet} />}
          {sheet.type === "support" && <SupportSheet />}
        </Sheet>
      )}
    </ToastProvider>
  );
}
