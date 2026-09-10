// ============================================================
// CONFIGURACIÓN DE SUPABASE
// Estos valores ya están conectados a tu proyecto real.
// ============================================================
const SUPABASE_URL = "https://cppunumoinkobprdukqw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_O4jAgjeqW4cqD7VmpqgsEA_R5mYT7_6";

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
