import { useCallback, useEffect, useState } from "react";
import { exitFullscreen, fullscreenSupported, onTelegramEvent, requestFullscreen, tg } from "../lib/telegram";

/** Current full-screen state inside Telegram, with a toggle. Reports false outside Telegram. */
export function useFullscreen() {
  const supported = fullscreenSupported();
  const [active, setActive] = useState<boolean>(Boolean(tg?.isFullscreen));

  useEffect(() => {
    const offChanged = onTelegramEvent("fullscreenChanged", () => setActive(Boolean(tg?.isFullscreen)));
    const offFailed = onTelegramEvent("fullscreenFailed", () => setActive(Boolean(tg?.isFullscreen)));
    return () => { offChanged(); offFailed(); };
  }, []);

  const toggle = useCallback(() => {
    if (!supported) return;
    if (active) exitFullscreen(); else requestFullscreen();
  }, [active, supported]);

  return { supported, active, toggle };
}
