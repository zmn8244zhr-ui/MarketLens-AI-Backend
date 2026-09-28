function send(res, status, body) {
  res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return send(res, 405, {
      ok: false,
      error: 'Method not allowed'
    });
  }

  const apiKey = String(
    process.env.MARKET_DATA_API_KEY || ''
  ).trim();

  if (!apiKey) {
    return send(res, 500, {
      ok: false,
      error: 'MARKET_DATA_API_KEY is not configured'
    });
  }

  try {
    const url =
      'https://api.tickerlayer.com/indices/quote/US100';

    const upstream = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json'
      }
    });

    const responseText = await upstream.text();

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      data = {
        rawResponse: responseText
      };
    }

    return send(res, 200, {
      ok: upstream.ok,
      tickerLayerStatus: upstream.status,
      endpoint: '/indices/quote/US100',
      response: data
    });

  } catch (error) {
    return send(res, 502, {
      ok: false,
      error: error.message
    });
  }
}
