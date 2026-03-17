import { Context, Scenes } from 'telegraf';

export interface RegistrationData {
  country_id?: string;
  district_id?: string;
  region_id?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  coach_name?: string;
}

export interface PassportData {
  series?: string;
  number?: string;
  issued?: string;
  issue_date?: string;
  birth?: string;
  gender?: string;
  rank?: string;
  photo_url?: string;
}

export interface SessionData extends Scenes.WizardSessionData {
  supabaseUserId?: string;
  registration?: RegistrationData;
  passport?: PassportData;
}

export interface BotContext extends Context {
  session: Scenes.WizardSession<SessionData> & SessionData;
  scene: Scenes.SceneContextScene<BotContext, SessionData>;
  wizard: Scenes.WizardContextWizard<BotContext>;
}
