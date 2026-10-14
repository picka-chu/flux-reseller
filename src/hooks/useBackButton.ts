import { useEffect } from "react";
import { tg } from "../lib/telegram";

/** Shows Telegram's native BackButton while `visible` and routes it to `onBack`. */
export function useBackButton(visible: boolean, onBack: () => void) {
  useEffect(() => {
    const bb = tg?.BackButton;
    if (!bb) return;
    if (!visible) { bb.hide(); return; }
    bb.show();
    bb.onClick(onBack);
    return () => bb.offClick(onBack);
  }, [visible, onBack]);
}
