import { api } from 'sdk';

// Safe pilot only: this handler does not touch FLUX data or supplier services.
export default async function (message) {
  const text = (message.text ?? '').trim();
  if (text !== '/start' && !text.startsWith('/start@')) return;

  await api.sendMessage({
    chat_id: message.chat.id,
    text: 'FLUX Serverless pilot is online. This is a test bot; no wallet or orders are connected.',
  });
}
