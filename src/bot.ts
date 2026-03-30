import dotenv from 'dotenv';
import { Scenes, Telegraf, session } from 'telegraf';

import { setupHandlers } from './handlers';
import { antiSpamMiddleware } from './middleware/antiSpam';
import { loggerMiddleware } from './middleware/logger';
import { editPassportScene } from './scenes/editPassport.scene';
import { editProfileScene } from './scenes/editProfile.scene';
import { firstRegistrationScene } from './scenes/firstRegistration.scene';
import { passportScene } from './scenes/passport.scene';
import { applyCompetitionScene } from './scenes/applyCompetition.scene';
import { BotContext } from './types/session';

dotenv.config();

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error('BOT_TOKEN is required');
}

const bot = new Telegraf<BotContext>(token);

// 1. Сцены
const stage = new Scenes.Stage<BotContext>([
  firstRegistrationScene,
  passportScene,
  editProfileScene,
  editPassportScene,
  applyCompetitionScene,
]);

// 2. Middleware
bot.use(session());
bot.use(loggerMiddleware); // Сначала логируем
bot.use(antiSpamMiddleware); // Потом блокируем спам
bot.use(stage.middleware()); // Потом сцены

// 3. Обработчики
setupHandlers(bot);

bot.catch(async (err, ctx) => {
  console.error('[Bot] Unhandled error:', err);
  try {
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  } catch {}
});

process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Process] Uncaught exception:', error);
  process.exit(1);
});

// Запуск
bot.launch();
console.log('BOT STARTED');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
