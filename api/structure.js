function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function detectSwings(candles, lookback = 2) {
  const swings = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const h = num(candles[i].high);
    const l = num(candles[i].low);
    if (h == null || l == null) continue;

    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= lookback; j++) {
      if (h <= num(candles[i-j].high) || h <= num(candles[i+j].high)) isHigh = false;
      if (l >= num(candles[i-j].low) || l >= num(candles[i+j].low)) isLow = false;
    }

    if (isHigh) swings.push({ index: i, type: 'swing_high', price: h, time: candles[i].datetime });
    if (isLow) swings.push({ index: i, type: 'swing_low', price: l, time: candles[i].datetime });
  }
  return swings;
}

function detectFVGs(candles) {
  const fvgs = [];
  for (let i = 2; i < candles.length; i++) {
    const a = candles[i-2], c = candles[i];
    const ah = num(a.high), al = num(a.low), ch = num(c.high), cl = num(c.low);
    if ([ah, al, ch, cl].some(v => v == null)) continue;

    // Three-candle imbalance definitions.
    if (cl > ah) {
      fvgs.push({
        index: i,
        type: 'bullish_fvg',
        low: ah,
        high: cl,
        time: c.datetime
      });
    } else if (ch < al) {
      fvgs.push({
        index: i,
        type: 'bearish_fvg',
        low: ch,
        high: al,
        time: c.datetime
      });
    }
  }
  return fvgs;
}

function detectLiquidity(candles, swings, tolerance = 0.0015) {
  const pools = [];
  const highs = swings.filter(s => s.type === 'swing_high');
  const lows = swings.filter(s => s.type === 'swing_low');

  for (let i = 0; i < highs.length; i++) {
    for (let j = i + 1; j < highs.length; j++) {
      const a = highs[i], b = highs[j];
      const base = Math.max(Math.abs(a.price), 1);
      if (Math.abs(a.price - b.price) / base <= tolerance) {
        pools.push({
          type: 'equal_highs',
          price: +((a.price + b.price) / 2).toFixed(6),
          indexes: [a.index, b.index]
        });
      }
    }
  }

  for (let i = 0; i < lows.length; i++) {
    for (let j = i + 1; j < lows.length; j++) {
      const a = lows[i], b = lows[j];
      const base = Math.max(Math.abs(a.price), 1);
      if (Math.abs(a.price - b.price) / base <= tolerance) {
        pools.push({
          type: 'equal_lows',
          price: +((a.price + b.price) / 2).toFixed(6),
          indexes: [a.index, b.index]
        });
      }
    }
  }

  return pools.slice(-40);
}

function detectStructureBreaks(candles, swings) {
  const events = [];
  let lastHigh = null;
  let lastLow = null;
  let priorBias = null;

  for (const s of swings) {
    if (s.type === 'swing_high') lastHigh = s;
    if (s.type === 'swing_low') lastLow = s;

    const candle = candles[s.index];
    if (!candle) continue;

    // Look forward from the confirmed swing to find the first close through it.
    for (let k = s.index + 1; k < candles.length; k++) {
      const close = num(candles[k].close);
      if (close == null) continue;

      if (s.type === 'swing_high' && close > s.price) {
        const eventType = priorBias === 'bearish' ? 'CHOCH_up' : 'BOS_up';
        events.push({
          index: k,
          time: candles[k].datetime,
          type: eventType,
          brokenLevel: s.price
        });
        priorBias = 'bullish';
        break;
      }

      if (s.type === 'swing_low' && close < s.price) {
        const eventType = priorBias === 'bullish' ? 'CHOCH_down' : 'BOS_down';
        events.push({
          index: k,
          time: candles[k].datetime,
          type: eventType,
          brokenLevel: s.price
        });
        priorBias = 'bearish';
        break;
      }
    }
  }

  // Keep the latest structural events; this is descriptive, not a trade signal.
  return events.slice(-30);
}

function detectDisplacement(candles, multiplier = 1.6) {
  const ranges = candles.map(c => Math.max(0, num(c.high) - num(c.low)));
  const out = [];
  for (let i = 5; i < candles.length; i++) {
    const current = ranges[i];
    const recent = ranges.slice(i - 5, i);
    const avg = recent.reduce((a,b) => a+b, 0) / recent.length;
    const body = Math.abs(num(candles[i].close) - num(candles[i].open));
    if (avg > 0 && current >= avg * multiplier && body / current >= 0.55) {
      out.push({
        index: i,
        time: candles[i].datetime,
        type: num(candles[i].close) >= num(candles[i].open) ? 'bullish_displacement' : 'bearish_displacement',
        range: current,
        bodyRatio: +(body / current).toFixed(3)
      });
    }
  }
  return out.slice(-30);
}

function summarize(candles, swings, fvgs, liquidity, breaks, displacement) {
  const latest = candles[candles.length - 1];
  const lastBreak = breaks[breaks.length - 1] || null;
  const lastDisp = displacement[displacement.length - 1] || null;

  return {
    latestClose: latest ? num(latest.close) : null,
    latestTime: latest?.datetime || null,
    latestStructureEvent: lastBreak,
    latestDisplacement: lastDisp,
    swingHighCount: swings.filter(x => x.type === 'swing_high').length,
    swingLowCount: swings.filter(x => x.type === 'swing_low').length,
    bullishFVGCount: fvgs.filter(x => x.type === 'bullish_fvg').length,
    bearishFVGCount: fvgs.filter(x => x.type === 'bearish_fvg').length,
    equalHighPools: liquidity.filter(x => x.type === 'equal_highs').length,
    equalLowPools: liquidity.filter(x => x.type === 'equal_lows').length
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const candles = Array.isArray(req.body?.candles) ? req.body.candles : [];
  const lookback = Math.max(1, Math.min(5, Number(req.body?.lookback) || 2));

  if (candles.length < 10) {
    return res.status(400).json({
      error: 'At least 10 candles are required for structure analysis.'
    });
  }

  const clean = candles
    .map(c => ({
      datetime: c.datetime,
      open: num(c.open),
      high: num(c.high),
      low: num(c.low),
      close: num(c.close),
      volume: c.volume == null ? null : num(c.volume)
    }))
    .filter(c => [c.open, c.high, c.low, c.close].every(v => v != null));

  const swings = detectSwings(clean, lookback);
  const fvgs = detectFVGs(clean);
  const liquidity = detectLiquidity(clean, swings);
  const breaks = detectStructureBreaks(clean, swings);
  const displacement = detectDisplacement(clean);

  return res.status(200).json({
    ok: true,
    engine: 'marketlens-structure-v1',
    descriptiveOnly: true,
    summary: summarize(clean, swings, fvgs, liquidity, breaks, displacement),
    structures: {
      swings: swings.slice(-60),
      fairValueGaps: fvgs.slice(-60),
      liquidityPools: liquidity,
      structureBreaks: breaks,
      displacement
    }
  });
}
