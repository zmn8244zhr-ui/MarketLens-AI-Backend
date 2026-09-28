function send(res, status, body) {
  res.status(status).json(body);
}

const ALLOWED_INTERVALS = {
  "1min": "1m",
  "5min": "5m",
  "15min": "15m",
  "30min": "30m",
  "1h": "1h",
  "1day": "1d",
  "1week": "1wk"
};

function getRange(interval) {
  if (interval === "1min") return "1d";
  if (interval === "5min") return "5d";
  if (interval === "15min") return "1mo";
  if (interval === "30min") return "1mo";
  if (interval === "1h") return "3mo";
  if (interval === "1day") return "1y";
  if (interval === "1week") return "5y";

  return "5d";
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return send(res, 405, {
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const symbol = String(req.query.symbol || "NQ=F").trim();
    const interval = String(req.query.interval || "5min").trim();
    const outputsize = Math.min(
      Number(req.query.outputsize || 100),
      500
    );

    const yahooInterval = ALLOWED_INTERVALS[interval];

    if (!yahooInterval) {
      return send(res, 400, {
        ok: false,
        error: "Unsupported interval",
        allowed: Object.keys(ALLOWED_INTERVALS)
      });
    }

    const range = getRange(interval);

    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?interval=${yahooInterval}&range=${range}&includePrePost=true`;

    const upstream = await fetch(url, {
      headers: {
        "User-Agent": "MarketLens-AI/1.0",
        "Accept": "application/json"
      }
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return send(res, 502, {
        ok: false,
        error: "Yahoo Finance request failed",
        status: upstream.status,
        details: data
      });
    }

    const result = data?.chart?.result?.[0];

    if (!result) {
      return send(res, 502, {
        ok: false,
        error: "No Yahoo Finance market data returned",
        details: data?.chart?.error || null
      });
    }

    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};

    const candles = timestamps
      .map((timestamp, i) => ({
        datetime: new Date(timestamp * 1000).toISOString(),
        open: quote.open?.[i],
        high: quote.high?.[i],
        low: quote.low?.[i],
        close: quote.close?.[i],
        volume: quote.volume?.[i] || 0
      }))
      .filter(
        c =>
          Number.isFinite(c.open) &&
          Number.isFinite(c.high) &&
          Number.isFinite(c.low) &&
          Number.isFinite(c.close)
      )
      .slice(-outputsize);

    return send(res, 200, {
      ok: true,
      provider: "yahoo-finance",
      symbol,
      interval,
      count: candles.length,
      candles
    });

  } catch (error) {
    return send(res, 500, {
      ok: false,
      error: error.message
    });
  }
}
