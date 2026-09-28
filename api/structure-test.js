import structureHandler from './structure.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const closes = [
    600, 602, 601, 604, 603, 606, 605, 607, 606, 609,
    608, 610, 609, 612, 611, 614, 613, 616, 615, 618,
    617, 619, 618, 621, 620, 624, 623, 626, 625, 628,
    627, 630, 629, 632, 631, 634, 633, 636, 635, 639,
    638, 642, 641, 645
  ];

  const candles = closes.map((close, i) => ({
    datetime: new Date(Date.UTC(2026, 8, 28, 18, i * 5)).toISOString(),
    open: i ? closes[i - 1] : 600,
    high: Math.max(i ? closes[i - 1] : 600, close) + 1,
    low: Math.min(i ? closes[i - 1] : 600, close) - 1,
    close,
    volume: 1000000 + i * 10000
  }));

  let result;
  const mockRes = {
    status(code) { this.code = code; return this; },
    json(body) { result = body; return this; },
    end() { return this; }
  };

  await structureHandler(
    { method: 'POST', body: { candles, lookback: 2 } },
    mockRes
  );

  return res.status(200).json({
    ok: true,
    test: true,
    candleCount: candles.length,
    structure: result
  });
}
