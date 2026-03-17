import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: async (url, options) => {
      const startTime = Date.now();
      const method = options?.method || 'GET';
      
      console.log(`[Supabase Request] ${method} ${url}`);
      if (options?.body) {
        console.log(`[Supabase Body]`, options.body);
      }

      const response = await fetch(url, options);
      const duration = Date.now() - startTime;

      console.log(`[Supabase Response] ${response.status} ${response.statusText} (${duration}ms)`);
      
      return response;
    }
  }
});
