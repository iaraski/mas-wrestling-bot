import { Markup, Scenes } from 'telegraf';
import { supabase } from '../supabase';
import { BotContext, RegistrationData } from '../types/session';
import { validators } from '../utils/validation';

const withBack = (data: string) =>
  Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', data)]]);

const promptCity = async (ctx: BotContext) => {
  await ctx.reply('Введите ваш населенный пункт (город/село):', withBack('reg_back_to_regions'));
};

const promptFullName = async (ctx: BotContext) => {
  await ctx.reply(
    'Введите ваше ФИО полностью (три слова через пробел):',
    withBack('reg_back_to_city'),
  );
};

const promptEmail = async (ctx: BotContext) => {
  await ctx.reply('Введите ваш Email:', withBack('reg_back_to_full_name'));
};

const promptPhone = async (ctx: BotContext) => {
  await ctx.reply(
    'Введите ваш номер телефона (начиная с 8, 11 цифр, без пробелов):',
    withBack('reg_back_to_email'),
  );
};

const promptCoach = async (ctx: BotContext) => {
  await ctx.reply(
    'Введите ФИО вашего тренера полностью (три слова через пробел):',
    withBack('reg_back_to_phone'),
  );
};

const sendCountries = async (ctx: BotContext) => {
  const { data: countries, error } = await supabase
    .from('locations')
    .select('id, name')
    .eq('type', 'country')
    .eq('name', 'Россия');

  if (error || !countries || countries.length === 0) {
    await ctx.reply('Ошибка при получении списка стран.');
    return false;
  }

  const buttons = countries.map((c) => Markup.button.callback(c.name, `country_${c.id}`));
  await ctx.reply('Выберите страну:', Markup.inlineKeyboard(buttons, { columns: 1 }));
  return true;
};

const sendDistricts = async (ctx: BotContext, countryId: string) => {
  const { data: districts, error } = await supabase
    .from('locations')
    .select('id, name')
    .eq('parent_id', countryId)
    .eq('type', 'district');

  if (error || !districts || districts.length === 0) {
    await ctx.reply('Ошибка при получении федеральных округов.');
    return false;
  }

  const buttons = districts.map((d) => Markup.button.callback(d.name, `district_${d.id}`));
  buttons.push(Markup.button.callback('⬅️ Назад', 'back_to_country'));
  await ctx.reply('Выберите федеральный округ:', Markup.inlineKeyboard(buttons, { columns: 1 }));
  return true;
};

const sendRegions = async (ctx: BotContext, districtId: string) => {
  const { data: regions, error } = await supabase
    .from('locations')
    .select('id, name')
    .eq('parent_id', districtId)
    .eq('type', 'region');

  if (error || !regions || regions.length === 0) {
    await ctx.reply('Ошибка при получении регионов.');
    return false;
  }

  const buttons = regions.map((r) => Markup.button.callback(r.name, `region_${r.id}`));
  buttons.push(Markup.button.callback('⬅️ Назад', 'back_to_district'));
  await ctx.reply('Выберите регион:', Markup.inlineKeyboard(buttons, { columns: 2 }));
  return true;
};

