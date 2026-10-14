import { useCallback, useEffect, useState } from "react";
import { tg } from "../lib/telegram";

export type ThemeMode = "auto" | "light" | "dark";
const KEY = "flux-theme";
const COLORS = { light: "#ffffff", dark: "#0a0b0d" };

const read = (): ThemeMode => {
  try { const v = localStorage.getItem(KEY); if (v === "light" || v === "dark") return v; } catch { /* storage blocked */ }
  return "auto";
};
const system = (): "light" | "dark" =>
  tg?.colorScheme ?? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");

/** Follows Telegram's theme by default; the user can pin light or dark. */
export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(read);
  const [sys, setSys] = useState<"light" | "dark">(system);
  const resolved = mode === "auto" ? sys : mode;

  useEffect(() => {
    const update = () => setSys(system());
    tg?.onEvent("themeChanged", update);
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener("change", update);
    return () => { tg?.offEvent("themeChanged", update); mq?.removeEventListener("change", update); };
  }, []);

  useEffect(() => {
    const color = COLORS[resolved];
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
    try { tg?.setHeaderColor?.(color); tg?.setBackgroundColor?.(color); tg?.setBottomBarColor?.(color); } catch { /* older clients */ }
  }, [resolved]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    try { if (m === "auto") localStorage.removeItem(KEY); else localStorage.setItem(KEY, m); } catch { /* ignore */ }
  }, []);

  return { mode, resolved, setMode };
}
