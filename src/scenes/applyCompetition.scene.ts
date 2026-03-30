import { Markup, Scenes } from 'telegraf';
import { supabase } from '../supabase';
import { BotContext } from '../types/session';

export const applyCompetitionScene = new Scenes.WizardScene<BotContext>(
  'apply-competition',

  // 1. Показываем доступные категории для этого соревнования
  async (ctx) => {
    const compId = (ctx.scene.state as any).competitionId;
    if (!compId) return ctx.scene.leave();

    try {
      const { data: comp } = await supabase
        .from('competitions')
        .select('name')
        .eq('id', compId)
        .maybeSingle();
      (ctx.wizard.state as any).compName = comp?.name;

      // Получаем данные спортсмена и его паспорт
      const { data: athlete, error: athleteError } = await supabase
        .from('athletes')
        .select('id, passports(birth_date, gender)')
        .eq('user_id', ctx.session.supabaseUserId)
        .maybeSingle();

      if (athleteError) throw athleteError;

      if (!athlete || !athlete.passports) {
        await ctx.reply(
          'Ошибка: данные паспорта не найдены. Пожалуйста, заполните профиль полностью.',
        );
        return ctx.scene.leave();
      }

      const passport = athlete.passports as any;
      const birthDate = new Date(passport.birth_date);
      const gender = passport.gender;
      const age = new Date().getFullYear() - birthDate.getFullYear();

      console.log(`[Apply Scene] Athlete: ${athlete.id}, Age: ${age}, Gender: ${gender}`);

      // Ищем подходящие категории и сортируем их по весу
      const { data: categories, error: catError } = await supabase
        .from('competition_categories')
        .select('*')
        .eq('competition_id', compId)
        .eq('gender', gender)
        .lte('age_min', age)
        .gte('age_max', age)
        .order('weight_min', { ascending: true });

      if (catError) throw catError;

      // Фильтруем дубликаты (группируем по полу, возрасту и весу)
      const uniqueCategoriesMap = new Map();
      categories.forEach((c) => {
        const key = `${c.gender}-${c.age_min}-${c.age_max}-${c.weight_min}-${c.weight_max}-${c.competition_day || ''}`;
        if (!uniqueCategoriesMap.has(key)) {
          uniqueCategoriesMap.set(key, c);
        }
      });
      const uniqueCategories = Array.from(uniqueCategoriesMap.values());

      if (uniqueCategories.length === 0) {
        await ctx.reply(
          'К сожалению, для вашего возраста и пола нет подходящих категорий в этом соревновании.',
        );
        return ctx.scene.leave();
      }

      (ctx.wizard.state as any).athleteId = athlete.id;
      (ctx.wizard.state as any).compId = compId;
      (ctx.wizard.state as any).categories = uniqueCategories;

      const buttons = uniqueCategories.map((cat: any) => {
        let weightLabel = '';
        if (cat.weight_max === 999) {
          weightLabel = `${Math.floor(cat.weight_min)}+ кг`;
        } else {
          weightLabel = cat.weight_max ? `до ${cat.weight_max} кг` : `свыше ${cat.weight_min} кг`;
        }

        let label = weightLabel;
        if (cat.competition_day) {
          label += ` (${new Date(cat.competition_day).toLocaleDateString('ru-RU')})`;
        }

        return [Markup.button.callback(label, `select_cat_${cat.id}`)];
      });

      buttons.push([Markup.button.callback('⬅️ Назад', 'apply_back')]);
      await ctx.reply('Выберите вашу весовую категорию:', Markup.inlineKeyboard(buttons));
      return ctx.wizard.next();
    } catch (err) {
      console.error('Error in apply scene:', err);
      await ctx.reply('Произошла ошибка. Попробуйте позже.');
      return ctx.scene.leave();
    }
  },

  // 2. Подтверждение и сохранение заявки
  async (ctx) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    const data = String((ctx.callbackQuery as any).data);
    await ctx.answerCbQuery();

    const { athleteId, compId } = ctx.wizard.state as any;

    try {
      if (data === 'apply_back') {
        await ctx.editMessageReplyMarkup(undefined).catch(() => {});
        await ctx.editMessageText('Отмена подачи заявки.').catch(() => {});

        const { data: competitions } = await supabase
          .from('competitions')
          .select('*')
          .gte('end_date', new Date().toISOString())
          .order('start_date', { ascending: true });

        if (!competitions || competitions.length === 0) {
          await ctx.reply('На данный момент нет активных соревнований.');
          return ctx.scene.leave();
        }

        const buttons = competitions.map((c) => [
          Markup.button.callback(c.name, `comp_info_${c.id}`),
        ]);
        await ctx.reply('Выберите соревнование:', Markup.inlineKeyboard(buttons));
        return ctx.scene.leave();
      }

      const catId = data.replace('select_cat_', '');
      const { error } = await supabase.from('applications').insert({
        competition_id: compId,
        athlete_id: athleteId,
        category_id: catId,
        // declared_weight больше не требуется при подаче, только на мандатной комиссии
        status: 'pending',
      });

      if (error) {
        if (error.code === '23505') {
          await ctx.reply('Вы уже подали заявку на это соревнование.');
        } else {
          throw error;
        }
      } else {
        await ctx.reply(
          '✅ Ваша заявка успешно подана! Ожидайте подтверждения участия организаторами.',
        );

        const compName = String((ctx.wizard.state as any).compName || '');
        const isRussiaChamp2026 =
          compName.toLowerCase().includes('первенств') && compName.includes('2026');
        if (isRussiaChamp2026) {
          await ctx.reply(
            'Мандатная комиссия пройдет 24 апреля и начнется с верификации паспорта спортсмена (ваших загруженных данных).\nТолько после этого вы будете допущены к взвешиванию.',
          );
        }
      }
    } catch (err) {
      console.error('Save application error:', err);
      await ctx.reply('Ошибка при сохранении заявки.');
    }

    return ctx.scene.leave();
  },
);
