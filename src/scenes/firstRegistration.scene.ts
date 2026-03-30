import { Markup, Scenes } from 'telegraf';
import { supabase } from '../supabase';
import { BotContext, RegistrationData } from '../types/session';

const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());

const normalizePhone = (phone: string) => phone.replace(/[^\d+]/g, '');

const isValidPhone = (phone: string) => {
  const normalized = normalizePhone(phone);
  const digits = normalized.replace(/[^\d]/g, '');
  return digits.length >= 10 && digits.length <= 15;
};

export const firstRegistrationScene = new Scenes.WizardScene<BotContext>(
  'first-registration',

  // 0. Сброс/старт

  // 1. Выбор страны
  async (ctx) => {
    ctx.session.registration = {} as RegistrationData;

    // Всегда получаем актуальный supabaseUserId по telegram_id при входе в сцену
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', ctx.from!.id)
      .maybeSingle();

    if (userError || !user) {
      console.error('[Registration Scene] User not found in DB:', userError);
      await ctx.reply('Ошибка: пользователь не найден. Пожалуйста, введите /start');
      return ctx.scene.leave();
    }

    ctx.session.supabaseUserId = user.id;

    // Получаем страны (только Россия по ТЗ)
    const { data: countries, error } = await supabase
      .from('locations')
      .select('id, name')
      .eq('type', 'country')
      .eq('name', 'Россия');

    if (error || !countries || countries.length === 0) {
      await ctx.reply('Ошибка при получении списка стран.');
      return ctx.scene.leave();
    }

    const buttons = countries.map((c) => Markup.button.callback(c.name, `country_${c.id}`));
    await ctx.reply('Выберите страну:', Markup.inlineKeyboard(buttons, { columns: 1 }));

    return ctx.wizard.next();
  },

  // 2. Выбор федерального округа
  async (ctx) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    await ctx.answerCbQuery().catch(() => {}); // Сразу отвечаем Telegram

    if (ctx.callbackQuery.data === 'back_to_country') {
      ctx.wizard.selectStep(1);
      const { data: countries } = await supabase
        .from('locations')
        .select('id, name')
        .eq('type', 'country')
        .eq('name', 'Россия');
      const buttons = (countries || []).map((c: any) =>
        Markup.button.callback(c.name, `country_${c.id}`),
      );
      await ctx.reply('Выберите страну:', Markup.inlineKeyboard(buttons, { columns: 1 }));
      return;
    }

    const countryId = ctx.callbackQuery.data.replace('country_', '');
    ctx.session.registration!.country_id = countryId;

    const { data: districts, error } = await supabase
      .from('locations')
      .select('id, name')
      .eq('parent_id', countryId)
      .eq('type', 'district');

    if (error || !districts || districts.length === 0) {
      await ctx.reply('Ошибка при получении федеральных округов.');
      return ctx.scene.leave();
    }

    const buttons = districts.map((d) => Markup.button.callback(d.name, `district_${d.id}`));
    buttons.push(Markup.button.callback('⬅️ Назад', 'back_to_country'));
    await ctx.reply('Выберите федеральный округ:', Markup.inlineKeyboard(buttons, { columns: 1 }));

    return ctx.wizard.next();
  },

  // 3. Выбор региона
  async (ctx) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    await ctx.answerCbQuery().catch(() => {}); // Сразу отвечаем Telegram

    if (ctx.callbackQuery.data === 'back_to_district') {
      const countryId = ctx.session.registration?.country_id;
      if (!countryId) {
        ctx.wizard.selectStep(1);
        return;
      }
      const { data: districts } = await supabase
        .from('locations')
        .select('id, name')
        .eq('parent_id', countryId)
        .eq('type', 'district');
      const buttons = (districts || []).map((d: any) =>
        Markup.button.callback(d.name, `district_${d.id}`),
      );
      buttons.push(Markup.button.callback('⬅️ Назад', 'back_to_country'));
      ctx.wizard.selectStep(2);
      await ctx.reply(
        'Выберите федеральный округ:',
        Markup.inlineKeyboard(buttons, { columns: 1 }),
      );
      return;
    }

    const districtId = ctx.callbackQuery.data.replace('district_', '');
    ctx.session.registration!.district_id = districtId;

    const { data: regions, error } = await supabase
      .from('locations')
      .select('id, name')
      .eq('parent_id', districtId)
      .eq('type', 'region');

    if (error || !regions || regions.length === 0) {
      await ctx.reply('Ошибка при получении регионов.');
      return ctx.scene.leave();
    }

    const buttons = regions.map((r) => Markup.button.callback(r.name, `region_${r.id}`));
    buttons.push(Markup.button.callback('⬅️ Назад', 'back_to_district'));
    await ctx.reply('Выберите регион:', Markup.inlineKeyboard(buttons, { columns: 2 }));

    return ctx.wizard.next();
  },

  // 4. Ввод ФИО пользователя
  async (ctx) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    await ctx.answerCbQuery().catch(() => {}); // Сразу отвечаем Telegram

    if (ctx.callbackQuery.data === 'back_to_region') {
      const districtId = ctx.session.registration?.district_id;
      if (!districtId) {
        ctx.wizard.selectStep(2);
        return;
      }
      const { data: regions } = await supabase
        .from('locations')
        .select('id, name')
        .eq('parent_id', districtId)
        .eq('type', 'region');
      const buttons = (regions || []).map((r: any) =>
        Markup.button.callback(r.name, `region_${r.id}`),
      );
      buttons.push(Markup.button.callback('⬅️ Назад', 'back_to_district'));
      ctx.wizard.selectStep(3);
      await ctx.reply('Выберите регион:', Markup.inlineKeyboard(buttons, { columns: 2 }));
      return;
    }

    const regionId = ctx.callbackQuery.data.replace('region_', '');
    ctx.session.registration!.region_id = regionId;

    await ctx.reply('Введите ваше ФИО (полностью):', Markup.keyboard([['⬅️ Назад']]).resize());
    return ctx.wizard.next();
  },

  // 5. Ввод email
  async (ctx) => {
    console.log('[Registration Scene] Step 5: Receiving Name');
    if (!ctx.message || !('text' in ctx.message)) {
      console.log('[Registration Scene] Step 5: No text message received');
      return;
    }
    if (ctx.message.text.trim() === '⬅️ Назад') {
      const districtId = ctx.session.registration?.district_id;
      if (!districtId) {
        ctx.wizard.selectStep(2);
        return;
      }
      const { data: regions } = await supabase
        .from('locations')
        .select('id, name')
        .eq('parent_id', districtId)
        .eq('type', 'region');
      const buttons = (regions || []).map((r: any) =>
        Markup.button.callback(r.name, `region_${r.id}`),
      );
      buttons.push(Markup.button.callback('⬅️ Назад', 'back_to_district'));
      ctx.wizard.selectStep(3);
      await ctx.reply('Выберите регион:', Markup.inlineKeyboard(buttons, { columns: 2 }));
      return;
    }
    ctx.session.registration!.full_name = ctx.message.text;
    console.log(`[Registration Scene] Name saved: ${ctx.message.text}`);

    await ctx.reply('Введите ваш email:', Markup.keyboard([['⬅️ Назад']]).resize());
    return ctx.wizard.next();
  },

  // 6. Ввод телефона
  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) return;
    if (ctx.message.text.trim() === '⬅️ Назад') {
      ctx.wizard.selectStep(4);
      await ctx.reply('Введите ваше ФИО (полностью):', Markup.keyboard([['⬅️ Назад']]).resize());
      return;
    }
    const email = ctx.message.text.trim().toLowerCase();
    if (!isValidEmail(email)) {
      await ctx.reply('Пожалуйста, введите корректный email:');
      return;
    }

    const userId = ctx.session.supabaseUserId;
    if (!userId) {
      await ctx.reply('Ошибка сессии. Пожалуйста, введите /start');
      return ctx.scene.leave();
    }

    ctx.session.registration!.email = email;
    await supabase.from('users').update({ email }).eq('id', userId);

    await ctx.reply('Введите ваш номер телефона:', Markup.keyboard([['⬅️ Назад']]).resize());
    return ctx.wizard.next();
  },

  // 7. Ввод ФИО тренера
  async (ctx) => {
    let phone = '';
    if (ctx.message && 'text' in ctx.message) {
      if (ctx.message.text.trim() === '⬅️ Назад') {
        ctx.wizard.selectStep(5);
        await ctx.reply('Введите ваш email:', Markup.keyboard([['⬅️ Назад']]).resize());
        return;
      }
      phone = ctx.message.text.trim();
    } else if (ctx.message && 'contact' in ctx.message) {
      phone = ctx.message.contact.phone_number;
    }

    if (!phone || !isValidPhone(phone)) {
      await ctx.reply('Пожалуйста, введите корректный номер телефона:');
      return;
    }

    ctx.session.registration!.phone = normalizePhone(phone);
    await ctx.reply('Введите ФИО вашего тренера:', Markup.keyboard([['⬅️ Назад']]).resize());
    return ctx.wizard.next();
  },

  // 8. Сохранение данных и предложение продолжить
  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) return;
    if (ctx.message.text.trim() === '⬅️ Назад') {
      ctx.wizard.selectStep(6);
      await ctx.reply('Введите ваш номер телефона:', Markup.keyboard([['⬅️ Назад']]).resize());
      return;
    }
    const coachName = ctx.message.text.trim();
    if (!coachName) {
      await ctx.reply('Пожалуйста, введите ФИО тренера:');
      return;
    }
    ctx.session.registration!.coach_name = coachName;

    const regData = ctx.session.registration!;
    const userId = ctx.session.supabaseUserId!;

    if (!userId) {
      await ctx.reply('Ошибка сессии. Пожалуйста, введите /start');
      return ctx.scene.leave();
    }

    try {
      const { error: profileError } = await supabase.from('profiles').upsert(
        {
          user_id: userId,
          full_name: regData.full_name,
          location_id: regData.region_id,
          phone: regData.phone,
        },
        { onConflict: 'user_id' },
      );

      if (profileError) throw profileError;

      const { error: athleteError } = await supabase.from('athletes').upsert(
        {
          user_id: userId,
          coach_name: regData.coach_name,
        },
        { onConflict: 'user_id' },
      );

      if (athleteError) throw athleteError;

      await ctx.reply(
        'Основные данные сохранены! Желаете заполнить паспортные данные прямо сейчас?',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Да, продолжить', callback_data: 'continue_passport' }],
              [{ text: 'Нет, позже', callback_data: 'skip_passport' }],
              [{ text: '⬅️ Назад', callback_data: 'back_to_coach' }],
            ],
          },
        },
      );
      return ctx.wizard.next();
    } catch (err) {
      console.error('[Registration Scene] Save error:', err);
      await ctx.reply('Произошла ошибка при сохранении данных.');
      return ctx.scene.leave();
    }
  },

  // 9. Обработка выбора продолжения
  async (ctx) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    const choice = ctx.callbackQuery.data;
    await ctx.answerCbQuery().catch(() => {});

    if (choice === 'back_to_coach') {
      ctx.wizard.selectStep(7);
      await ctx.reply('Введите ФИО вашего тренера:', Markup.keyboard([['⬅️ Назад']]).resize());
      return;
    }

    if (choice === 'continue_passport') {
      await supabase
        .from('registrations')
        .upsert(
          { user_id: ctx.session.supabaseUserId, stage: 'passport' },
          { onConflict: 'user_id' },
        );
      await ctx.scene.enter('passport');
      return;
    }

    await supabase
      .from('registrations')
      .upsert({ user_id: ctx.session.supabaseUserId, stage: 'first' }, { onConflict: 'user_id' });
    await ctx.reply(
      'Хорошо! Вы сможете заполнить паспортные данные позже, нажав кнопку в меню /start.',
    );
    await ctx.scene.leave();
  },
);
