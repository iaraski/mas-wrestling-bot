import { Scenes } from 'telegraf';
import { BotContext } from '../types/session';

export const editPassportScene = new Scenes.WizardScene<BotContext>(
  'edit-passport',
  async (ctx) => {
    await ctx.reply('Паспортные данные заполняются администратором/секретарём.');
    await ctx.scene.enter('edit-profile');
  },
);
