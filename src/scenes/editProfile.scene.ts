import { Markup, Scenes } from 'telegraf';
import { supabase } from '../supabase';
import { BotContext } from '../types/session';

export const editProfileScene = new Scenes.WizardScene<BotContext>(
  'edit-profile',

  // 1. Выбор поля для редактирования
  async (ctx) => {
    await ctx.reply(
      'Что вы хотите изменить?',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('ФИО', 'edit_full_name'),
          Markup.button.callback('Email', 'edit_email'),
        ],
        [
          Markup.button.callback('Телефон', 'edit_phone'),
          Markup.button.callback('ФИО Тренера', 'edit_coach'),
        ],
        [Markup.button.callback('🪪 Паспортные данные', 'edit_passport')],
        [Markup.button.callback('❌ Отмена', 'cancel_edit')],
      ]),
    );
    return ctx.wizard.next();
  },

  // 2. Обработка выбора и запрос нового значения
  async (ctx) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    const action = ctx.callbackQuery.data;
    await ctx.answerCbQuery();

    if (action === 'cancel_edit') {
      await ctx.reply('Редактирование отменено.');
      return ctx.scene.leave();
    }

    if (action === 'edit_passport') {
      return ctx.scene.enter('edit-passport');
    }

    (ctx.wizard.state as any).editAction = action;

    const prompts: Record<string, string> = {
      edit_full_name: 'Введите новое ФИО:',
      edit_email: 'Введите новый Email:',
      edit_phone: 'Введите новый номер телефона:',
      edit_coach: 'Введите новое ФИО тренера:',
    };

    await ctx.reply(prompts[action]);
    return ctx.wizard.next();
  },

  // 3. Сохранение изменений
  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) return;
    const newValue = ctx.message.text;
    const action = (ctx.wizard.state as any).editAction;
    const userId = ctx.session.supabaseUserId;

    if (!userId) return ctx.scene.leave();

    try {
      if (action === 'edit_full_name') {
        await supabase.from('profiles').update({ full_name: newValue }).eq('user_id', userId);
      } else if (action === 'edit_email') {
        await supabase.from('users').update({ email: newValue }).eq('id', userId);
      } else if (action === 'edit_phone') {
        await supabase.from('profiles').update({ phone: newValue }).eq('user_id', userId);
      } else if (action === 'edit_coach') {
        await supabase.from('athletes').update({ coach_name: newValue }).eq('user_id', userId);
      }

      await ctx.reply('✅ Изменения успешно сохранены!');
    } catch (err) {
      console.error('Update profile error:', err);
      await ctx.reply('❌ Ошибка при сохранении изменений.');
    }

    return ctx.scene.leave();
  },
);
