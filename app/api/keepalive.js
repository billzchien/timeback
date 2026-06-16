export default async function handler(req, res) {
  const response = await fetch(
    'https://agsgdhutsanhqhpcqqan.supabase.co/rest/v1/pto_settings?limit=1',
    {
      headers: {
        apikey: 'sb_publishable_VOXYW8OgRTTh6dBeMo2RSQ_GcCKEaoE',
        Authorization: 'Bearer sb_publishable_VOXYW8OgRTTh6dBeMo2RSQ_GcCKEaoE',
      },
    }
  );
  res.status(response.ok ? 200 : 500).json({ ok: response.ok });
}
