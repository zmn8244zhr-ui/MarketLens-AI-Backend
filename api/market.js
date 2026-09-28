const ALLOWED_INTERVALS = new Set([
  '5min', '15min', '30min', '1h', '2h', '4h', '8h', '1day', '1week'
]);

function send(res, status, body) {
  res.status(status).json(body);
}

function demoCandles(interval, count = 80) {
  const stepMs = ({
    '5min': 5, '15min': 15, '30min': 30,
    '1h': 60, '2h': 120, '4h': 240, '8h': 480,
    '1day': 1440, '1week': 10080
  }[interval] || 5) * 60 * 1000;

  let price = 600;
  const out = [];
  const now = Date.now();

  for (let i = count - 1; i >= 0; i--) {
    const t = new Date(now - i * stepMs);
    const drift = Math.sin(i / 8) * 0.9 + (Math.random() - 0.48) * 2.2;
    const open = price;
    const close = Math.max(1, open + drift);
    const high = Math.max(open, close) + Math.random() * 1.8;
    const low = Math.min(open, close) - Math.random() * 1.8;
    const volume = Math.round(1000000 + Math.random() * 2500000);
    out.push({
      datetime: t.toISOString(),
      open: +open.toFixed(4),
      high: +high.toFixed(4),
      low: +low.toFixed(4),
      close: +close.toFixed(4),
      volume
    });
    price = close;
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });

  const {
    symbol = process.env.MARKET_SYMBOL || 'QQQ',
    interval = '5min',
    outputsize = '200'
  } = req.query || {};

  if (!ALLOWED_INTERVALS.has(interval)) {
    return send(res, 400, {
      error: 'Unsupported interval',
      allowedIntervals: [...ALLOWED_INTERVALS]
    });
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY;

  // No key: return clearly labelled demo data so the app remains usable.
  if (!apiKey) {
    return send(res, 200, {
      ok: true,
      demo: true,
      source: 'demo',
      symbol,
      interval,
      values: demoCandles(interval, Math.min(Number(outputsize) || 80, 200)),
      note: 'Add TWELVE_DATA_API_KEY in Vercel to enable provider data.'
    });
  }

  try {
    const url = new URL('https://api.twelvedata.com/time_series');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', interval);
    url.searchParams.set('outputsize', String(Math.min(Number(outputsize) || 200, 5000)));
    url.searchParams.set('order', 'asc');
    url.searchParams.set('include_ohlc', 'true');
    url.searchParams.set('timezone', 'UTC');
    url.searchParams.set('apikey', apiKey);

    const upstream = await fetch(url);
    const data = await upstream.json();

    if (!upstream.ok || data.status === 'error') {
      return send(res, 502, {
        ok: false,
        error: 'Market data provider error',
        provider: 'twelve-data',
        details: data.message || data
      });
    }

    const values = (data.values || []).map(c => ({
      datetime: c.datetime,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: c.volume == null ? null : Number(c.volume)
    }));

    return send(res, 200, {
      ok: true,
      demo: false,
      source: 'twelve-data',
      symbol,
      interval,
      values
    });
  } catch (error) {
    return send(res, 500, {
      ok: false,
      error: 'Unable to retrieve market data',
      details: error.message
    });
  }
}