export const firstRegistrationScene = new Scenes.WizardScene<BotContext>(
  'first-registration',

  // 0. Старт
  async (ctx) => {
    ctx.session.registration = {} as RegistrationData;

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

    const ok = await sendCountries(ctx);
    if (!ok) return ctx.scene.leave();
    return ctx.wizard.next();
  },

  // 1. Выбор страны
  async (ctx) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    const cbQuery = ctx.callbackQuery as any;
    const countryId = cbQuery.data.replace('country_', '');
    const countryName = cbQuery.message?.reply_markup?.inline_keyboard
      ?.flat()
      .find((b: any) => b.callback_data === cbQuery.data)?.text;

    await ctx.answerCbQuery().catch(() => {});
    await ctx.editMessageText(`Страна: ${countryName}`).catch(() => {});

    ctx.session.registration!.country_id = countryId;
    const ok = await sendDistricts(ctx, countryId);
    if (!ok) return ctx.scene.leave();
    return ctx.wizard.next();
  },

  // 2. Выбор федерального округа
  async (ctx) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    await ctx.answerCbQuery().catch(() => {});

    if (ctx.callbackQuery.data === 'back_to_country') {
      ctx.wizard.selectStep(0);
      const ok = await sendCountries(ctx);
      if (!ok) return ctx.scene.leave();
      return ctx.wizard.next();
    }

    const cbQuery = ctx.callbackQuery as any;
    const districtId = cbQuery.data.replace('district_', '');
    const districtName = cbQuery.message?.reply_markup?.inline_keyboard
      ?.flat()
      .find((b: any) => b.callback_data === cbQuery.data)?.text;

    await ctx.editMessageText(`Округ: ${districtName}`).catch(() => {});

    ctx.session.registration!.district_id = districtId;
    const ok = await sendRegions(ctx, districtId);
    if (!ok) return ctx.scene.leave();
    return ctx.wizard.next();
  },

  // 3. Выбор региона
  async (ctx) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    await ctx.answerCbQuery().catch(() => {});

    if (ctx.callbackQuery.data === 'back_to_district') {
      const countryId = ctx.session.registration?.country_id;
      if (!countryId) return ctx.scene.leave();
      ctx.wizard.selectStep(1);
      const ok = await sendDistricts(ctx, countryId);
      if (!ok) return ctx.scene.leave();
      return ctx.wizard.next();
    }

    const cbQuery = ctx.callbackQuery as any;
    const regionId = cbQuery.data.replace('region_', '');
    const regionName = cbQuery.message?.reply_markup?.inline_keyboard
      ?.flat()
      .find((b: any) => b.callback_data === cbQuery.data)?.text;

    await ctx.editMessageText(`Регион: ${regionName}`).catch(() => {});

    ctx.session.registration!.region_id = regionId;
    await promptCity(ctx);
    return ctx.wizard.next();
  },

  // 4. Ввод города
  async (ctx) => {
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      if (String(ctx.callbackQuery.data) === 'reg_back_to_regions') {
        await ctx.answerCbQuery().catch(() => {});
        const districtId = ctx.session.registration?.district_id;
        if (!districtId) return ctx.scene.leave();
        ctx.wizard.selectStep(3);
        await sendRegions(ctx, districtId);
      }
      return;
    }

    if (!ctx.message || !('text' in ctx.message)) return;
    const city = ctx.message.text.trim();

    if (city === '') {
      await ctx.reply('Пожалуйста, введите населенный пункт (город/село):');
      return;
    }

    if (city === '⬅️ Назад') {
      const districtId = ctx.session.registration?.district_id;
      if (!districtId) return ctx.scene.leave();
      ctx.wizard.selectStep(2);
      const ok = await sendRegions(ctx, districtId);
      if (!ok) return ctx.scene.leave();
      return ctx.wizard.next();
    }

    ctx.session.registration!.city = city;
    await promptFullName(ctx);
    return ctx.wizard.next();
  },

  // 5. Ввод ФИО
  async (ctx) => {
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      if (String(ctx.callbackQuery.data) === 'reg_back_to_city') {
        await ctx.answerCbQuery().catch(() => {});
        ctx.wizard.selectStep(4);
        await promptCity(ctx);
      }
      return;
    }

    if (!ctx.message || !('text' in ctx.message)) return;
    const fullName = ctx.message.text.trim();

    if (!validators.fullName(fullName)) {
      await ctx.reply('Пожалуйста, введите ФИО полностью (три слова через пробел):');
      return;
    }

    ctx.session.registration!.full_name = fullName;
    await promptEmail(ctx);
    return ctx.wizard.next();
  },

  // 6. Ввод Email
  async (ctx) => {
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      if (String(ctx.callbackQuery.data) === 'reg_back_to_full_name') {
        await ctx.answerCbQuery().catch(() => {});
        ctx.wizard.selectStep(5);
        await promptFullName(ctx);
      }
      return;
    }

    if (!ctx.message || !('text' in ctx.message)) return;
    const email = ctx.message.text.trim();

    if (!validators.email(email)) {
      await ctx.reply('Пожалуйста, введите корректный Email:');
      return;
    }

    ctx.session.registration!.email = email;
    const userId = ctx.session.supabaseUserId;
    if (userId) {
      await supabase.from('users').update({ email }).eq('id', userId);
    }

    await promptPhone(ctx);
    return ctx.wizard.next();
  },

  // 7. Ввод телефона
  async (ctx) => {
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      if (String(ctx.callbackQuery.data) === 'reg_back_to_email') {
        await ctx.answerCbQuery().catch(() => {});
        ctx.wizard.selectStep(6);
        await promptEmail(ctx);
      }
      return;
    }

    if (!ctx.message || !('text' in ctx.message)) return;
    const phone = ctx.message.text.trim();

    if (!validators.phone(phone)) {
      await ctx.reply('Пожалуйста, введите номер телефона корректно (начиная с 8, 11 цифр):');
      return;
    }

    ctx.session.registration!.phone = phone;
    await promptCoach(ctx);
    return ctx.wizard.next();
  },

  // 8. Ввод тренера + сохранение
  async (ctx) => {
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      if (String(ctx.callbackQuery.data) === 'reg_back_to_phone') {
        await ctx.answerCbQuery().catch(() => {});
        ctx.wizard.selectStep(7);
        await promptPhone(ctx);
      }
      return;
    }

    if (!ctx.message || !('text' in ctx.message)) return;
    const coachName = ctx.message.text.trim();

    if (!validators.fullName(coachName)) {
      await ctx.reply('Пожалуйста, введите ФИО тренера полностью (три слова через пробел):');
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
          city: regData.city,
          phone: regData.phone,
        },
        { onConflict: 'user_id' },
      );
      if (profileError) throw profileError;

      const { error: athleteError } = await supabase
        .from('athletes')
        .upsert({ user_id: userId, coach_name: regData.coach_name }, { onConflict: 'user_id' });
      if (athleteError) throw athleteError;

      await supabase
        .from('registrations')
        .upsert(
          { user_id: ctx.session.supabaseUserId, stage: 'first' },
          { onConflict: 'user_id' },
        );

      await ctx.reply(
        '✅ Основные данные сохранены.\n\nПаспортные данные заполняются администратором/секретарём. Вы можете подавать заявку на соревнование в разделе «Соревнования».',
      );
      return ctx.scene.leave();
    } catch (err) {
      console.error('[Registration Scene] Save error:', err);
      await ctx.reply('Произошла ошибка при сохранении данных.');
      return ctx.scene.leave();
    }
  },
);
