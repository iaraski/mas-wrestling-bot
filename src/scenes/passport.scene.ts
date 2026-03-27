import { Markup, Scenes } from 'telegraf';
import { supabase } from '../supabase';
import { BotContext, PassportData } from '../types/session';
import { validators } from '../utils/validation';

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

    await ctx.reply('Введите серию паспорта (4 цифры):');
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) return;
    const series = ctx.message.text.trim();
    if (!validators.passportSeries(series)) {
      await ctx.reply('Пожалуйста, введите серию паспорта корректно (4 цифры):');
      return;
    }
    ctx.session.passport!.series = series;

    await ctx.reply('Введите номер паспорта (6 цифр):');
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) return;
    const number = ctx.message.text.trim();
    if (!validators.passportNumber(number)) {
      await ctx.reply('Пожалуйста, введите номер паспорта корректно (6 цифр):');
      return;
    }
    ctx.session.passport!.number = number;

    await ctx.reply('Кем выдан:');
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) return;
    ctx.session.passport!.issued = ctx.message.text;

    await ctx.reply('Дата выдачи (ДД.ММ.ГГГГ):');
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) return;
    const issueDate = ctx.message.text.trim();
    if (!validators.date(issueDate)) {
      await ctx.reply('Пожалуйста, введите дату выдачи корректно (ДД.ММ.ГГГГ):');
      return;
    }
    ctx.session.passport!.issue_date = issueDate;

    await ctx.reply('Дата рождения (ДД.ММ.ГГГГ):');
    return ctx.wizard.next();
  },

  // Новый шаг: Пол
  async (ctx) => {
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
      ]),
    );
    return ctx.wizard.next();
  },

  // Шаг: Разряд
  async (ctx) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    const cbQuery = ctx.callbackQuery as any;
    const gender = cbQuery.data === 'gender_male' ? 'male' : 'female';
    const genderText = gender === 'male' ? 'Мужской' : 'Женский';

    ctx.session.passport!.gender = gender;
    await ctx.answerCbQuery();

    // Убираем кнопки выбора пола
    await ctx.editMessageText(`Пол: ${genderText}`).catch(() => {});

    const ranks = [
      [
        Markup.button.callback('1 разряд', 'rank_1 разряд'),
        Markup.button.callback('2 разряд', 'rank_2 разряд'),
        Markup.button.callback('3 разряд', 'rank_3 разряд'),
      ],
      [
        Markup.button.callback('КМС', 'rank_КМС'),
        Markup.button.callback('МС', 'rank_МС'),
        Markup.button.callback('МСМК', 'rank_МСМК'),
      ],
    ];
    await ctx.reply('Выберите спортивный разряд:', Markup.inlineKeyboard(ranks));
    return ctx.wizard.next();
  },

  // Шаг: Фото
  async (ctx) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    const cbQuery = ctx.callbackQuery as any;
    const rank = cbQuery.data.replace('rank_', '');
    ctx.session.passport!.rank = rank;
    await ctx.answerCbQuery();

    // Убираем кнопки выбора разряда
    await ctx.editMessageText(`Разряд: ${rank}`).catch(() => {});

    await ctx.reply('Загрузите фото 3x4');
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (!ctx.message || !('photo' in ctx.message)) {
      await ctx.reply('Пожалуйста, отправьте фото для профиля (изображение):');
      return;
    }

    // Сохраняем file_id вместо прямой ссылки
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    ctx.session.passport!.photo_url = photo.file_id;

    await ctx.reply(
      'Отправьте скан/фото разворота паспорта (как изображение или как PDF-документ):',
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    let scanId = '';
    if (ctx.message && 'photo' in ctx.message) {
      scanId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    } else if (ctx.message && 'document' in ctx.message) {
      scanId = ctx.message.document.file_id;
    } else {
      await ctx.reply('Пожалуйста, отправьте скан паспорта (изображение или документ):');
      return;
    }

    ctx.session.passport!.passport_scan_url = scanId;

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
          passport_scan_url: data.passport_scan_url,
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
