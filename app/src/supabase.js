import { createClient } from '@supabase/supabase-js';

// TODO: replace with Timeout Supabase project credentials
var SUPABASE_URL = 'YOUR_SUPABASE_URL';
var SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

export var supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
