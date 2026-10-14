import { Home, Package, Store, UserRound, Wallet, type LucideIcon } from "lucide-react";
import { haptic, tg } from "../lib/telegram";

export type Tab = "home" | "shop" | "wallet" | "orders" | "profile";
const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "shop", label: "Shop", icon: Store },
  { id: "wallet", label: "Wallet", icon: Wallet },
  { id: "orders", label: "Orders", icon: Package },
  { id: "profile", label: "Profile", icon: UserRound }
];

export function Avatar({ name, size = 36 }: { name?: string; size?: number }) {
  const photo = tg?.initDataUnsafe?.user?.photo_url;
  if (photo) return <img src={photo} width={size} height={size} alt="" className="rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <span className="grid place-items-center rounded-full bg-brand font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {(name || "S").trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function Header({ onProfile, name }: { onProfile: () => void; name?: string }) {
  return (
    <header className="sticky top-0 z-20 -mx-5 flex h-[calc(56px+env(safe-area-inset-top))] items-center justify-end bg-bg/90 px-5 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <button onClick={onProfile} aria-label="Profile"><Avatar name={name} /></button>
    </header>
  );
}

export function BottomNav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl" aria-label="Main">
      <div className="mx-auto flex max-w-2xl">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => { haptic.select(); onChange(id); }}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] font-semibold transition-colors ${active ? "text-brand" : "text-muted"}`}
            >
              <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
