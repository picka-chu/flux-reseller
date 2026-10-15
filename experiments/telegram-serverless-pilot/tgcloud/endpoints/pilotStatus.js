// Safe read-only smoke test. Telegram Serverless validates Mini App init data
// before invoking this endpoint; use ctx.initData rather than client-supplied IDs.
export default async function (_input, ctx) {
  const user = ctx.initData?.user;
  if (!user?.id) {
    throw new Error('Verified Telegram user context is missing');
  }

  return {
    ok: true,
    mode: 'pilot',
    readOnly: true,
    telegramUserId: user.id,
    message: 'Serverless endpoint is reachable. No FLUX data was accessed.',
  };
}
