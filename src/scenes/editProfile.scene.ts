import { Markup, Scenes } from 'telegraf';
import { supabase } from '../supabase';
import { BotContext } from '../types/session';
import { validators } from '../utils/validation';

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
        [Markup.button.callback('Населенный пункт', 'edit_city')],
        [Markup.button.callback('🪪 Паспортные данные', 'edit_passport')],
        [Markup.button.callback('❌ Отмена', 'cancel_edit')],
      ]),
    );
    return ctx.wizard.next();
  },

  // 2. Обработка выбора и запрос нового значения
  async (ctx) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    const cbQuery = ctx.callbackQuery as any;
    const action = cbQuery.data;
    const actionText = cbQuery.message?.reply_markup?.inline_keyboard
      ?.flat()
      .find((b: any) => b.callback_data === action)?.text;

    await ctx.answerCbQuery();

    if (action === 'cancel_edit') {
      const messageId = (ctx.callbackQuery as any)?.message?.message_id;
      if (ctx.chat?.id && messageId) {
        await ctx.telegram.deleteMessage(ctx.chat.id, messageId).catch(() => {});
      } else {
        await ctx.deleteMessage().catch(() => {});
      }
      return ctx.scene.leave();
    }

    if (action === 'edit_passport') {
      await ctx.editMessageText('Переход к редактированию паспорта...').catch(() => {});
      await ctx.scene.enter('edit-passport');
      return;
    }

    // Убираем кнопки выбора поля
    await ctx.editMessageText(`Выбрано для изменения: ${actionText}`).catch(() => {});

    (ctx.wizard.state as any).editAction = action;

    const prompts: Record<string, string> = {
      edit_full_name: 'Введите новое ФИО (три слова):',
      edit_email: 'Введите новый Email:',
      edit_phone: 'Введите новый номер телефона (начиная с 8, 11 цифр):',
      edit_coach: 'Введите новое ФИО тренера (три слова):',
      edit_city: 'Введите новый населенный пункт (город/село):',
    };

    await ctx.reply(
      prompts[action],
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_input')]]),
    );
    return ctx.wizard.next();
  },

  // 3. Сохранение изменений
  async (ctx) => {
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      if ((ctx.callbackQuery as any).data === 'cancel_input') {
        await ctx.answerCbQuery();
        const messageId = (ctx.callbackQuery as any)?.message?.message_id;
        if (ctx.chat?.id && messageId) {
          await ctx.telegram.deleteMessage(ctx.chat.id, messageId).catch(async () => {
            await ctx.editMessageReplyMarkup(undefined).catch(() => {});
            await ctx.editMessageText(' ').catch(() => {});
          });
        } else {
          await ctx.deleteMessage().catch(async () => {
            await ctx.editMessageReplyMarkup(undefined).catch(() => {});
            await ctx.editMessageText(' ').catch(() => {});
          });
        }
        return ctx.scene.leave();
      }
    }

    if (!ctx.message || !('text' in ctx.message)) return;
    const newValue = ctx.message.text.trim();
    const action = (ctx.wizard.state as any).editAction;
    const userId = ctx.session.supabaseUserId;

    if (!userId) return ctx.scene.leave();

    try {
      if (action === 'edit_full_name') {
        if (!validators.fullName(newValue)) {
          await ctx.reply('Пожалуйста, введите ФИО полностью (три слова через пробел):');
          return;
        }
        await supabase.from('profiles').update({ full_name: newValue }).eq('user_id', userId);
      } else if (action === 'edit_email') {
        if (!validators.email(newValue)) {
          await ctx.reply('Пожалуйста, введите корректный email:');
          return;
        }
        await supabase.from('users').update({ email: newValue }).eq('id', userId);
      } else if (action === 'edit_phone') {
        if (!validators.phone(newValue)) {
          await ctx.reply('Пожалуйста, введите номер телефона корректно (начиная с 8, 11 цифр):');
          return;
        }
        await supabase.from('profiles').update({ phone: newValue }).eq('user_id', userId);
      } else if (action === 'edit_coach') {
        if (!validators.fullName(newValue)) {
          await ctx.reply('Пожалуйста, введите ФИО тренера полностью (три слова через пробел):');
          return;
        }
        await supabase.from('athletes').update({ coach_name: newValue }).eq('user_id', userId);
      } else if (action === 'edit_city') {
        await supabase.from('profiles').update({ city: newValue }).eq('user_id', userId);
      }

      await ctx.reply('✅ Изменения успешно сохранены!');
    } catch (err) {
      console.error('Update profile error:', err);
      await ctx.reply('❌ Ошибка при сохранении изменений.');
    }

    return ctx.scene.leave();
  },
);
