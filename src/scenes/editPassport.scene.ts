import { Markup, Scenes } from 'telegraf';
import { supabase } from '../supabase';
import { BotContext } from '../types/session';
import { validators } from '../utils/validation';

export const editPassportScene = new Scenes.WizardScene<BotContext>(
  'edit-passport',

  // 1. Выбор поля для редактирования
  async (ctx) => {
    await ctx.reply(
      'Что вы хотите изменить в паспорте?',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('Серия/Номер', 'edit_pass_series_number'),
          Markup.button.callback('Кем выдан', 'edit_pass_issued_by'),
        ],
        [
          Markup.button.callback('Дата выдачи', 'edit_pass_issue_date'),
          Markup.button.callback('Дата рождения', 'edit_pass_birth_date'),
        ],
        [
          Markup.button.callback('Разряд', 'edit_pass_rank'),
          Markup.button.callback('Пол', 'edit_pass_gender'),
        ],
        [
          Markup.button.callback('Фото', 'edit_pass_photo'),
          Markup.button.callback('Скан паспорта', 'edit_pass_scan'),
        ],
        [Markup.button.callback('❌ Назад', 'cancel_edit_passport')],
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

    if (action === 'cancel_edit_passport') {
      const messageId = (ctx.callbackQuery as any)?.message?.message_id;
      if (ctx.chat?.id && messageId) {
        await ctx.telegram.deleteMessage(ctx.chat.id, messageId).catch(() => {});
      } else {
        await ctx.deleteMessage().catch(() => {});
      }
      await ctx.scene.enter('edit-profile');
      return;
    }

    // Убираем кнопки выбора поля
    await ctx.editMessageText(`Выбрано: ${actionText}`).catch(() => {});

    const menuMessageId = cbQuery.message?.message_id;
    if (menuMessageId) {
      (ctx.wizard.state as any).menuMessageId = menuMessageId;
    }

    (ctx.wizard.state as any).editAction = action;

    const prompts: Record<string, string> = {
      edit_pass_series_number:
        'Введите новую серию и номер паспорта через пробел (например: 1234 567890):',
      edit_pass_issued_by: 'Кем выдан паспорт?:',
      edit_pass_issue_date: 'Введите новую дату выдачи (ДД.ММ.ГГГГ):',
      edit_pass_birth_date: 'Введите новую дату рождения (ДД.ММ.ГГГГ):',
      edit_pass_rank: 'Введите новый разряд:',
      edit_pass_photo: 'Загрузите новое фото:',
      edit_pass_scan: 'Загрузите новый скан паспорта (изображение или документ):',
      edit_pass_gender: 'Выберите пол:',
    };

    if (action === 'edit_pass_gender') {
      const promptMsg: any = await ctx.reply(
        prompts[action],
        Markup.inlineKeyboard([
          [
            Markup.button.callback('Мужской', 'set_gender_male'),
            Markup.button.callback('Женский', 'set_gender_female'),
          ],
          [Markup.button.callback('❌ Отмена', 'cancel_input')],
        ]),
      );
      if (promptMsg?.message_id) {
        (ctx.wizard.state as any).promptMessageId = promptMsg.message_id;
      }
    } else {
      const promptMsg: any = await ctx.reply(
        prompts[action],
        Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_input')]]),
      );
      if (promptMsg?.message_id) {
        (ctx.wizard.state as any).promptMessageId = promptMsg.message_id;
      }
    }
    return ctx.wizard.next();
  },

  // 3. Сохранение изменений
  async (ctx) => {
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      if ((ctx.callbackQuery as any).data === 'cancel_input') {
        await ctx.answerCbQuery();
        const chatId = ctx.chat?.id;
        const promptMessageId =
          (ctx.callbackQuery as any)?.message?.message_id || (ctx.wizard.state as any)?.promptMessageId;
        const menuMessageId = (ctx.wizard.state as any)?.menuMessageId;

        if (chatId && promptMessageId) {
          await ctx.telegram.deleteMessage(chatId, promptMessageId).catch(async () => {
            await ctx.editMessageReplyMarkup(undefined).catch(() => {});
            await ctx.editMessageText(' ').catch(() => {});
          });
        }
        if (chatId && menuMessageId && menuMessageId !== promptMessageId) {
          await ctx.telegram.deleteMessage(chatId, menuMessageId).catch(() => {});
        }
        return ctx.scene.leave();
      }
    }

    const action = (ctx.wizard.state as any).editAction;
    const userId = ctx.session.supabaseUserId;

    if (!userId) return ctx.scene.leave();

    try {
      const { data: athlete } = await supabase
        .from('athletes')
        .select('id')
        .eq('user_id', userId)
        .single();
      if (!athlete) throw new Error('Athlete not found');

      let updateData: any = {};

      if (action === 'edit_pass_photo') {
        if (!ctx.message || !('photo' in ctx.message))
          return ctx.reply('Пожалуйста, отправьте фото.');
        updateData.photo_url = ctx.message.photo[ctx.message.photo.length - 1].file_id;
      } else if (action === 'edit_pass_scan') {
        if (ctx.message && 'photo' in ctx.message) {
          updateData.passport_scan_url = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        } else if (ctx.message && 'document' in ctx.message) {
          updateData.passport_scan_url = ctx.message.document.file_id;
        } else {
          return ctx.reply('Пожалуйста, отправьте скан паспорта (изображение или документ).');
        }
      } else if (action === 'edit_pass_gender') {
        if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
        const cbQuery = ctx.callbackQuery as any;
        updateData.gender = cbQuery.data === 'set_gender_male' ? 'male' : 'female';
        await ctx.answerCbQuery();
        await ctx
          .editMessageText(`Выбран пол: ${updateData.gender === 'male' ? 'Мужской' : 'Женский'}`)
          .catch(() => {});
      } else {
        if (!ctx.message || !('text' in ctx.message)) return;
        const newValue = ctx.message.text.trim();

        if (action === 'edit_pass_series_number') {
          const parts = newValue.split(/\s+/);
          if (
            parts.length !== 2 ||
            !validators.passportSeries(parts[0]) ||
            !validators.passportNumber(parts[1])
          ) {
            await ctx.reply('Пожалуйста, введите серию (4 цифры) и номер (6 цифр) через пробел.');
            return;
          }
          updateData = { series: parts[0], number: parts[1] };
        } else if (action === 'edit_pass_issued_by') {
          updateData.issued_by = newValue;
        } else if (action === 'edit_pass_issue_date' || action === 'edit_pass_birth_date') {
          if (!validators.date(newValue)) {
            await ctx.reply('Пожалуйста, введите дату в формате ДД.ММ.ГГГГ');
            return;
          }
          const parts = newValue.split('.');
          const dbDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
          updateData[action === 'edit_pass_issue_date' ? 'issue_date' : 'birth_date'] = dbDate;
        } else if (action === 'edit_pass_rank') {
          updateData.rank = newValue;
        }
      }

      await supabase.from('passports').update(updateData).eq('athlete_id', athlete.id);
      await ctx.reply('✅ Паспортные данные успешно обновлены!');
    } catch (err) {
      console.error('Update passport error:', err);
      await ctx.reply('❌ Ошибка при обновлении паспортных данных.');
    }

    return ctx.scene.leave();
  },
);
