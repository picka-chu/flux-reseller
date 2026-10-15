import { useEffect, useRef } from "react";
import { tg } from "../lib/telegram";

/**
 * Drives Telegram's native BackButton. It shows only while `visible`, and a tap calls the
 * latest `onBack`. The handler is kept in a ref, so the button is registered once per
 * visibility change rather than on every render.
 */
export function useBackButton(visible: boolean, onBack: () => void) {
  const latest = useRef(onBack);
  useEffect(() => { latest.current = onBack; });

  useEffect(() => {
    const bb = tg?.BackButton;
    if (!bb) return;
    if (!visible) { bb.hide(); return; }
    const fire = () => latest.current();
    bb.show();
    bb.onClick(fire);
    return () => bb.offClick(fire);
  }, [visible]);
}
