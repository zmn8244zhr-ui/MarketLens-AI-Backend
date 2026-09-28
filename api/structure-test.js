import structureHandler from './structure.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const host = process.env.VERCEL_URL || req.headers.host;
    const base = host.startsWith('http') ? host : `https://${host}`;

    const marketResponse = await fetch(
      `${base}/api/market?symbol=QQQ&interval=5min&outputsize=100`
    );
    const market = await marketResponse.json();

    if (!marketResponse.ok || !Array.isArray(market.values)) {
      return res.status(502).json({
        ok: false,
        error: 'Could not retrieve candle data for structure test',
        market
      });
    }

    let statusCode = 200;
    let payload = null;

    const mockRes = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        payload = body;
        return this;
      },
      end() {
        return this;
      }
    };

    await structureHandler(
      {
        method: 'POST',
        body: {
          candles: market.values,
          lookback: 2
        }
      },
      mockRes
    );

    return res.status(statusCode).json({
      ok: statusCode >= 200 && statusCode < 300,
      test: true,
      market: {
        source: market.source,
        demo: market.demo,
        symbol: market.symbol,
        interval: market.interval,
        candleCount: market.values.length
      },
      structure: payload
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      test: true,
      error: 'Structure test failed',
      details: error.message
    });
  }
}
