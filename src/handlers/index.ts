import { Markup, Telegraf } from 'telegraf';
import { BotContext } from '../types/session';
import { checkUserStage } from '../utils/user';
import { supabase } from '../supabase';

export function setupHandlers(bot: Telegraf<BotContext>) {
  bot.start(async (ctx) => {
    const currentStage = await checkUserStage(ctx);
    console.log(`[Bot Start] User stage: ${currentStage}`);

    if (!currentStage) {
      return ctx.reply('Произошла ошибка при инициализации. Попробуйте позже.');
    }

    const mainMenu = Markup.keyboard([['👤 Профиль'], ['📊 Соревнования']]).resize();

    if (currentStage === 'start') {
      await ctx.reply(
        'Добро пожаловать! Для начала работы необходимо пройти регистрацию.',
        Markup.inlineKeyboard([[{ text: 'Начать регистрацию', callback_data: 'register' }]]),
      );
      await ctx.reply('Главное меню доступно внизу:', mainMenu);
    } else if (currentStage === 'first') {
      await ctx.reply(
        'Вы заполнили основные данные. Теперь необходимо внести паспортные данные спортсмена.',
        Markup.inlineKeyboard([[{ text: 'Заполнить паспорт', callback_data: 'register' }]]),
      );
      await ctx.reply('Главное меню доступно внизу:', mainMenu);
    } else if (currentStage === 'passport') {
      await ctx.reply(
        'Вам необходимо заполнить паспортные данные.',
        Markup.inlineKeyboard([[{ text: 'Заполнить паспорт', callback_data: 'passport' }]]),
      );
      await ctx.reply('Главное меню доступно внизу:', mainMenu);
    } else if (currentStage === 'complete') {
      await ctx.reply('Вы успешно зарегистрированы!', mainMenu);
    }
  });

  bot.hears('👤 Профиль', async (ctx) => {
    const userId = ctx.session.supabaseUserId;
    if (!userId) {
      return ctx.reply('Пожалуйста, введите /start для инициализации профиля.');
    }

    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select(`
          full_name,
          phone,
          location:locations(name, parent:locations(name, parent:locations(name)))
        `)
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
        return ctx.reply('Профиль еще не создан. Пройдите регистрацию.');
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
        `;
      }

      if (passportData?.photo_url) {
        await ctx.replyWithPhoto(passportData.photo_url, {
          caption: message,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '📝 Редактировать профиль', callback_data: 'edit_profile' }]],
          },
        });
      } else {
        await ctx.replyWithHTML(message, {
          reply_markup: {
            inline_keyboard: [[{ text: '📝 Редактировать профиль', callback_data: 'edit_profile' }]],
          },
        });
      }
    } catch (err) {
      console.error('Profile fetch error:', err);
      await ctx.reply('Ошибка при получении данных профиля.');
    }
  });

  bot.action('edit_profile', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter('edit-profile');
  });

  bot.action('register', (ctx) => {
    ctx.answerCbQuery().catch(console.error);
    (async () => {
      try {
        const currentStage = await checkUserStage(ctx);
        if (currentStage === 'first') {
          await ctx.scene.enter('passport');
        } else {
          await ctx.scene.enter('first-registration');
        }
      } catch (e) {
        console.error('Error in register action:', e);
        await ctx.reply('Произошла ошибка, попробуйте /start еще раз.');
      }
    })();
  });

  bot.action('passport', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter('passport');
  });

  bot.action('apply', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('Функция подачи заявки пока недоступна.');
  });
}
