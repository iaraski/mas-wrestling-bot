import { Context, Scenes } from 'telegraf';

export interface RegistrationData {
  country?: string;
  country_id?: string;
  district?: string;
  district_id?: string;
  region?: string;
  region_id?: string;
  city?: string;
  full_name?: string;
  coach?: string;
  coach_name?: string;
  email?: string;
  pending_email_change?: boolean;
  phone?: string;
  web_password?: string;
}

export interface PassportData {
  series?: string;
  number?: string;
  issued?: string;
  issue_date?: string;
  birth?: string;
  rank?: string;
  gender?: string;
  photo_url?: string;
  passport_scan_url?: string;
}

export interface SessionData extends Scenes.WizardSessionData {
  registration?: RegistrationData;
  passport?: PassportData;
  supabaseUserId?: string;
}

export interface BotContext extends Context {
  session: Scenes.WizardSession<SessionData> & SessionData;
  scene: Scenes.SceneContextScene<BotContext, SessionData>;
  wizard: Scenes.WizardContextWizard<BotContext>;
}
