# Telegram Serverless pilot (isolated)

This is an **isolated proof of concept** for evaluating Telegram Serverless alongside FLUX. It does not replace `main.py`, change Render, access Supabase, or contain wallet/order/supplier operations.

## Safety rules

- Use a **new test bot** created with @BotFather. Do not enable Serverless on the production FLUX bot during this pilot.
- Keep Render/FastAPI + Supabase as the production source of truth.
- Do not add supplier credentials, payment details, wallet writes, or admin actions to this pilot.
- Telegram Serverless' current docs do not publish a clear pricing table, hard quotas, or production SLA. Verify the terms in BotFather before depending on it commercially.

## Test on Android/Termux or a computer

Requires Node.js 18+ and npm.

1. Create a separate test bot with @BotFather, then open that bot's **Serverless** section and enable it.
2. From this directory, initialize the official CLI project without overwriting the pilot files:

   ```sh
   npm create @tgcloud/bot .
   ```

   If the CLI asks to scaffold existing files, inspect its output before accepting changes. Keep the provided `tgcloud/` modules.
3. Link the **test bot's Serverless CLI access token** (not the normal Bot API token):

   ```sh
   npx tgcloud login
   ```

4. Test locally against the platform runtime, then deploy only to the test bot:

   ```sh
   npx tgcloud run handlers/message '{ chat: { id: 123, type: "private" }, text: "/start" }'
   npx tgcloud run endpoints/pilotStatus '{}' --ctx '{ initData: { user: { id: 123, first_name: "Test" } } }'
   npx tgcloud status
   npx tgcloud push
   ```

5. Message the test bot with `/start`. Check the result with `npx tgcloud webhook`.

## What success means

- /start replies reliably from Telegram Serverless.
- The Mini App endpoint only executes for valid Telegram Mini App init data.
- Test bot's webhook is managed by Serverless without affecting FLUX production.
- No existing wallet, top-up, order, refund, supplier, or Supabase data is touched.

## Next phase (not included)

A read-only catalogue endpoint could call a deliberately limited backend endpoint or Supabase REST using a restricted read-only key, after reviewing the current database schema and row-level security. Do **not** expose a Supabase service-role key in the browser or use it for this pilot. Do not move money-related operations until transaction guarantees, idempotency, reconciliation, audit logs, and failure handling are proven.
