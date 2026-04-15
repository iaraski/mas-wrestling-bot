import { Markup, Scenes } from 'telegraf';
import { supabase } from '../supabase';
import { BotContext } from '../types/session';

const formatCategoryGroup = (gender: any, ageMin: any, ageMax: any) => {
  const g = String(gender ?? '').toLowerCase();
  const isMale = g === 'male' || g === 'm';
  const isFemale = g === 'female' || g === 'f';
  const aMin = typeof ageMin === 'number' ? ageMin : Number(ageMin);
  const aMax = typeof ageMax === 'number' ? ageMax : Number(ageMax);
  if (aMin === 18 && aMax === 21) return isMale ? 'Юниоры' : isFemale ? 'Юниорки' : 'Юниоры';
  if (Number.isFinite(aMax) && aMax < 18) return isMale ? 'Юноши' : isFemale ? 'Девушки' : 'Юноши';
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

export const applyCompetitionScene = new Scenes.WizardScene<BotContext>(
  'apply-competition',

  // 1. Показываем доступные категории для этого соревнования
  async (ctx) => {
    const compId = (ctx.scene.state as any).competitionId;
    if (!compId) return ctx.scene.leave();

    try {
      const { data: comp } = await supabase
        .from('competitions')
        .select('name,start_date')
        .eq('id', compId)
        .maybeSingle();
      (ctx.wizard.state as any).compName = comp?.name;
      (ctx.wizard.state as any).compStartDate = comp?.start_date;

      // Получаем данные спортсмена и его паспорт (паспорт может быть не заполнен)
      const { data: athlete, error: athleteError } = await supabase
        .from('athletes')
        .select('id, passports(birth_date, gender)')
        .eq('user_id', ctx.session.supabaseUserId)
        .maybeSingle();

      if (athleteError) throw athleteError;

      if (!athlete) {
        await ctx.reply('Ошибка: спортсмен не найден. Пожалуйста, пройдите регистрацию.');
        return ctx.scene.leave();
      }

      const passport = (athlete as any).passports as any;
      const birthDate = passport?.birth_date ? new Date(passport.birth_date) : null;
      const gender = passport?.gender ? String(passport.gender) : null;
      const startDate = (ctx.wizard.state as any).compStartDate;
      const at = startDate ? new Date(startDate) : new Date();
      const year = Number.isFinite(at.getTime()) ? at.getFullYear() : new Date().getFullYear();
      const age = birthDate && Number.isFinite(birthDate.getTime()) ? year - birthDate.getFullYear() : null;

      if (age == null || !gender) {
        await ctx.reply(
          'Паспортные данные (дата рождения/пол) заполняются администратором/секретарём. Пока вы можете выбрать категорию вручную.',
        );
      }

      // Ищем подходящие категории и сортируем их по весу
      let catsQuery = supabase
        .from('competition_categories')
        .select('*')
        .eq('competition_id', compId)
        .order('weight_min', { ascending: true });
      if (gender) {
        catsQuery = catsQuery.eq('gender', gender);
      }
      if (typeof age === 'number') {
        catsQuery = catsQuery.lte('age_min', age).gte('age_max', age);
      }
      const { data: categories, error: catError } = await catsQuery;

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
        const startDate = (ctx.wizard.state as any).compStartDate;
        let label = formatCategoryLabel(cat, startDate);
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
        const pr2026CompId = (process.env.PR2026_COMP_ID || '').trim();
        const isPr2026Target =
          (pr2026CompId && String(compId) === pr2026CompId) || (!pr2026CompId && isRussiaChamp2026);
        if (isPr2026Target) {
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
