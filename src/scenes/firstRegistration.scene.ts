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

  // 4. Ввод населенного пункта (город)
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

    await ctx.reply('Введите ваш населенный пункт (город/село):');
    return ctx.wizard.next();
  },

  // 5. Ввод ФИО пользователя
  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) return;
    const city = ctx.message.text.trim();
    ctx.session.registration!.city = city;

    await ctx.reply('Введите ваше ФИО полностью (три слова через пробел):');
    return ctx.wizard.next();
  },

  // 6. Ввод Email
  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) return;
    const fullName = ctx.message.text.trim();

    if (!validators.fullName(fullName)) {
      await ctx.reply('Пожалуйста, введите ФИО полностью (три слова через пробел):');
      return;
    }

    ctx.session.registration!.full_name = fullName;

    await ctx.reply('Введите ваш Email:');
    return ctx.wizard.next();
  },

  // 7. Ввод Email + отправка письма подтверждения
  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) return;
    const email = ctx.message.text.trim();

    if (!validators.email(email)) {
      await ctx.reply('Пожалуйста, введите корректный Email:');
      return;
    }

    ctx.session.registration!.email = email;

    const userId = ctx.session.supabaseUserId;
    if (!userId) {
      await ctx.reply('Ошибка сессии. Пожалуйста, введите /start');
      return ctx.scene.leave();
    }

    const apiBase =
      process.env.API_URL || process.env.VITE_API_URL || 'https://api.mas-wrestling.pro';
    try {
      const resp = await fetch(`${apiBase}/api/v1/auth/bot-init-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, user_id: userId, telegram_id: ctx.from!.id }),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        console.error('[Registration Scene] bot-init-email failed:', txt);
        await ctx.reply('Не удалось отправить письмо подтверждения. Попробуйте позже.');
        return ctx.scene.leave();
      }
    } catch (e) {
      console.error('[Registration Scene] bot-init-email error:', e);
      await ctx.reply('Не удалось отправить письмо подтверждения. Попробуйте позже.');
      return ctx.scene.leave();
    }

    await ctx.reply(
      'Мы отправили письмо для подтверждения email. После подтверждения нажмите кнопку ниже.',
      Markup.inlineKeyboard([
        [{ text: 'Я подтвердил email', callback_data: 'email_confirmed' }],
        [{ text: 'Отправить письмо ещё раз', callback_data: 'email_resend' }],
        [{ text: 'Изменить email', callback_data: 'email_change' }],
      ]),
    );

    return ctx.wizard.next();
  },

  // 8. Проверка подтверждения email / повторная отправка / смена email
  async (ctx) => {
    const apiBase =
      process.env.API_URL || process.env.VITE_API_URL || 'https://api.mas-wrestling.pro';
    const userId = ctx.session.supabaseUserId;
    if (!userId) {
      await ctx.reply('Ошибка сессии. Пожалуйста, введите /start');
      return ctx.scene.leave();
    }

    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const data = (ctx.callbackQuery as any).data as string;
      await ctx.answerCbQuery().catch(() => {});

      if (data === 'email_confirmed') {
        try {
          const statusResp = await fetch(
            `${apiBase}/api/v1/auth/bot-confirmation-status?telegram_id=${ctx.from!.id}&user_id=${userId}`,
          );
          if (!statusResp.ok) {
            await ctx.reply('Не удалось проверить подтверждение email. Попробуйте позже.');
            return;
          }
          const status = (await statusResp.json()) as { confirmed?: boolean };
          if (!status.confirmed) {
            await ctx.reply(
              'Email ещё не подтверждён. Перейдите по ссылке из письма, затем нажмите «Я подтвердил email».',
            );
            return;
          }

          await ctx.editMessageText('Email подтверждён.').catch(() => {});
          await ctx.reply('Введите ваш номер телефона (начиная с 8, 11 цифр, без пробелов):');
          return ctx.wizard.next();
        } catch (e) {
          console.error('[Registration Scene] confirmation-status error:', e);
          await ctx.reply('Не удалось проверить подтверждение email. Попробуйте позже.');
          return;
        }
      }

      if (data === 'email_resend') {
        const email = ctx.session.registration?.email;
        if (!email) {
          await ctx.reply('Email не найден. Нажмите «Изменить email» и введите заново.');
          return;
        }
        try {
          const r = await fetch(`${apiBase}/api/v1/auth/bot-resend-confirmation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          if (!r.ok) {
            await ctx.reply('Не удалось отправить письмо ещё раз. Попробуйте позже.');
            return;
          }
          await ctx.reply(
            'Письмо отправлено повторно. Проверьте почту и нажмите «Я подтвердил email».',
          );
        } catch (e) {
          console.error('[Registration Scene] resend-confirmation error:', e);
          await ctx.reply('Не удалось отправить письмо ещё раз. Попробуйте позже.');
        }
        return;
      }

      if (data === 'email_change') {
        ctx.session.registration!.pending_email_change = true;
        await ctx.reply('Введите email заново:');
        return;
      }

      return;
    }

    if (ctx.message && 'text' in ctx.message) {
      if (!ctx.session.registration?.pending_email_change) return;

      const newEmail = ctx.message.text.trim();
      if (!validators.email(newEmail)) {
        await ctx.reply('Пожалуйста, введите корректный Email:');
        return;
      }

      try {
        const r = await fetch(`${apiBase}/api/v1/auth/bot-update-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_email: newEmail, user_id: userId, telegram_id: ctx.from!.id }),
        });
        if (!r.ok) {
          const txt = await r.text();
          console.error('[Registration Scene] bot-update-email failed:', txt);
          await ctx.reply('Не удалось обновить email. Попробуйте позже.');
          return;
        }
      } catch (e) {
        console.error('[Registration Scene] bot-update-email error:', e);
        await ctx.reply('Не удалось обновить email. Попробуйте позже.');
        return;
      }

      ctx.session.registration!.email = newEmail;
      ctx.session.registration!.pending_email_change = false;

      await ctx.reply(
        'Письмо отправлено на новый email. После подтверждения нажмите кнопку ниже.',
        Markup.inlineKeyboard([
          [{ text: 'Я подтвердил email', callback_data: 'email_confirmed' }],
          [{ text: 'Отправить письмо ещё раз', callback_data: 'email_resend' }],
          [{ text: 'Изменить email', callback_data: 'email_change' }],
        ]),
      );
      return;
    }
  },

  // 9. Ввод телефона
  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) return;
    const phone = ctx.message.text.trim();

    if (!validators.phone(phone)) {
      await ctx.reply('Пожалуйста, введите номер телефона корректно (начиная с 8, 11 цифр):');
      return;
    }

    ctx.session.registration!.phone = phone;

    await ctx.reply('Введите пароль для веб-версии (не менее 8 символов):');
    return ctx.wizard.next();
  },

  // 10. Ввод пароля для веб-версии
  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) return;
    const password = ctx.message.text.trim();
    if (password.length < 8) {
      await ctx.reply('Пароль должен содержать не менее 8 символов. Попробуйте снова:');
      return;
    }

    const apiBase =
      process.env.API_URL || process.env.VITE_API_URL || 'https://api.mas-wrestling.pro';
    const userId = ctx.session.supabaseUserId;
    if (!userId) {
      await ctx.reply('Ошибка сессии. Пожалуйста, введите /start');
      return ctx.scene.leave();
    }

    try {
      const r = await fetch(`${apiBase}/api/v1/auth/bot-set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, user_id: userId, telegram_id: ctx.from!.id }),
      });
      if (!r.ok) {
        const txt = await r.text();
        console.error('[Registration Scene] bot-set-password failed:', txt);
        await ctx.reply(
          'Не удалось установить пароль. Убедитесь, что email подтвержден, и попробуйте снова.',
        );
        return;
      }
    } catch (e) {
      console.error('[Registration Scene] bot-set-password error:', e);
      await ctx.reply('Не удалось установить пароль. Попробуйте позже.');
      return ctx.scene.leave();
    }

    await ctx.reply('Введите ФИО вашего тренера полностью (три слова через пробел):');
    return ctx.wizard.next();
  },

  // 11. Сохранение данных
  async (ctx) => {
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
          city: regData.city,
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
        'Пароль для веб-версии установлен. После подтверждения email вы сможете войти на сайт.',
      );

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
      await ctx.reply('Произошла ошибка при сохранении данных.');
      return ctx.scene.leave();
    }
  },

  // 12. Обработка выбора продолжения
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
