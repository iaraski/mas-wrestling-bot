import { Markup, Scenes } from 'telegraf';
import { supabase } from '../supabase';
import { BotContext, PassportData } from '../types/session';
import { validators } from '../utils/validation';

const withBack = (data: string) =>
  Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', data)]]);

const promptSeries = async (ctx: BotContext) => {
  await ctx.reply('Введите серию паспорта (4 цифры):', withBack('pass_cancel'));
};

const promptNumber = async (ctx: BotContext) => {
  await ctx.reply('Введите номер паспорта (6 цифр):', withBack('pass_back_series'));
};

const promptIssued = async (ctx: BotContext) => {
  await ctx.reply('Кем выдан:', withBack('pass_back_number'));
};

const promptIssueDate = async (ctx: BotContext) => {
  await ctx.reply('Дата выдачи (ДД.ММ.ГГГГ):', withBack('pass_back_issued'));
};

const promptBirthDate = async (ctx: BotContext) => {
  await ctx.reply('Дата рождения (ДД.ММ.ГГГГ):', withBack('pass_back_issue_date'));
};

const computeAge = (birth?: string) => {
  if (!birth) return null;
  const parts = birth.split('.');
  if (parts.length !== 3) return null;
  const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  return age;
};

const buildRanksKeyboard = (birth?: string) => {
  const age = computeAge(birth);
  const ranks: any[] = [];

  if (age !== null && age < 18) {
    ranks.push([
      Markup.button.callback('1 юношеский', 'rank_1 юношеский'),
      Markup.button.callback('2 юношеский', 'rank_2 юношеский'),
      Markup.button.callback('3 юношеский', 'rank_3 юношеский'),
    ]);
  }

  ranks.push([
    Markup.button.callback('1 разряд', 'rank_1 разряд'),
    Markup.button.callback('2 разряд', 'rank_2 разряд'),
    Markup.button.callback('3 разряд', 'rank_3 разряд'),
  ]);
  ranks.push([
    Markup.button.callback('КМС', 'rank_КМС'),
    Markup.button.callback('МС', 'rank_МС'),
    Markup.button.callback('МСМК', 'rank_МСМК'),
  ]);
  ranks.push([Markup.button.callback('ЗМС', 'rank_ЗМС')]);
  ranks.push([Markup.button.callback('⬅️ Назад', 'back_to_gender')]);
  return Markup.inlineKeyboard(ranks);
};

