import dotenv from 'dotenv';
import { Scenes, Telegraf, session } from 'telegraf';

import { setupHandlers } from './handlers';
import { loggerMiddleware } from './middleware/logger';
import { editPassportScene } from './scenes/editPassport.scene';
import { editProfileScene } from './scenes/editProfile.scene';
import { firstRegistrationScene } from './scenes/firstRegistration.scene';
import { passportScene } from './scenes/passport.scene';
import { BotContext } from './types/session';

dotenv.config();

const bot = new Telegraf<BotContext>(process.env.BOT_TOKEN!);

// 1. Сцены
const stage = new Scenes.Stage<BotContext>([
  firstRegistrationScene,
  passportScene,
  editProfileScene,
  editPassportScene,
]);

// 2. Middleware
bot.use(session());
bot.use(loggerMiddleware);
bot.use(stage.middleware());

// 3. Обработчики
setupHandlers(bot);

// Запуск
bot.launch();
console.log('BOT STARTED');
