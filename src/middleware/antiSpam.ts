import { BotContext } from '../types/session';

// Глобальный (в рамках процесса) набор ID пользователей, чьи запросы сейчас обрабатываются.
// Это решает проблему "гонки", так как сессия в Telegraf сохраняется только в конце запроса.
const processingUsers = new Set<number>();

/**
 * Middleware для защиты от спама по инлайн-кнопкам.
 * Использует глобальный Set для блокировки, чтобы избежать проблем с асинхронностью сессий.
 */
export async function antiSpamMiddleware(ctx: BotContext, next: () => Promise<void>) {
  // Обрабатываем только callback_query (нажатия на инлайн-кнопки)
  if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
    const userId = ctx.from?.id;
    if (!userId) return next();

    const actionData = (ctx.callbackQuery as any).data;

    // Если этот пользователь уже "в процессе" — игнорируем
    if (processingUsers.has(userId)) {
      console.log(`[Anti-Spam] !! BLOCKING !! user ${userId} clicked ${actionData} while busy`);
      // Отвечаем Telegram, чтобы убрать индикатор загрузки, но не выполняем действие
      return ctx.answerCbQuery('Пожалуйста, подождите...').catch(() => {});
    }

    // Блокируем пользователя
    processingUsers.add(userId);
    console.log(`[Anti-Spam] >> LOCK >> user ${userId} started ${actionData}`);

    try {
      // Выполняем цепочку обработчиков
      await next();
    } catch (error) {
      console.error(`[Anti-Spam] Error for user ${userId}:`, error);
      // Если это ошибка "message is not modified", просто игнорируем её
      if (error instanceof Error && error.message.includes('message is not modified')) {
        return;
      }
      throw error;
    } finally {
      // Разблокируем пользователя
      processingUsers.delete(userId);
      console.log(`[Anti-Spam] << UNLOCK << user ${userId} finished`);
    }
  } else {
    // Для обычных сообщений (текст) просто продолжаем
    return next();
  }
}
