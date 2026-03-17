import { supabase } from '../supabase';
import { BotContext } from '../types/session';

// Функция для получения или создания пользователя и проверки его статуса
export async function checkUserStage(ctx: BotContext) {
  const telegramId = ctx.from!.id;

  try {
    // 1. Всегда ищем актуальный ID пользователя по telegram_id
    let { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', telegramId)
      .maybeSingle();

    if (userError) {
      console.error('[checkUserStage] Error fetching user:', userError);
      return null;
    }

    if (!user) {
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({ telegram_id: telegramId })
        .select('id')
        .maybeSingle();

      if (createError) {
        console.error('[checkUserStage] Error creating user:', createError);
        return null;
      }
      user = newUser;
    }

    ctx.session.supabaseUserId = user!.id;

    // 2. Ищем статус регистрации
    let { data: registration, error: regError } = await supabase
      .from('registrations')
      .select('stage')
      .eq('user_id', user!.id)
      .maybeSingle();

    if (regError) {
      console.error('[checkUserStage] Error fetching registration:', regError);
      return 'start';
    }

    // 3. Проверяем наличие профиля, если статус не 'start'
    if (registration && registration.stage !== 'start') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (!profile) {
        console.log(
          `[checkUserStage] Profile missing for user ${user!.id}, resetting stage to 'start'`,
        );
        await supabase.from('registrations').update({ stage: 'start' }).eq('user_id', user!.id);
        return 'start';
      }
    }

    if (!registration) {
      const { data: newReg, error: createRegError } = await supabase
        .from('registrations')
        .insert({ user_id: user!.id, stage: 'start' })
        .select('stage')
        .maybeSingle();

      if (createRegError) {
        console.error('[checkUserStage] Error creating registration:', createRegError);
        return 'start';
      }
      registration = newReg;
    }

    return registration?.stage || 'start';
  } catch (err) {
    console.error('[checkUserStage] Unexpected error:', err);
    return null;
  }
}
