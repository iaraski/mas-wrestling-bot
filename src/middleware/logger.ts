import { BotContext } from '../types/session';

export const loggerMiddleware = async (ctx: BotContext, next: () => Promise<void>) => {
  const startTime = Date.now();
  try {
    const from = ctx.from;
    if (ctx.updateType === 'message' && ctx.message && 'text' in ctx.message) {
      console.log(`[Bot Update] message from ${from?.id} (@${from?.username ?? '—'})`);
      console.log(`[Bot Message] Text: "${ctx.message.text}"`);
    } else if (ctx.updateType === 'callback_query' && ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      console.log(`[Bot Update] callback_query from ${from?.id} (@${from?.username ?? '—'})`);
      console.log(`[Bot Action] Callback: "${ctx.callbackQuery.data}"`);
    }

    await next();
  } finally {
    const duration = Date.now() - startTime;
    console.log(`[Bot Processing] Finished in ${duration}ms`);
  }
};

