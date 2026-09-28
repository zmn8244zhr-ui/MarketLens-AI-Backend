const ALLOWED_INTERVALS = new Set([
  '1min',
  '5min',
  '15min',
  '30min',
  '1h',
  '2h',
  '4h',
  '8h',
  '1day',
  '1week'
]);

const PROVIDERS = new Set([
  'demo',
  'twelve-data',
  'tickerlayer',
  'generic-ohlc'
]);

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

    out.push({
      datetime: t.toISOString(),
      open: +open.toFixed(4),
      high: +high.toFixed(4),
      low: +low.toFixed(4),
      close: +close.toFixed(4),
      volume: Math.round(
        1000000 + Math.random() * 2500000
      )
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
      volume:
        c.volume == null ? null : Number(c.volume)
    }))
    .filter(c =>
      c.datetime &&
      [c.open, c.high, c.low, c.close]
        .every(Number.isFinite)
    );
}

function providerSymbol(symbol) {
  const key = String(symbol || '')
    .trim()
    .toUpperCase();

  if (
    ['USA100', 'US100', 'US TECH 100']
      .includes(key)
  ) {
    return 'US100';
  }

  return key || 'US100';
}

function intervalParts(interval) {
  const map = {
    '1min': [1, 'minute'],
    '5min': [5, 'minute'],
    '15min': [15, 'minute'],
    '1h': [1, 'hour'],
    '4h': [4, 'hour'],
    '1day': [1, 'day']
  };

  return map[interval] || null;
}

function dateString(date) {
  return date.toISOString().slice(0, 10);
}

async function getTickerLayer(
  symbol,
  interval,
  outputsize
) {
  // Trim whitespace/newlines from the Vercel environment variable
  const apiKey = String(
    process.env.MARKET_DATA_API_KEY || ''
  ).trim();

  if (!apiKey) {
    throw new Error(
      'MARKET_DATA_API_KEY is not configured'
    );
  }

  const parts = intervalParts(interval);

  if (!parts) {
    throw new Error(
      `TickerLayer does not directly support ${interval}`
    );
  }

  const [multiplier, timespan] = parts;

  const daysBack = ({
    '1min': 3,
    '5min': 10,
    '15min': 30,
    '1h': 90,
    '4h': 365,
    '1day': 3650
  }[interval] || 10);

  const to = new Date();

  const from = new Date(
    Date.now() -
    daysBack * 24 * 60 * 60 * 1000
  );

  const url =
    `https://api.tickerlayer.com/indices/agg/` +
    `${symbol}/${multiplier}/${timespan}/` +
    `${dateString(from)}/${dateString(to)}` +
    `?sort=asc&limit=5000`;

  const upstream = await fetch(url, {
    headers: {
      'x-api-key': apiKey
    }
  });

  const data = await upstream.json();

  if (!upstream.ok) {
    throw new Error(
      data.message ||
      `TickerLayer request failed (${upstream.status})`
    );
  }

  const values = (data.results || [])
    .map(c => ({
      datetime: new Date(c.t).toISOString(),
      open: Number(c.o),
      high: Number(c.h),
      low: Number(c.l),
      close: Number(c.c),
      volume:
        c.v == null ? null : Number(c.v)
    }));

  return values
    .filter(c =>
      [c.open, c.high, c.low, c.close]
        .every(Number.isFinite)
    )
    .slice(-Number(outputsize));
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
    symbol = 'USA100',
    interval = '5min',
    outputsize = '200'
  } = req.query || {};

  if (!ALLOWED_INTERVALS.has(interval)) {
    return send(res, 400, {
      error: 'Unsupported interval',
      allowedIntervals: [
        ...ALLOWED_INTERVALS
      ]
    });
  }

  const provider = String(
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
      )
    });
  }

  if (provider === 'tickerlayer') {
    try {
      const values = await getTickerLayer(
        pSymbol,
        interval,
        size
      );

      return send(res, 200, {
        ok: true,
        demo: false,
        source: 'tickerlayer',
        provider: 'tickerlayer',
        symbol,
        providerSymbol: pSymbol,
        interval,
        values
      });
    } catch (error) {
      return send(res, 502, {
        ok: false,
        error:
          'Unable to retrieve TickerLayer data',
        provider: 'tickerlayer',
        symbol,
        providerSymbol: pSymbol,
        details: error.message
      });
    }
  }

  return send(res, 501, {
    ok: false,
    error:
      'Provider not implemented in this version',
    provider
  });
}
