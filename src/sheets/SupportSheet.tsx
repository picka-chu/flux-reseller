import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { Empty, useToast } from "../components/ui";
import { post, request } from "../lib/api";
import type { SupportState } from "../lib/types";

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** In-app chat with the store team. Admin replies also arrive in the Telegram bot. */
export function SupportSheet() {
  const toast = useToast();
  const [state, setState] = useState<SupportState | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try { setState(await request<SupportState>("/api/support")); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't load messages", "error"); }
  };

  useEffect(() => {
    void load();
    const id = window.setInterval(load, 15000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [state?.messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try { await post("/api/support/messages", { body }); setText(""); await load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't send", "error"); }
    finally { setSending(false); }
  };

  return (
    <div className="flex h-[72dvh] flex-col">
      <p className="mb-3 text-center text-[16px] font-semibold">Support</p>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-3">
        {state && !state.messages.length && (
          <Empty icon={MessageCircle} title="How can we help?" text="Ask about top-ups, orders or your wallet. We reply here and in the bot." />
        )}
        {state?.messages.map((m) => (
          <div key={m.id} className={`flex ${m.sender === "customer" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] whitespace-pre-wrap break-words rounded-[18px] px-3.5 py-2 text-[15px] leading-snug ${m.sender === "customer" ? "rounded-br-md bg-brand text-white dark:text-[#0a0b0d]" : "rounded-bl-md bg-fill"}`}>
              {m.body}
              <span className="mt-0.5 block text-right text-[10px] opacity-70">{clock(m.created_at)}</span>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex items-end gap-2 border-t border-line pt-3">
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          placeholder="Write a message"
          aria-label="Message"
          className="input max-h-32 min-h-[48px] flex-1 resize-none py-3 !h-auto"
        />
        <button
          onClick={send}
          disabled={!text.trim() || sending}
          aria-label="Send"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand text-white disabled:opacity-40 dark:text-[#0a0b0d]"
        >
          <Send size={19} />
        </button>
      </div>
    </div>
  );
}
