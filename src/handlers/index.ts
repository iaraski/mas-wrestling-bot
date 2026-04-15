import { Markup, Telegraf } from 'telegraf';
import { supabase } from '../supabase';
import { BotContext } from '../types/session';
import { checkUserStage } from '../utils/user';

export function setupHandlers(bot: Telegraf<BotContext>) {
  const consentUrl =
    'https://docs.google.com/document/d/1pkV6DiFigJ_jG-zkH_fsXpr-KgGu-2ibxIC9gNvJv-Y/edit?usp=sharing';
  const consentText =
    'Добро пожаловать в онлайн систему мас-рестлинга.\n' +
    'Перед началом регистрации вашего личного кабинета, пожалуйста подтвердите ' +
    `<a href="${consentUrl}">согласие на обработку персональных данных</a>.`;

  const mainMenu = Markup.keyboard([['👤 Профиль', 'Мои заявки'], ['📊 Соревнования']]).resize();

  const escapeHtml = (s: any) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const apiBaseUrl = String(
    process.env.API_BASE_URL || 'https://api.mas-wrestling.pro/api/v1',
  ).replace(/\/+$/, '');

  const getCompetitionResults = async (competitionId: string) => {
    const url = `${apiBaseUrl}/live/competitions/${competitionId}/results`;
    const resp = await fetch(url, { method: 'GET' });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status}: ${text || resp.statusText}`);
    }
    return (await resp.json()) as any;
  };

  const formatCategoryGroup = (gender: any, ageMin: any, ageMax: any) => {
    const g = String(gender ?? '').toLowerCase();
    const isMale = g === 'male' || g === 'm';
    const isFemale = g === 'female' || g === 'f';
    const aMin = typeof ageMin === 'number' ? ageMin : Number(ageMin);
    const aMax = typeof ageMax === 'number' ? ageMax : Number(ageMax);
    if (aMin === 18 && aMax === 21) return isMale ? 'Юниоры' : isFemale ? 'Юниорки' : 'Юниоры';
    if (Number.isFinite(aMax) && aMax < 18)
      return isMale ? 'Юноши' : isFemale ? 'Девушки' : 'Юноши';
    return isMale ? 'Мужчины' : isFemale ? 'Женщины' : 'Мужчины';
  };

  const formatWeightLabel = (weightMin: any, weightMax: any) => {
    const max = weightMax == null ? null : Number(weightMax);
    const min = weightMin == null ? 0 : Number(weightMin);
    if (max == null || max >= 999) {
      if (!min) return 'абсолютная';
      return `${Math.floor(min)}+ кг`;
    }
    return `до ${max} кг`;
  };

  const formatBirthYears = (ageMin: any, ageMax: any, atDate: any) => {
    const aMin = typeof ageMin === 'number' ? ageMin : Number(ageMin);
    const aMax = typeof ageMax === 'number' ? ageMax : Number(ageMax);
    const d = atDate ? new Date(atDate) : new Date();
    const year = Number.isFinite(d.getTime()) ? d.getFullYear() : new Date().getFullYear();
    if (!Number.isFinite(aMin) || !Number.isFinite(aMax)) return '';
    return `${year - aMax}-${year - aMin} г.р.`;
  };

  const formatCategoryLabel = (cat: any, competitionStartDate?: any) => {
    const group = formatCategoryGroup(cat?.gender, cat?.age_min, cat?.age_max);
    const years = formatBirthYears(cat?.age_min, cat?.age_max, competitionStartDate);
    const weight = formatWeightLabel(cat?.weight_min, cat?.weight_max);
    return years ? `${group} ${years}, ${weight}` : `${group}, ${weight}`;
  };

  const setMainMenu = async (ctx: BotContext) => {
    try {
      const msg: any = await ctx.reply(' ', mainMenu);
      if (msg?.message_id && ctx.chat?.id) {
        await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {});
      }
    } catch {
      await ctx.reply('\u200b', mainMenu);
    }
  };

  const ensureConsent = async (ctx: BotContext) => {
    const currentStage = await checkUserStage(ctx);
    if (!currentStage) {
      await ctx.reply('Произошла ошибка при инициализации. Попробуйте позже.');
      return false;
    }

    const userId = ctx.session.supabaseUserId;
    if (!userId) {
      await ctx.reply('Произошла ошибка при инициализации. Попробуйте позже.');
      return false;
    }

    const { data, error } = await supabase
      .from('registrations')
      .select('consent_accepted')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('[Consent] Error reading consent_accepted:', error);
      await ctx.replyWithHTML(consentText, {
        ...Markup.inlineKeyboard([[{ text: 'Подтверждаю', callback_data: 'consent_accept' }]]),
      });
      return false;
    }

    if (!data?.consent_accepted) {
      await ctx.replyWithHTML(consentText, {
        ...Markup.inlineKeyboard([[{ text: 'Подтверждаю', callback_data: 'consent_accept' }]]),
      });
      return false;
    }

    return true;
  };

  bot.use(async (ctx, next) => {
    const msgText = ctx.message && 'text' in ctx.message ? ctx.message.text : undefined;
    const cbData =
      ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;

    if (msgText === '/start' || cbData === 'consent_accept') {
      return next();
    }

    const ok = await ensureConsent(ctx);
    if (!ok) return;
    return next();
  });

  bot.start(async (ctx) => {
    // Принудительно выходим из любой активной сцены при /start
    await ctx.scene.leave().catch(() => {});

    const currentStage = await checkUserStage(ctx);
    console.log(`[Bot Start] User stage: ${currentStage}`);

    if (!currentStage) {
      return ctx.reply('Произошла ошибка при инициализации. Попробуйте позже.');
    }

    const ok = await ensureConsent(ctx);
    if (!ok) return;

    if (currentStage === 'start') {
      await ctx.reply(
        'Для подачи заявки на соревнования, пожалуйста пройдите регистрацию.',
        Markup.inlineKeyboard([[{ text: 'Начать регистрацию', callback_data: 'register' }]]),
      );
      await setMainMenu(ctx);
    } else if (currentStage === 'first') {
      await ctx.reply(
        'Вы успешно зарегистрированы.\n\nПаспортные данные заполняются администратором/секретарём.',
        mainMenu,
      );
    } else if (currentStage === 'passport') {
      await ctx.reply(
        'Паспортные данные заполняются администратором/секретарём.',
        mainMenu,
      );
    } else if (currentStage === 'complete') {
      await ctx.reply('Вы успешно зарегистрированы!', mainMenu);
    }
  });

  bot.action('consent_accept', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const currentStage = await checkUserStage(ctx);
    if (!currentStage) {
      await ctx.reply('Произошла ошибка при инициализации. Попробуйте позже.');
      return;
    }

    const userId = ctx.session.supabaseUserId;
    if (!userId) {
      await ctx.reply('Произошла ошибка при инициализации. Попробуйте позже.');
      return;
    }

    // Обновляем существующую запись; если ее нет — создаем со stage='start'
    const { data: existing } = await supabase
      .from('registrations')
      .select('stage')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('registrations')
        .update({ consent_accepted: true })
        .eq('user_id', userId);
      if (error) {
        console.error('[Consent] Failed to update consent:', error);
        await ctx.reply('Ошибка при сохранении согласия. Попробуйте ещё раз.');
        return;
      }
    } else {
      const { error } = await supabase
        .from('registrations')
        .insert({ user_id: userId, stage: 'start', consent_accepted: true });
      if (error) {
        console.error('[Consent] Failed to insert consent:', error);
        await ctx.reply('Ошибка при сохранении согласия. Попробуйте ещё раз.');
        return;
      }
    }

    await ctx.editMessageText('Спасибо! Согласие принято.').catch(() => {});

    if (currentStage === 'start') {
      await ctx.reply(
        'Для подачи заявки на соревнования, пожалуйста пройдите регистрацию.',
        Markup.inlineKeyboard([[{ text: 'Начать регистрацию', callback_data: 'register' }]]),
      );
      await setMainMenu(ctx);
    } else if (currentStage === 'first') {
      await ctx.reply(
        'Вы успешно зарегистрированы.\n\nПаспортные данные заполняются администратором/секретарём.',
        mainMenu,
      );
    } else if (currentStage === 'passport') {
      await ctx.reply(
        'Паспортные данные заполняются администратором/секретарём.',
        mainMenu,
      );
    } else if (currentStage === 'complete') {
      await ctx.reply('Вы успешно зарегистрированы!', mainMenu);
    }
  });

  bot.hears('📊 Соревнования', async (ctx) => {
    try {
      const { data: competitions, error } = await supabase
        .from('competitions')
        .select('*')
        .gte('end_date', new Date().toISOString())
        .order('start_date', { ascending: true });

      if (error) throw error;

      if (!competitions || competitions.length === 0) {
        return ctx.reply('На данный момент нет активных соревнований.');
      }

      const buttons = competitions.map((c) => [
        Markup.button.callback(c.name, `comp_info_${c.id}`),
      ]);

      await ctx.reply(
        'Выберите соревнование для просмотра информации и подачи заявки:',
        Markup.inlineKeyboard(buttons),
      );
    } catch (err) {
      console.error('Error fetching competitions:', err);
      await ctx.reply('Ошибка при получении списка соревнований.');
    }
  });

  bot.action(/^comp_info_(.+)$/, async (ctx) => {
    const compId = ctx.match[1];
    await ctx.answerCbQuery();

    try {
      const { data: comp, error } = await supabase
        .from('competitions')
        .select('*, categories:competition_categories(*)')
        .eq('id', compId)
        .single();

      if (error || !comp) throw error;

      // Оставляем только уникальные категории по характеристикам
      const uniqueCategoriesMap = new Map();
      comp.categories.forEach((c: any) => {
        const key = `${c.gender}-${c.age_min}-${c.age_max}-${c.weight_min}-${c.weight_max}`;
        if (!uniqueCategoriesMap.has(key)) {
          uniqueCategoriesMap.set(key, c);
        }
      });
      const uniqueCategories = Array.from(uniqueCategoriesMap.values());

      // Сортируем категории по весу, чтобы они не были вперемешку
      uniqueCategories.sort((a: any, b: any) => a.weight_min - b.weight_min);

      const isRussiaChamp2026 =
        typeof comp.name === 'string' &&
        comp.name.toLowerCase().includes('первенств') &&
        comp.name.includes('2026');

      const pr2026CompId = (process.env.PR2026_COMP_ID || '').trim();
      const isPr2026Target =
        (pr2026CompId && String(comp.id) === pr2026CompId) || (!pr2026CompId && isRussiaChamp2026);

      let message = `<b>🏆 ${escapeHtml(comp.name)}</b>\n\n`;
      message += `📅 <b>Начало:</b> ${new Date(comp.start_date).toLocaleDateString('ru-RU')}\n`;
      if (comp.mandate_start_date) {
        const mStart = new Date(comp.mandate_start_date).toLocaleDateString('ru-RU');
        const mEnd = comp.mandate_end_date
          ? new Date(comp.mandate_end_date).toLocaleDateString('ru-RU')
          : mStart;
        message += `📝 <b>Мандатная комиссия:</b> ${mStart} - ${mEnd}\n`;
      }
      message += `📍 <b>Масштаб:</b> ${comp.scale === 'world' ? 'Мировой' : comp.scale === 'country' ? 'Национальный' : 'Региональный'}\n`;
      if (comp.mats_count) {
        message += `🔲 <b>Количество помостов:</b> ${comp.mats_count}\n`;
      }

      const pr2026Address = (process.env.PR2026_ADDRESS || '').trim();
      if (isPr2026Target && pr2026Address) {
        message += `🏙 <b>Место:</b> ${escapeHtml(pr2026Address)}\n`;
      } else if (comp.city) {
        message += `🏙 <b>Место:</b> г. ${escapeHtml(comp.city)}`;
        if (comp.street) message += `, ${escapeHtml(comp.street)}`;
        if (comp.house) message += `, д. ${escapeHtml(comp.house)}`;
        message += `\n`;
      }

      if ((comp as any).description) {
        message += `\n<b>📝 Описание:</b>\n${escapeHtml((comp as any).description)}\n`;
      }

      message += `\n<b>👥 Категории:</b>\n`;
      uniqueCategories.forEach((c: any) => {
        message += `• ${escapeHtml(formatCategoryLabel(c, comp.start_date))}\n`;
      });

      const buttons = [
        [
          {
            text: isPr2026Target
              ? '📝 Подать заявку на Первенство России 2026'
              : '📝 Подать заявку',
            callback_data: `apply_comp_${comp.id}`,
          },
        ],
        [{ text: '🏅 Победители', callback_data: `comp_results_${comp.id}` }],
        [{ text: '⬅️ Назад к списку', callback_data: 'back_to_comps' }],
      ];

      await ctx.editMessageText(message, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });
    } catch (err) {
      console.error('Error fetching competition info:', err);
      await ctx.reply('Ошибка при получении информации о соревновании.');
    }
  });

  bot.action(/^comp_results_(.+)$/, async (ctx) => {
    const compId = ctx.match[1];
    await ctx.answerCbQuery().catch(() => {});

    try {
      const results = await getCompetitionResults(String(compId));
      const compName = escapeHtml(results?.competition?.name || 'Соревнование');
      const isFinished = Boolean(results?.competition?.is_finished);

      const champions: any[] = Array.isArray(results?.champions) ? results.champions : [];
      const categories: any[] = Array.isArray(results?.categories) ? results.categories : [];

      if (!isFinished) {
        await ctx.replyWithHTML(
          `<b>🏆 ${compName}</b>\n\nИтоги будут доступны после завершения всех поединков.`,
        );
        return;
      }

      let message = `<b>🏆 Итоги соревнования</b>\n${compName}\n\n`;

      if (champions.length) {
        message += `<b>🥇 Чемпионы (общий список):</b>\n`;
        for (const c of champions) {
          const catLabel = escapeHtml(c?.category_label || c?.category_id || '');
          const athleteName = escapeHtml(c?.name || '');
          message += `• ${catLabel}: <b>${athleteName || '—'}</b>\n`;
        }
      } else {
        message += `<b>🥇 Чемпионы:</b>\nПока нет данных.\n`;
      }

      const finishedCats = categories.filter((c) => c?.is_finished && Array.isArray(c?.winners));
      if (finishedCats.length) {
        message += `\n<b>🏅 Призёры по категориям:</b>\n`;
        for (const cat of finishedCats) {
          const label = escapeHtml(cat?.label || cat?.category_id || '');
          message += `\n<b>${label}</b>\n`;
          for (const w of cat.winners as any[]) {
            const place = Number(w?.place) || 0;
            const name = escapeHtml(w?.name || '');
            if (!place) continue;
            message += `${place}) ${name || '—'}\n`;
          }
        }
      }

      await ctx.replyWithHTML(message);
    } catch (err) {
      console.error('Error fetching competition results:', err);
      await ctx.reply('Ошибка при получении списка победителей.');
    }
  });

  bot.action('back_to_comps', async (ctx) => {
    await ctx.answerCbQuery();
    const chatId = ctx.chat?.id;
    const messageId = (ctx.callbackQuery as any)?.message?.message_id;
    if (chatId && messageId) {
      await ctx.telegram.deleteMessage(chatId, messageId).catch(() => {});
    }

    const { data: competitions } = await supabase
      .from('competitions')
      .select('*')
      .gte('end_date', new Date().toISOString())
      .order('start_date', { ascending: true });

    if (!competitions || competitions.length === 0) {
      await ctx.reply('На данный момент нет активных соревнований.');
      return;
    }

    const buttons = competitions.map((c) => [Markup.button.callback(c.name, `comp_info_${c.id}`)]);
    await ctx.reply('Выберите соревнование:', Markup.inlineKeyboard(buttons));
  });

  bot.action(/^apply_comp_(.+)$/, async (ctx) => {
    const compId = ctx.match[1];
    await ctx.answerCbQuery();

    const userId = ctx.session.supabaseUserId;
    if (!userId) {
      return ctx.reply('Пожалуйста, сначала пройдите регистрацию в профиле.');
    }

    // Проверяем, завершена ли регистрация (есть ли паспорт)
    const { data: registration } = await supabase
      .from('registrations')
      .select('stage')
      .eq('user_id', userId)
      .maybeSingle();

    if (registration?.stage !== 'complete') {
      return ctx.reply(
        'Для подачи заявки необходимо полностью заполнить профиль и паспортные данные.',
        Markup.inlineKeyboard([[{ text: '⚠️ Дозаполнить профиль', callback_data: 'register' }]]),
      );
    }

    // Переходим в сцену подачи заявки
    await ctx.scene.enter('apply-competition', { competitionId: compId });
  });

  bot.hears('Мои заявки', async (ctx) => {
    const userId = ctx.session.supabaseUserId;
    if (!userId) {
      return ctx.reply('Пожалуйста, сначала пройдите регистрацию в профиле.');
    }

    try {
      const { data: athlete } = await supabase
        .from('athletes')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (!athlete) {
        return ctx.reply('Профиль спортсмена не найден.');
      }

      const { data: applications, error } = await supabase
        .from('applications')
        .select(
          `
          id,
          status,
          draw_number,
          competitions (name, start_date),
          competition_categories (gender, age_min, age_max, weight_min, weight_max)
        `,
        )
        .eq('athlete_id', athlete.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!applications || applications.length === 0) {
        return ctx.reply('У вас пока нет поданных заявок.');
      }

      let message = '<b>Ваши заявки:</b>\n\n';

      const statusMap: Record<string, string> = {
        pending: '⏳ На рассмотрении',
        approved: '✅ Одобрена (ожидает взвешивания)',
        weighed: '⚖️ Взвешен (жеребьевка пройдена)',
        rejected: '❌ Отклонена',
      };

      applications.forEach((app: any, index: number) => {
        const comp = app.competitions;
        const cat = app.competition_categories;
        const catStr = formatCategoryLabel(cat, comp?.start_date);

        message += `<b>${index + 1}. ${comp.name}</b>\n`;
        message += `Категория: ${catStr}\n`;
        message += `Статус: ${statusMap[app.status] || app.status}\n`;
        if (app.draw_number) {
          message += `🔢 Номер жеребьевки: <b>${app.draw_number}</b>\n`;
        }
        message += `\n`;
      });

      await ctx.replyWithHTML(message);
    } catch (err) {
      console.error('Error fetching applications:', err);
      await ctx.reply('Ошибка при получении списка заявок.');
    }
  });

  bot.hears('👤 Профиль', async (ctx) => {
    const userId = ctx.session.supabaseUserId;
    if (!userId) {
      return ctx.reply(
        'Пожалуйста, введите /start для инициализации профиля.',
        Markup.inlineKeyboard([[{ text: 'Начать регистрацию', callback_data: 'register' }]]),
      );
    }

    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select(
          `
          full_name,
          phone,
          city,
          location:locations(name, parent:locations(name, parent:locations(name)))
        `,
        )
        .eq('user_id', userId)
        .maybeSingle();

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('email')
        .eq('id', userId)
        .maybeSingle();

      const { data: athlete, error: athleteError } = await supabase
        .from('athletes')
        .select('id, coach_name')
        .eq('user_id', userId)
        .maybeSingle();

      let passportData = null;
      if (athlete) {
        const { data: passport } = await supabase
          .from('passports')
          .select('*')
          .eq('athlete_id', athlete.id)
          .maybeSingle();
        passportData = passport;
      }

      if (!profile) {
        return ctx.reply(
          'Профиль еще не создан. Пройдите регистрацию.',
          Markup.inlineKeyboard([[{ text: 'Начать регистрацию', callback_data: 'register' }]]),
        );
      }

      let locationText = 'Не указано';
      if (profile.location) {
        const loc = profile.location as any;
        const region = loc.name;
        const district = loc.parent?.name || '';
        const country = loc.parent?.parent?.name || '';
        locationText = `${country} ${district} ${region}`.trim().replace(/\s+/g, ', ');
      }

      const formatDateForDisplay = (dateStr?: string) => {
        if (!dateStr) return 'Не указана';
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        return `${parts[2]}.${parts[1]}.${parts[0]}`;
      };

      let message = `