export const passportScene = new Scenes.WizardScene<BotContext>(
  'passport',

  // 0. Серия
  async (ctx) => {
    if (!ctx.session.supabaseUserId) {
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', ctx.from!.id)
        .single();
      if (user) {
        ctx.session.supabaseUserId = user.id;
      } else {
        await ctx.reply('Ошибка: пользователь не найден. Пожалуйста, введите /start');
        return ctx.scene.leave();
      }
    }
    if (ctx.session.supabaseUserId) {
      await supabase
        .from('registrations')
        .upsert({ user_id: ctx.session.supabaseUserId, stage: 'first' }, { onConflict: 'user_id' });
    }
    await ctx.reply('Паспортные данные заполняются администратором/секретарём.');
    return ctx.scene.leave();
  },

  // 1. Номер
  async (ctx) => {
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      if (String(ctx.callbackQuery.data) === 'pass_cancel') {
        await ctx.answerCbQuery().catch(() => {});
        await ctx.deleteMessage().catch(() => {});
        return ctx.scene.leave();
      }
      return;
    }

    if (!ctx.message || !('text' in ctx.message)) return;
    const series = ctx.message.text.trim();
    if (!validators.passportSeries(series)) {
      await ctx.reply('Пожалуйста, введите серию паспорта корректно (4 цифры):');
      return;
    }
    ctx.session.passport!.series = series;
    await promptNumber(ctx);
    return ctx.wizard.next();
  },

  // 2. Кем выдан
  async (ctx) => {
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      if (String(ctx.callbackQuery.data) === 'pass_back_series') {
        await ctx.answerCbQuery().catch(() => {});
        ctx.wizard.selectStep(0);
        await promptSeries(ctx);
      }
      return;
    }

    if (!ctx.message || !('text' in ctx.message)) return;
    const number = ctx.message.text.trim();
    if (!validators.passportNumber(number)) {
      await ctx.reply('Пожалуйста, введите номер паспорта корректно (6 цифр):');
      return;
    }
    ctx.session.passport!.number = number;
    await promptIssued(ctx);
    return ctx.wizard.next();
  },

  // 3. Дата выдачи
  async (ctx) => {
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      if (String(ctx.callbackQuery.data) === 'pass_back_number') {
        await ctx.answerCbQuery().catch(() => {});
        ctx.wizard.selectStep(1);
        await promptNumber(ctx);
      }
      return;
    }

    if (!ctx.message || !('text' in ctx.message)) return;
    const issued = ctx.message.text.trim();
    ctx.session.passport!.issued = issued;
    await promptIssueDate(ctx);
    return ctx.wizard.next();
  },

  // 4. Дата рождения
  async (ctx) => {
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      if (String(ctx.callbackQuery.data) === 'pass_back_issued') {
        await ctx.answerCbQuery().catch(() => {});
        ctx.wizard.selectStep(2);
        await promptIssued(ctx);
      }
      return;
    }

    if (!ctx.message || !('text' in ctx.message)) return;
    const issueDate = ctx.message.text.trim();
    if (!validators.date(issueDate)) {
      await ctx.reply('Пожалуйста, введите дату выдачи корректно (ДД.ММ.ГГГГ):');
      return;
    }
    ctx.session.passport!.issue_date = issueDate;
    await promptBirthDate(ctx);
    return ctx.wizard.next();
  },

  // 5. Пол
  async (ctx) => {
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      if (String(ctx.callbackQuery.data) === 'pass_back_issue_date') {
        await ctx.answerCbQuery().catch(() => {});
        ctx.wizard.selectStep(3);
        await promptIssueDate(ctx);
      }
      return;
    }

    if (!ctx.message || !('text' in ctx.message)) return;
    const birthDate = ctx.message.text.trim();
    if (!validators.date(birthDate)) {
      await ctx.reply('Пожалуйста, введите дату рождения корректно (ДД.ММ.ГГГГ):');
      return;
    }
    ctx.session.passport!.birth = birthDate;

    await ctx.reply(
      'Выберите пол:',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('Мужской', 'gender_male'),
          Markup.button.callback('Женский', 'gender_female'),
        ],
        [Markup.button.callback('⬅️ Назад', 'back_to_birth')],
      ]),
    );
    return ctx.wizard.next();
  },

  // 6. Разряд
  async (ctx) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    const data = String(ctx.callbackQuery.data);
    await ctx.answerCbQuery().catch(() => {});

    if (data === 'back_to_birth') {
      ctx.wizard.selectStep(4);
      await promptBirthDate(ctx);
      return ctx.wizard.next();
    }

    const gender = data === 'gender_male' ? 'male' : 'female';
    const genderText = gender === 'male' ? 'Мужской' : 'Женский';
    ctx.session.passport!.gender = gender;
    await ctx.editMessageText(`Пол: ${genderText}`).catch(() => {});

    await ctx.reply('Выберите спортивный разряд:', buildRanksKeyboard(ctx.session.passport?.birth));
    return ctx.wizard.next();
  },

  // 7. Фото 3x4
  async (ctx) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    const data = String(ctx.callbackQuery.data);
    await ctx.answerCbQuery().catch(() => {});

    if (data === 'back_to_gender') {
      ctx.wizard.selectStep(5);
      await ctx.reply(
        'Выберите пол:',
        Markup.inlineKeyboard([
          [
            Markup.button.callback('Мужской', 'gender_male'),
            Markup.button.callback('Женский', 'gender_female'),
          ],
          [Markup.button.callback('⬅️ Назад', 'back_to_birth')],
        ]),
      );
      return ctx.wizard.next();
    }

    const rank = data.replace('rank_', '');
    ctx.session.passport!.rank = rank;
    await ctx.editMessageText(`Разряд: ${rank}`).catch(() => {});

    await ctx.reply('Загрузите фото 3x4', withBack('pass_back_to_rank'));
    return ctx.wizard.next();
  },

  // 8. Скан паспорта (фото или PDF)
  async (ctx) => {
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      if (String(ctx.callbackQuery.data) === 'pass_back_to_rank') {
        await ctx.answerCbQuery().catch(() => {});
        ctx.wizard.selectStep(7);
        await ctx.reply(
          'Выберите спортивный разряд:',
          buildRanksKeyboard(ctx.session.passport?.birth),
        );
      }
      return;
    }

    if (!ctx.message || !('photo' in ctx.message)) {
      await ctx.reply('Пожалуйста, отправьте именно фото.');
      return;
    }

    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    ctx.session.passport!.photo_url = photo.file_id;

    await ctx.reply('Загрузите скан паспорта (фото или PDF):', withBack('pass_back_to_photo'));
    return ctx.wizard.next();
  },

  // 9. Сохранение
  async (ctx) => {
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      if (String(ctx.callbackQuery.data) === 'pass_back_to_photo') {
        await ctx.answerCbQuery().catch(() => {});
        ctx.wizard.selectStep(7);
        await ctx.reply('Загрузите фото 3x4', withBack('pass_back_to_rank'));
      }
      return;
    }

    if (!ctx.message) return;
    if ('photo' in ctx.message) {
      const scan = ctx.message.photo[ctx.message.photo.length - 1];
      ctx.session.passport!.passport_scan_url = scan.file_id;
    } else if ('document' in ctx.message) {
      ctx.session.passport!.passport_scan_url = ctx.message.document.file_id;
    } else {
      await ctx.reply('Пожалуйста, отправьте скан паспорта (фото или PDF).');
      return;
    }

    const data = ctx.session.passport!;
    const userId = ctx.session.supabaseUserId!;

    const formatDateForDb = (dateStr?: string) => {
      if (!dateStr) return null;
      const parts = dateStr.split('.');
      if (parts.length !== 3) return dateStr;
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    };

    try {
      const { data: athlete, error: athleteError } = await supabase
        .from('athletes')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (athleteError || !athlete) {
        throw new Error('Athlete not found');
      }

      const { error: passportError } = await supabase.from('passports').upsert(
        {
          athlete_id: athlete.id,
          series: data.series,
          number: data.number,
          issued_by: data.issued,
          issue_date: formatDateForDb(data.issue_date),
          birth_date: formatDateForDb(data.birth),
          gender: data.gender,
          rank: data.rank,
          photo_url: data.photo_url,
          passport_scan_url: data.passport_scan_url,
        },
        { onConflict: 'athlete_id' },
      );
      if (passportError) throw passportError;

      const { error: regError } = await supabase.from('registrations').upsert(
        { user_id: userId, stage: 'complete', updated_at: new Date() },
        { onConflict: 'user_id' },
      );
      if (regError) throw regError;

      await ctx.reply('Регистрация полностью завершена! Вы можете подавать заявки на соревнования.', {
        reply_markup: {
          inline_keyboard: [[{ text: 'Подать заявку на соревнование', callback_data: 'apply' }]],
        },
      });
    } catch (err) {
      console.error('Passport saving error:', err);
      await ctx.reply('Произошла ошибка при сохранении паспортных данных. Пожалуйста, попробуйте еще раз.');
    }

    return ctx.scene.leave();
  },
);
