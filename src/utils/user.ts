import { supabase } from '../supabase';
import { BotContext } from '../types/session';

export async function checkUserStage(ctx: BotContext) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return null;

  try {
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

    let { data: registration, error: regError } = await supabase
      .from('registrations')
      .select('stage')
      .eq('user_id', user!.id)
      .maybeSingle();

    if (regError) {
      console.error('[checkUserStage] Error fetching registration:', regError);
      return 'start';
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

