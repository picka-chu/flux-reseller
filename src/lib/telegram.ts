/** Minimal typed wrapper around the Telegram Mini App SDK (loaded from index.html). */
export interface TgWebApp {
  initData: string;
  colorScheme: "light" | "dark";
  platform?: string;
  initDataUnsafe?: { user?: { first_name?: string; username?: string; photo_url?: string } };
  viewportStableHeight?: number;
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  onEvent(event: string, cb: () => void): void;
  offEvent(event: string, cb: () => void): void;
  openTelegramLink?(url: string): void;
  showConfirm?(message: string, cb: (ok: boolean) => void): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
    selectionChanged(): void;
  };
}

declare global {
  interface Window { Telegram?: { WebApp?: TgWebApp } }
}

export const tg: TgWebApp | undefined = window.Telegram?.WebApp;
/** True only when opened inside Telegram with signed init data. */
export const inTelegram = Boolean(tg?.initData);

export function initTelegram() {
  try {
    tg?.ready();
    tg?.expand();
    tg?.disableVerticalSwipes?.();
  } catch { /* older clients */ }
  // Use Telegram's stable height so the layout doesn't jump when the toolbar shows or hides.
  const setHeight = () => {
    const h = tg?.viewportStableHeight;
    if (h) document.documentElement.style.setProperty("--app-h", `${h}px`);
  };
  setHeight();
  try { tg?.onEvent("viewportChanged", setHeight); } catch { /* older clients */ }
}

/** Native-feeling haptics; silently no-ops outside Telegram. */
export const haptic = {
  tap: () => tg?.HapticFeedback?.impactOccurred("light"),
  select: () => tg?.HapticFeedback?.selectionChanged(),
  success: () => tg?.HapticFeedback?.notificationOccurred("success"),
  error: () => tg?.HapticFeedback?.notificationOccurred("error"),
  warn: () => tg?.HapticFeedback?.notificationOccurred("warning")
};

/** Native confirm inside Telegram, window.confirm elsewhere. */
export function confirmAction(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (tg?.showConfirm && inTelegram) tg.showConfirm(message, resolve);
    else resolve(window.confirm(message));
  });
}
