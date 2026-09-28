export default function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  res.status(200).json({
    ok: true,
    service: 'marketlens-ai-backend',
    demoMode: process.env.DEMO_MODE !== 'false',
    time: new Date().toISOString()
  });
}
