/** Minimal typed wrapper around the Telegram Mini App SDK (loaded from index.html). */
export interface Insets { top: number; bottom: number; left: number; right: number }

export interface TgWebApp {
  initData: string;
  /** Bot API 8.0+: full-screen mode and the insets Telegram reserves for its own controls. */
  isFullscreen?: boolean;
  requestFullscreen?(): void;
  exitFullscreen?(): void;
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
  isVersionAtLeast?(version: string): boolean;
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

/** Full screen is only offered on phones, and only from Bot API 8.0 onwards. */
export function fullscreenSupported(): boolean {
  if (!tg?.requestFullscreen || !tg.isVersionAtLeast?.("8.0")) return false;
  const platform = tg.platform ?? "";
  return platform === "ios" || platform.startsWith("android");
}

export function requestFullscreen(): boolean {
  if (!fullscreenSupported()) return false;
  try { tg!.requestFullscreen!(); return true; } catch { return false; }
}

export function exitFullscreen(): void {
  try { tg?.exitFullscreen?.(); } catch { /* not supported */ }
}

/**
 * Keep our top and bottom padding clear of Telegram's own controls (close, menu, home indicator).
 * Telegram reports the device inset and its own content inset separately; we add them together
 * so nothing sits underneath either. Outside Telegram, the CSS fallbacks use env().
 */
function applySafeAreas() {
  if (!tg) return;
  const root = document.documentElement.style;
  const s = tg.safeAreaInset, c = tg.contentSafeAreaInset;
  root.setProperty("--safe-top", `${(s?.top ?? 0) + (c?.top ?? 0)}px`);
  root.setProperty("--safe-bottom", `${(s?.bottom ?? 0) + (c?.bottom ?? 0)}px`);
  root.setProperty("--safe-left", `${(s?.left ?? 0) + (c?.left ?? 0)}px`);
  root.setProperty("--safe-right", `${(s?.right ?? 0) + (c?.right ?? 0)}px`);
}

export function initTelegram() {
  try {
    tg?.ready();
    tg?.expand();
    tg?.disableVerticalSwipes?.();
  } catch { /* older clients */ }

  applySafeAreas();
  for (const event of ["safeAreaChanged", "contentSafeAreaChanged", "fullscreenChanged"]) {
    try { tg?.onEvent(event, applySafeAreas); } catch { /* older clients */ }
  }

  // Full screen on phones. Telegram may refuse without a tap, so retry once on the first touch.
  if (fullscreenSupported() && !tg?.isFullscreen) {
    if (!requestFullscreen()) {
      const retry = () => { requestFullscreen(); document.removeEventListener("pointerdown", retry); };
      document.addEventListener("pointerdown", retry, { once: false });
    }
  }

  // Use Telegram's stable height so the layout doesn't jump when the toolbar shows or hides.
  const setHeight = () => {
    const h = tg?.viewportStableHeight;
    if (h) document.documentElement.style.setProperty("--app-h", `${h}px`);
  };
  setHeight();
  try { tg?.onEvent("viewportChanged", setHeight); } catch { /* older clients */ }
}

/** Subscribe to Telegram events and return an unsubscribe function. */
export function onTelegramEvent(event: string, cb: () => void): () => void {
  tg?.onEvent(event, cb);
  return () => tg?.offEvent(event, cb);
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
