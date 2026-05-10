import { createClient } from '@supabase/supabase-js';

var SUPABASE_URL = 'https://agsgdhutsanhqhpcqqan.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_VOXYW8OgRTTh6dBeMo2RSQ_GcCKEaoE';

export var supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
