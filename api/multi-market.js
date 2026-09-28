const DEFAULT_INTERVALS = ['15min', '1h', '4h', '1day'];

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const symbol = req.query?.symbol || process.env.MARKET_SYMBOL || 'QQQ';
  const intervals = (req.query?.intervals || DEFAULT_INTERVALS.join(','))
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);

  const base = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
  const results = {};

  for (const interval of intervals) {
    const response = await fetch(
      `${base}/api/market?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&outputsize=200`
    );
    results[interval] = await response.json();
  }

  res.status(200).json({
    ok: true,
    symbol,
    intervals,
    data: results
  });
}