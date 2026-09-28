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

function send(res, status, body) {
  res.status(status).json(body);
}

function providerSymbol(symbol) {
  const key = String(symbol || '')
    .trim()
    .toUpperCase();

  if (
    ['USA100', 'US100', 'US TECH 100'].includes(key)
  ) {
    return 'US100';
  }

  return key || 'US100';
}

async function tickerLayerRequest(path) {
  const apiKey = String(
    process.env.MARKET_DATA_API_KEY || ''
  ).trim();

  if (!apiKey) {
    return {
      ok: false,
      status: 500,
      error: 'MARKET_DATA_API_KEY is not configured'
    };
  }

  const upstream = await fetch(
    `https://api.tickerlayer.com${path}`,
    {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json'
      }
    }
  );

  const text = await upstream.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      rawResponse: text
    };
  }

  return {
    ok: upstream.ok,
    status: upstream.status,
    data
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return send(res, 405, {
      ok: false,
      error: 'Method not allowed'
    });
  }

  const symbol = providerSymbol(
    req.query?.symbol || 'USA100'
  );

  const interval =
    req.query?.interval || '5min';

  if (!ALLOWED_INTERVALS.has(interval)) {
    return send(res, 400, {
      ok: false,
      error: 'Unsupported interval',
      allowedIntervals: [
        ...ALLOWED_INTERVALS
      ]
    });
  }

  /*
   * DIAGNOSTIC MODE
   *
   * First ask TickerLayer which index symbols
   * are enabled for this API key.
   */
  try {
    const symbolsResult =
      await tickerLayerRequest(
        '/indices/symbols'
      );

    if (!symbolsResult.ok) {
      return send(res, 502, {
        ok: false,
        diagnostic: 'tickerlayer-symbols',
        tickerLayerStatus:
          symbolsResult.status,
        tickerLayerResponse:
          symbolsResult.data
      });
    }

    const symbols =
      symbolsResult.data?.symbols || [];

    const us100 = symbols.find(
      item =>
        String(item.symbol)
          .toUpperCase() === 'US100'
    );

    return send(res, 200, {
      ok: true,
      diagnostic: true,
      message:
        'TickerLayer authentication is working',
      requestedSymbol: symbol,
      providerSymbol: 'US100',
      us100Enabled: !!us100,
      us100Details: us100 || null,
      symbolCount: symbols.length,
      symbols
    });

  } catch (error) {
    return send(res, 502, {
      ok: false,
      diagnostic: 'tickerlayer-symbols',
      error: error.message
    });
  }
}