<b>👤 Ваш профиль:</b>

<b>ФИО:</b> ${profile.full_name}
<b>Email:</b> ${user?.email || 'Не указан'}
<b>Телефон:</b> ${profile.phone || 'Не указан'}
<b>Тренер:</b> ${athlete?.coach_name || 'Не указан'}
<b>Локация:</b> ${locationText}
<b>Город/село:</b> ${profile.city || 'Не указан'}
      `;

      if (passportData) {
        message += `
<b>🪪 Паспортные данные:</b>
<b>Серия и номер:</b> ${passportData.series} ${passportData.number}
<b>Кем выдан:</b> ${passportData.issued_by}
<b>Дата выдачи:</b> ${formatDateForDisplay(passportData.issue_date)}
<b>Дата рождения:</b> ${formatDateForDisplay(passportData.birth_date)}
<b>Пол:</b> ${passportData.gender === 'male' ? 'Мужской' : 'Женский'}
<b>Разряд:</b> ${passportData.rank}
<b>Статус проверки:</b> ${passportData.is_verified ? '✅ Подтвержден' : '⏳ На проверке'}
        `;
      }

      const currentStage = await checkUserStage(ctx);
      const isComplete = currentStage === 'complete';

      const actionButton = isComplete
        ? [{ text: '📝 Редактировать профиль', callback_data: 'edit_profile' }]
        : [{ text: '⚠️ Дозаполнить профиль', callback_data: 'register' }];

      if (passportData?.photo_url) {
        await ctx.replyWithPhoto(passportData.photo_url, {
          caption: message,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [actionButton],
          },
        });
      } else {
        await ctx.replyWithHTML(message, {
          reply_markup: {
            inline_keyboard: [actionButton],
          },
        });
      }
    } catch (err) {
      console.error('Profile fetch error:', err);
      await ctx.reply('Ошибка при получении данных профиля.');
    }
  });

  bot.action('edit_profile', async (ctx) => {
    const currentStage = await checkUserStage(ctx);
    if (currentStage !== 'complete') {
      return ctx.answerCbQuery('Ваш профиль заполнен не до конца. Пожалуйста, дозаполните его.', {
        show_alert: true,
      });
    }

    const userId = ctx.session.supabaseUserId;
    if (userId) {
      try {
        const { data: athlete } = await supabase
          .from('athletes')
          .select('id')
          .eq('user_id', userId)
          .single();

        if (athlete) {
          const { data: passport } = await supabase
            .from('passports')
            .select('is_verified')
            .eq('athlete_id', athlete.id)
            .maybeSingle();

          if (passport?.is_verified) {
            return ctx.answerCbQuery('Ваш профиль подтвержден, редактирование запрещено.', {
              show_alert: true,
            });
          }
        }
      } catch (err) {
        console.error('Check verified status error:', err);
      }
    }

    await ctx.answerCbQuery();
    await ctx.scene.enter('edit-profile');
  });

  bot.action('register', async (ctx) => {
    await ctx.answerCbQuery().catch(console.error);
    try {
      const currentStage = await checkUserStage(ctx);
      if (currentStage === 'start') {
        await ctx.scene.enter('first-registration');
      } else {
        await ctx.reply('Регистрация уже пройдена. Паспортные данные заполняются администратором/секретарём.', mainMenu);
      }
    } catch (e) {
      console.error('Error in register action:', e);
      await ctx.reply('Произошла ошибка, попробуйте /start еще раз.');
    }
  });

  bot.action('passport', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('Паспортные данные заполняются администратором/секретарём.', mainMenu);
  });

  bot.action('apply', async (ctx) => {
    await ctx.answerCbQuery();
    // Повторяем логику вывода списка соревнований
    try {
      const { data: competitions, error } = await supabase
        .from('competitions')
        .select('*')
        .gte('end_date', new Date().toISOString())
        .order('start_date', { ascending: true });

      if (error) throw error;

      if (!competitions || competitions.length === 0) {
        return ctx.reply('На данный момент нет активных соревнований.');
      }

      const buttons = competitions.map((c) => [
        Markup.button.callback(c.name, `comp_info_${c.id}`),
      ]);

      await ctx.reply('Выберите соревнование для подачи заявки:', Markup.inlineKeyboard(buttons));
    } catch (err) {
      console.error('Error fetching competitions for apply:', err);
      await ctx.reply('Ошибка при получении списка соревнований.');
    }
  });
}
