import { createClient } from '@supabase/supabase-js';

import { showConsentPage } from './consent-page';
import { supabasePublishableKey, supabaseUrl } from './supabase-project';

const supabase = createClient(supabaseUrl, supabasePublishableKey, { auth: { flowType: 'pkce' } });

void showConsentPage({
  auth: supabase.auth,
  root: document.getElementById('consent')!,
  url: new URL(window.location.href),
  navigate: (url) => window.location.assign(url),
});
