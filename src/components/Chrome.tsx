import { Home, Package, UserRound, Wallet, type LucideIcon } from "lucide-react";
import { haptic, tg } from "../lib/telegram";

export type Tab = "home" | "wallet" | "orders" | "profile";
const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "wallet", label: "Wallet", icon: Wallet },
  { id: "orders", label: "Orders", icon: Package },
  { id: "profile", label: "Profile", icon: UserRound }
];

export function BrandMark({ size = 32 }: { size?: number }) {
  return <img src="/flux-mark.svg" width={size} height={size} alt="" className="rounded-[28%]" />;
}

export function Avatar({ name, size = 36 }: { name?: string; size?: number }) {
  const photo = tg?.initDataUnsafe?.user?.photo_url;
  if (photo) return <img src={photo} width={size} height={size} alt="" className="rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <span className="grid place-items-center rounded-full bg-brand font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {(name || "F").trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function Header({ onHome, onProfile, name }: { onHome: () => void; onProfile: () => void; name?: string }) {
  return (
    <header className="sticky top-0 z-20 -mx-5 flex h-14 items-center justify-between bg-bg/85 px-5 backdrop-blur-xl">
      <button onClick={onHome} className="flex items-center gap-2.5" aria-label="FLUX home">
        <BrandMark />
        <span className="text-[17px] font-extrabold tracking-[0.04em]">FLUX</span>
      </button>
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
              <Icon size={23} strokeWidth={active ? 2.3 : 1.8} />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
