import { Markup, Scenes } from 'telegraf';
import { supabase } from '../supabase';
import { BotContext, RegistrationData } from '../types/session';
import { validators } from '../utils/validation';

export const firstRegistrationScene = new Scenes.WizardScene<BotContext>(
  'first-registration',

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
    const cbQuery = ctx.callbackQuery as any;
    const countryId = cbQuery.data.replace('country_', '');
    const countryName = cbQuery.message?.reply_markup?.inline_keyboard
      ?.flat()
      .find((b: any) => b.callback_data === cbQuery.data)?.text;

    await ctx.answerCbQuery().catch(() => {});

    // Убираем кнопки у предыдущего сообщения
    await ctx.editMessageText(`Страна: ${countryName}`).catch(() => {});

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
    await ctx.reply('Выберите федеральный округ:', Markup.inlineKeyboard(buttons, { columns: 1 }));

    return ctx.wizard.next();
  },

  // 3. Выбор региона
  async (ctx) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    const cbQuery = ctx.callbackQuery as any;
    const districtId = cbQuery.data.replace('district_', '');
    const districtName = cbQuery.message?.reply_markup?.inline_keyboard
      ?.flat()
      .find((b: any) => b.callback_data === cbQuery.data)?.text;

    await ctx.answerCbQuery().catch(() => {});

    // Убираем кнопки у предыдущего сообщения
    await ctx.editMessageText(`Округ: ${districtName}`).catch(() => {});

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
    await ctx.reply('Выберите регион:', Markup.inlineKeyboard(buttons, { columns: 2 }));

    return ctx.wizard.next();
  },

  // 4. Ввод ФИО пользователя
  async (ctx) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    const cbQuery = ctx.callbackQuery as any;
    const regionId = cbQuery.data.replace('region_', '');
    const regionName = cbQuery.message?.reply_markup?.inline_keyboard
      ?.flat()
      .find((b: any) => b.callback_data === cbQuery.data)?.text;

    await ctx.answerCbQuery().catch(() => {});

    // Убираем кнопки у предыдущего сообщения
    await ctx.editMessageText(`Регион: ${regionName}`).catch(() => {});

    ctx.session.registration!.region_id = regionId;

    await ctx.reply('Введите ваше ФИО (полностью):');
    return ctx.wizard.next();
  },

  // 5. Ввод ФИО
  async (ctx) => {
    console.log('[Registration Scene] Step 5: Receiving Name');
    if (!ctx.message || !('text' in ctx.message)) {
      console.log('[Registration Scene] Step 5: No text message received');
      return;
    }

    const name = ctx.message.text;
    if (!validators.fullName(name)) {
      await ctx.reply('Пожалуйста, введите ФИО полностью (три слова через пробел):');
      return;
    }

    ctx.session.registration!.full_name = name;
    console.log(`[Registration Scene] Name saved: ${name}`);

    await ctx.reply('Введите ваш email:');
    return ctx.wizard.next();
  },

  // 6. Ввод email
  async (ctx) => {
    console.log('[Registration Scene] Step 6: Receiving Email');
    if (!ctx.message || !('text' in ctx.message)) {
      console.log('[Registration Scene] Step 6: No text message received');
      return;
    }

    const email = ctx.message.text;
    if (!validators.email(email)) {
      await ctx.reply('Пожалуйста, введите корректный email:');
      return;
    }

    ctx.session.registration!.email = email;
    console.log(`[Registration Scene] Email saved: ${email}`);

    await ctx.reply('Введите ваш номер телефона (начиная с 8, 11 цифр):');
    return ctx.wizard.next();
  },

  // 7. Ввод телефона
  async (ctx) => {
    console.log('[Registration Scene] Step 7: Receiving Phone');
    let phone = '';

    if (ctx.message && 'text' in ctx.message) {
      phone = ctx.message.text;
    } else if (ctx.message && 'contact' in ctx.message) {
      phone = ctx.message.contact.phone_number;
    }

    if (!phone || !validators.phone(phone)) {
      console.log('[Registration Scene] Step 7: Invalid phone number');
      await ctx.reply('Пожалуйста, введите номер телефона корректно (начиная с 8, 11 цифр):');
      return;
    }

    ctx.session.registration!.phone = phone;
    console.log(`[Registration Scene] Phone saved: ${phone}`);

    await ctx.reply('Введите ФИО вашего тренера (три слова через пробел):');
    return ctx.wizard.next();
  },

  // 8. Сохранение данных и предложение продолжить
  async (ctx) => {
    console.log('[Registration Scene] Step 8: Receiving Coach Name');
    if (!ctx.message || !('text' in ctx.message)) {
      console.log('[Registration Scene] Step 8: No text message received');
      return;
    }

    const coachName = ctx.message.text;
    if (!validators.fullName(coachName)) {
      await ctx.reply('Пожалуйста, введите ФИО тренера полностью (три слова через пробел):');
      return;
    }

    ctx.session.registration!.coach_name = coachName;
    console.log(`[Registration Scene] Coach name saved: ${coachName}`);

    const regData = ctx.session.registration!;
    const userId = ctx.session.supabaseUserId!;

    if (!userId) {
      console.error('[Registration Scene] Error: supabaseUserId is missing in session!');
      await ctx.reply('Ошибка сессии. Пожалуйста, введите /start');
      return ctx.scene.leave();
    }

    try {
      console.log('[Registration Scene] Saving data to Supabase...');

      // 1. Обновляем email в основной таблице users
      const { error: userError } = await supabase
        .from('users')
        .update({ email: regData.email })
        .eq('id', userId);

      if (userError) {
        console.error('[Supabase Error] Update user email failed:', userError);
        throw userError;
      }

      // 2. Сохраняем профиль пользователя
      const { error: profileError } = await supabase.from('profiles').upsert(
        {
          user_id: userId,
          full_name: regData.full_name,
          location_id: regData.region_id,
          phone: regData.phone,
        },
        { onConflict: 'user_id' },
      );

      if (profileError) {
        console.error('[Supabase Error] Upsert profile failed:', profileError);
        throw profileError;
      }

      // 3. Создаем запись спортсмена
      const { error: athleteError } = await supabase.from('athletes').upsert(
        {
          user_id: userId,
          coach_name: regData.coach_name,
        },
        { onConflict: 'user_id' },
      );

      if (athleteError) {
        console.error('[Supabase Error] Upsert athlete failed:', athleteError);
        throw athleteError;
      }

      console.log('[Registration Scene] All data saved successfully.');

      await ctx.reply(
        'Основные данные сохранены! Желаете заполнить паспортные данные прямо сейчас?',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Да, продолжить', callback_data: 'continue_passport' }],
              [{ text: 'Нет, позже', callback_data: 'skip_passport' }],
            ],
          },
        },
      );
      return ctx.wizard.next();
    } catch (err) {
      console.error('[Registration Scene] Critical Error:', err);
      await ctx.reply(
        'Произошла ошибка при сохранении данных. Проверьте, добавлены ли все нужные колонки в БД (coach_name).',
      );
      return ctx.scene.leave();
    }
  },

  // 9. Обработка выбора продолжения
  async (ctx) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    const cbQuery = ctx.callbackQuery as any;
    const choice = cbQuery.data;
    await ctx.answerCbQuery();

    // Убираем кнопки подтверждения
    const choiceText = choice === 'continue_passport' ? 'Да, продолжить' : 'Нет, позже';
    await ctx
      .editMessageText(
        `Основные данные сохранены! Желаете заполнить паспортные данные прямо сейчас?\n\nВаш выбор: ${choiceText}`,
      )
      .catch(() => {});

    if (choice === 'continue_passport') {
      // Обновляем статус в БД, что первый этап пройден
      await supabase
        .from('registrations')
        .upsert(
          { user_id: ctx.session.supabaseUserId, stage: 'passport' },
          { onConflict: 'user_id' },
        );

      await ctx.scene.enter('passport');
    } else {
      // Пользователь решил заполнить позже
      await supabase
        .from('registrations')
        .upsert({ user_id: ctx.session.supabaseUserId, stage: 'first' }, { onConflict: 'user_id' });

      await ctx.reply(
        'Хорошо! Вы сможете заполнить паспортные данные позже, нажав кнопку в меню /start.',
      );
      await ctx.scene.leave();
    }
  },
);
