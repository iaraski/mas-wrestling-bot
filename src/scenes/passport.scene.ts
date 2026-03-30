import { Markup, Scenes } from 'telegraf';
import { supabase } from '../supabase';
import { BotContext, PassportData } from '../types/session';

export const passportScene = new Scenes.WizardScene<BotContext>(
  'passport',

  async (ctx) => {
    ctx.session.passport = {} as PassportData;

    // Проверяем наличие supabaseUserId
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

    await ctx.reply('Введите серию паспорта:', Markup.keyboard([['⬅️ Назад']]).resize());
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) return;
    if (ctx.message.text.trim() === '⬅️ Назад') {
      await ctx.reply('Вы в начале ввода паспортных данных. Отмена.');
      return ctx.scene.leave();
    }
    ctx.session.passport!.series = ctx.message.text;

    await ctx.reply('Введите номер паспорта:', Markup.keyboard([['⬅️ Назад']]).resize());
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) return;
    if (ctx.message.text.trim() === '⬅️ Назад') {
      ctx.wizard.selectStep(1);
      await ctx.reply('Введите серию паспорта:', Markup.keyboard([['⬅️ Назад']]).resize());
      return;
    }
    ctx.session.passport!.number = ctx.message.text;

    await ctx.reply('Кем выдан:', Markup.keyboard([['⬅️ Назад']]).resize());
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) return;
    if (ctx.message.text.trim() === '⬅️ Назад') {
      ctx.wizard.selectStep(2);
      await ctx.reply('Введите номер паспорта:', Markup.keyboard([['⬅️ Назад']]).resize());
      return;
    }
    ctx.session.passport!.issued = ctx.message.text;

    await ctx.reply('Дата выдачи (ДД.ММ.ГГГГ):', Markup.keyboard([['⬅️ Назад']]).resize());
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) return;
    if (ctx.message.text.trim() === '⬅️ Назад') {
      ctx.wizard.selectStep(3);
      await ctx.reply('Кем выдан:', Markup.keyboard([['⬅️ Назад']]).resize());
      return;
    }
    ctx.session.passport!.issue_date = ctx.message.text;

    await ctx.reply('Дата рождения (ДД.ММ.ГГГГ):', Markup.keyboard([['⬅️ Назад']]).resize());
    return ctx.wizard.next();
  },

  // Новый шаг: Пол
  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) return;
    if (ctx.message.text.trim() === '⬅️ Назад') {
      ctx.wizard.selectStep(4);
      await ctx.reply('Дата выдачи (ДД.ММ.ГГГГ):', Markup.keyboard([['⬅️ Назад']]).resize());
      return;
    }
    ctx.session.passport!.birth = ctx.message.text;

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

  // Шаг: Разряд
  async (ctx) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    if (ctx.callbackQuery.data === 'back_to_birth') {
      await ctx.answerCbQuery();
      ctx.wizard.selectStep(5);
      await ctx.reply('Дата рождения (ДД.ММ.ГГГГ):', Markup.keyboard([['⬅️ Назад']]).resize());
      return;
    }
    const gender = ctx.callbackQuery.data === 'gender_male' ? 'male' : 'female';
    ctx.session.passport!.gender = gender;
    await ctx.answerCbQuery();

    const birth = ctx.session.passport?.birth;
    let age: number | null = null;
    if (birth) {
      const parts = birth.split('.');
      if (parts.length === 3) {
        const day = Number(parts[0]);
        const month = Number(parts[1]);
        const year = Number(parts[2]);
        const d = new Date(year, month - 1, day);
        if (!Number.isNaN(d.getTime())) {
          const today = new Date();
          age = today.getFullYear() - d.getFullYear();
          const m = today.getMonth() - d.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
        }
      }
    }

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
    await ctx.reply('Выберите спортивный разряд:', Markup.inlineKeyboard(ranks));
    return ctx.wizard.next();
  },

  // Шаг: Фото
  async (ctx) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    if (ctx.callbackQuery.data === 'back_to_gender') {
      await ctx.answerCbQuery();
      ctx.wizard.selectStep(6);
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
      return;
    }
    const rank = ctx.callbackQuery.data.replace('rank_', '');
    ctx.session.passport!.rank = rank;
    await ctx.answerCbQuery();

    await ctx.reply('Загрузите фото 3x4', Markup.keyboard([['⬅️ Назад']]).resize());
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (ctx.message && 'text' in ctx.message && ctx.message.text.trim() === '⬅️ Назад') {
      const birth = ctx.session.passport?.birth;
      let age: number | null = null;
      if (birth) {
        const parts = birth.split('.');
        if (parts.length === 3) {
          const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
          if (!Number.isNaN(d.getTime())) {
            const today = new Date();
            age = today.getFullYear() - d.getFullYear();
            const m = today.getMonth() - d.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
          }
        }
      }

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
      ctx.wizard.selectStep(7);
      await ctx.reply('Выберите спортивный разряд:', Markup.inlineKeyboard(ranks));
      return;
    }

    if (!ctx.message || !('photo' in ctx.message)) {
      await ctx.reply('Пожалуйста, отправьте именно фото.');
      return;
    }

    // Сохраняем file_id вместо прямой ссылки
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    ctx.session.passport!.photo_url = photo.file_id;

    const data = ctx.session.passport!;
    const userId = ctx.session.supabaseUserId!;

    // Функция для конвертации даты из ДД.ММ.ГГГГ в ГГГГ-ММ-ДД
    const formatDateForDb = (dateStr?: string) => {
      if (!dateStr) return null;
      const parts = dateStr.split('.');
      if (parts.length !== 3) return dateStr; // Возвращаем как есть, если формат неверный
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    };

    try {
      // 1. Получаем ID спортсмена для этого пользователя
      const { data: athlete, error: athleteError } = await supabase
        .from('athletes')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (athleteError || !athlete) {
        throw new Error('Athlete not found');
      }

      // 2. Сохраняем паспортные данные с конвертацией дат
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
        },
        { onConflict: 'athlete_id' },
      );

      if (passportError) throw passportError;

      // 3. Обновляем статус регистрации
      const { error: regError } = await supabase.from('registrations').upsert(
        {
          user_id: userId,
          stage: 'complete',
          updated_at: new Date(),
        },
        { onConflict: 'user_id' },
      );

      if (regError) throw regError;

      await ctx.reply(
        'Регистрация полностью завершена! Вы можете подавать заявки на соревнования.',
        {
          reply_markup: {
            inline_keyboard: [[{ text: 'Подать заявку на соревнование', callback_data: 'apply' }]],
          },
        },
      );
    } catch (err) {
      console.error('Passport saving error:', err);
      await ctx.reply(
        'Произошла ошибка при сохранении паспортных данных. Пожалуйста, попробуйте еще раз.',
      );
    }

    return ctx.scene.leave();
  },
);
