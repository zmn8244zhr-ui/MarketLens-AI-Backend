const ALLOWED_INTERVALS = new Set([
  '1min', '5min', '15min', '30min', '1h', '2h', '4h', '8h', '1day', '1week'
]);

const PROVIDERS = new Set(['demo', 'twelve-data', 'generic-ohlc']);

function send(res, status, body) {
  res.status(status).json(body);
}

function demoCandles(interval, count = 80) {
  const stepMs = ({
    '1min': 1,
    '5min': 5,
    '15min': 15,
    '30min': 30,
    '1h': 60,
    '2h': 120,
    '4h': 240,
    '8h': 480,
    '1day': 1440,
    '1week': 10080
  }[interval] || 5) * 60 * 1000;

  let price = 600;
  const out = [];
  const now = Date.now();

  for (let i = count - 1; i >= 0; i--) {
    const t = new Date(now - i * stepMs);
    const drift =
      Math.sin(i / 8) * 0.9 +
      (Math.random() - 0.48) * 2.2;

    const open = price;
    const close = Math.max(1, open + drift);
    const high = Math.max(open, close) + Math.random() * 1.8;
    const low = Math.min(open, close) - Math.random() * 1.8;
    const volume = Math.round(
      1000000 + Math.random() * 2500000
    );

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

function normalizeCandles(values = []) {
  return values
    .map(c => ({
      datetime: c.datetime || c.timestamp || c.time,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: c.volume == null ? null : Number(c.volume)
    }))
    .filter(c =>
      c.datetime &&
      [c.open, c.high, c.low, c.close].every(Number.isFinite)
    );
}

function providerSymbol(symbol) {
  const key = String(symbol || '').trim().toUpperCase();

  if (['USA100', 'US100', 'US TECH 100'].includes(key)) {
    return process.env.USA100_PROVIDER_SYMBOL || 'USA100';
  }

  return key || process.env.MARKET_SYMBOL || 'USA100';
}

async function getTwelveData(symbol, interval, outputsize) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    throw new Error('TWELVE_DATA_API_KEY is not configured');
  }

  const url = new URL(
    'https://api.twelvedata.com/time_series'
  );

  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', interval);
  url.searchParams.set('outputsize', String(outputsize));
  url.searchParams.set('order', 'asc');
  url.searchParams.set('include_ohlc', 'true');
  url.searchParams.set('timezone', 'UTC');
  url.searchParams.set('apikey', apiKey);

  const upstream = await fetch(url);
  const data = await upstream.json();

  if (!upstream.ok || data.status === 'error') {
    throw new Error(
      data.message || 'Twelve Data request failed'
    );
  }

  return normalizeCandles(data.values || []);
}

async function getGenericOHLC(symbol, interval, outputsize) {
  const template = process.env.MARKET_DATA_URL_TEMPLATE;

  if (!template) {
    throw new Error(
      'MARKET_DATA_URL_TEMPLATE is not configured'
    );
  }

  const url = template
    .replaceAll(
      '{symbol}',
      encodeURIComponent(symbol)
    )
    .replaceAll(
      '{interval}',
      encodeURIComponent(interval)
    )
    .replaceAll(
      '{outputsize}',
      encodeURIComponent(String(outputsize))
    );

  const headers = {};

  if (process.env.MARKET_DATA_API_KEY) {
    headers.Authorization =
      `Bearer ${process.env.MARKET_DATA_API_KEY}`;
  }

  const upstream = await fetch(url, { headers });
  const data = await upstream.json();

  if (!upstream.ok) {
    throw new Error(
      data.message ||
      'Generic market data request failed'
    );
  }

  return normalizeCandles(
    data.values ||
    data.data ||
    data.candles ||
    []
  );
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return send(res, 405, {
      error: 'Method not allowed'
    });
  }

  const {
    symbol = process.env.MARKET_SYMBOL || 'USA100',
    interval = '5min',
    outputsize = '200'
  } = req.query || {};

  if (!ALLOWED_INTERVALS.has(interval)) {
    return send(res, 400, {
      error: 'Unsupported interval',
      allowedIntervals: [...ALLOWED_INTERVALS]
    });
  }

  const provider =
    String(
      process.env.MARKET_PROVIDER || 'demo'
    ).toLowerCase();

  if (!PROVIDERS.has(provider)) {
    return send(res, 500, {
      ok: false,
      error: 'Unsupported MARKET_PROVIDER',
      provider
    });
  }

  const size = Math.min(
    Math.max(Number(outputsize) || 80, 1),
    5000
  );

  const pSymbol = providerSymbol(symbol);

  if (provider === 'demo') {
    return send(res, 200, {
      ok: true,
      demo: true,
      source: 'demo',
      provider: 'demo',
      symbol,
      providerSymbol: pSymbol,
      interval,
      values: demoCandles(
        interval,
        Math.min(size, 200)
      ),
      note:
        'Demo mode. Set MARKET_PROVIDER and the relevant server-side provider settings for live data.'
    });
  }

  try {
    const values =
      provider === 'twelve-data'
        ? await getTwelveData(
            pSymbol,
            interval,
            size
          )
        : await getGenericOHLC(
            pSymbol,
            interval,
            size
          );

    return send(res, 200, {
      ok: true,
      demo: false,
      source: provider,
      provider,
      symbol,
      providerSymbol: pSymbol,
      interval,
      values
    });
  } catch (error) {
    return send(res, 502, {
      ok: false,
      error:
        'Unable to retrieve market data',
      provider,
      symbol,
      providerSymbol: pSymbol,
      details: error.message
    });
  }
}
