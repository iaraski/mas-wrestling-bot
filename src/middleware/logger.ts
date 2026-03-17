import { BotContext } from '../types/session';

export const loggerMiddleware = async (ctx: BotContext, next: () => Promise<void>) => {
  const start = Date.now();
  const updateType = ctx.updateType;
  const from = ctx.from?.id || 'unknown';
  const username = ctx.from?.username || 'no_username';

  console.log(`[Bot Update] ${updateType} from ${from} (@${username})`);

  if (ctx.message && 'text' in ctx.message) {
    console.log(`[Bot Message] Text: "${ctx.message.text}"`);
  } else if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
    console.log(`[Bot Action] Callback: "${ctx.callbackQuery.data}"`);
  }

  await next();
  const duration = Date.now() - start;
  console.log(`[Bot Processing] Finished in ${duration}ms`);
};
