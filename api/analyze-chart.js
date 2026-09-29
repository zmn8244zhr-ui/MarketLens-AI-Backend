function send(res, status, body) {
  return res.status(status).json(body);
}

const MODEL = process.env.CHART_VISION_MODEL || "gpt-5.6-luna";

const SYSTEM_PROMPT = `
You are MarketLens AI, an ICT/SMC trading-chart analysis engine.

Analyze the supplied trading chart screenshot.

Do NOT invent prices, candles, timestamps or structures that are not visible.

Analyze:
- Liquidity pools
- Liquidity sweeps/runs
- Fair Value Gaps (FVG)
- Break of Structure (BOS)
- Change of Character (CHoCH)
- Displacement
- Order Blocks
- Premium / Discount
- Accumulation
- Manipulation
- Distribution
- London Kill Zone
- New York Kill Zone
- Potential ICT entries
- Invalidation / stop areas
- Potential targets

IMPORTANT:
Separate visible observations from possible scenarios.

Never claim a trade is guaranteed.

If the chart is unclear, say so.

Keep the annotations clean and limited to the most important structures.

For every annotation use normalized coordinates:
x = 0 is left
x = 1 is right
y = 0 is top
y = 1 is bottom.

Return JSON only.

The JSON must contain:

{
  "chart": {
    "instrument": null,
    "timeframe": null,
    "timezone": null,
    "confidence": 0
  },

  "bias": {
    "label": "bullish",
    "reason": ""
  },

  "annotations": [],

  "scenarios": [],

  "amd": {
    "phase": "unclear",
    "evidence": []
  },

  "sessions": {
    "londonKillZone": {
      "visible": false,
      "relevance": "unknown",
      "note": ""
    },
    "newYorkKillZone": {
      "visible": false,
      "relevance": "unknown",
      "note": ""
    }
  },

  "summary": "",
  "warnings": []
}

Annotation types allowed:

liquidity
liquidity_sweep
fvg
bos
choch
displacement
order_block
amd
kill_zone
entry
stop
target

Direction:

bullish
bearish
neutral

Scenario status:

confirmed
possible
wait

For each scenario provide:
- name
- direction
- status
- entry
- invalidation
- targets
- reasoning
- confirmation

Only return the clearest and highest-value structures.
`;

export default async function handler(req, res) {

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return send(res, 405, {
      ok: false,
      error: "Method not allowed"
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return send(res, 503, {
      ok: false,
      error: "OPENAI_API_KEY is not configured."
    });
  }

  const image = req.body?.image;

  if (
    typeof image !== "string" ||
    !image.startsWith("data:image/")
  ) {
    return send(res, 400, {
      ok: false,
      error: "Chart image is required."
    });
  }

  const context = {
    instrument: req.body?.instrument || null,
    timeframe: req.body?.timeframe || null,
    timezone:
      req.body?.timezone ||
      "Africa/Johannesburg"
  };

  try {

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          "Authorization":
            `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({

          model: MODEL,

          input: [

            {
              role: "system",

              content: [
                {
                  type: "input_text",
                  text: SYSTEM_PROMPT
                }
              ]
            },

            {
              role: "user",

              content: [

                {
                  type: "input_text",

                  text:
                    `Analyze this trading chart.

User supplied context:
${JSON.stringify(context)}

The screenshot is the source of truth for visible price action.`
                },

                {
                  type: "input_image",

                  image_url: image,

                  detail: "high"
                }

              ]
            }

          ],

          text: {
            format: {
              type: "json_schema",

              name:
                "marketlens_chart_analysis",

              strict: true,

              schema: {

                type: "object",

                additionalProperties: false,

                properties: {

                  chart: {
                    type: "object",
                    additionalProperties: false,

                    properties: {
                      instrument: {
                        type: ["string", "null"]
                      },

                      timeframe: {
                        type: ["string", "null"]
                      },

                      timezone: {
                        type: ["string", "null"]
                      },

                      confidence: {
                        type: "number"
                      }
                    },

                    required: [
                      "instrument",
                      "timeframe",
                      "timezone",
                      "confidence"
                    ]
                  },

                  bias: {
                    type: "object",
                    additionalProperties: false,

                    properties: {

                      label: {
                        type: "string",
                        enum: [
                          "bullish",
                          "bearish",
                          "neutral",
                          "unclear"
                        ]
                      },

                      reason: {
                        type: "string"
                      }
                    },

                    required: [
                      "label",
                      "reason"
                    ]
                  },

                  annotations: {

                    type: "array",

                    items: {

                      type: "object",

                      additionalProperties: false,

                      properties: {

                        type: {
                          type: "string",
                          enum: [
                            "liquidity",
                            "liquidity_sweep",
                            "fvg",
                            "bos",
                            "choch",
                            "displacement",
                            "order_block",
                            "amd",
                            "kill_zone",
                            "entry",
                            "stop",
                            "target"
                          ]
                        },

                        direction: {
                          type: "string",
                          enum: [
                            "bullish",
                            "bearish",
                            "neutral"
                          ]
                        },

                        label: {
                          type: "string"
                        },

                        confidence: {
                          type: "number"
                        },

                        x1: {
                          type: "number"
                        },

                        y1: {
                          type: "number"
                        },

                        x2: {
                          type: [
                            "number",
                            "null"
                          ]
                        },

                        y2: {
                          type: [
                            "number",
                            "null"
                          ]
                        }

                      },

                      required: [
                        "type",
                        "direction",
                        "label",
                        "confidence",
                        "x1",
                        "y1",
                        "x2",
                        "y2"
                      ]
                    }
                  },

                  scenarios: {

                    type: "array",

                    items: {

                      type: "object",

                      additionalProperties: false,

                      properties: {

                        name: {
                          type: "string"
                        },

                        direction: {
                          type: "string",
                          enum: [
                            "bullish",
                            "bearish",
                            "neutral"
                          ]
                        },

                        status: {
                          type: "string",
                          enum: [
                            "confirmed",
                            "possible",
                            "wait"
                          ]
                        },

                        entry: {
                          type: "string"
                        },

                        invalidation: {
                          type: "string"
                        },

                        targets: {
                          type: "array",
                          items: {
                            type: "string"
                          }
                        },

                        reasoning: {
                          type: "array",
                          items: {
                            type: "string"
                          }
                        },

                        confirmation: {
                          type: "array",
                          items: {
                            type: "string"
                          }
                        }

                      },

                      required: [
                        "name",
                        "direction",
                        "status",
                        "entry",
                        "invalidation",
                        "targets",
                        "reasoning",
                        "confirmation"
                      ]
                    }
                  },

                  amd: {

                    type: "object",

                    additionalProperties: false,

                    properties: {

                      phase: {
                        type: "string",
                        enum: [
                          "accumulation",
                          "manipulation",
                          "distribution",
                          "transition",
                          "unclear"
                        ]
                      },

                      evidence: {
                        type: "array",
                        items: {
                          type: "string"
                        }
                      }

                    },

                    required: [
                      "phase",
                      "evidence"
                    ]
                  },

                  sessions: {

                    type: "object",

                    additionalProperties: false,

                    properties: {

                      londonKillZone: {

                        type: "object",

                        additionalProperties: false,

                        properties: {

                          visible: {
                            type: "boolean"
                          },

                          relevance: {
                            type: "string",
                            enum: [
                              "high",
                              "medium",
                              "low",
                              "unknown"
                            ]
                          },

                          note: {
                            type: "string"
                          }

                        },

                        required: [
                          "visible",
                          "relevance",
                          "note"
                        ]
                      },

                      newYorkKillZone: {

                        type: "object",

                        additionalProperties: false,

                        properties: {

                          visible: {
                            type: "boolean"
                          },

                          relevance: {
                            type: "string",
                            enum: [
                              "high",
                              "medium",
                              "low",
                              "unknown"
                            ]
                          },

                          note: {
                            type: "string"
                          }

                        },

                        required: [
                          "visible",
                          "relevance",
                          "note"
                        ]
                      }

                    },

                    required: [
                      "londonKillZone",
                      "newYorkKillZone"
                    ]
                  },

                  summary: {
                    type: "string"
                  },

                  warnings: {
                    type: "array",
                    items: {
                      type: "string"
                    }
                  }

                },

                required: [
                  "chart",
                  "bias",
                  "annotations",
                  "scenarios",
                  "amd",
                  "sessions",
                  "summary",
                  "warnings"
                ]
              }
            }
          }

        })
      }
    );

    const data = await response.json();

    if (!response.ok) {

      return send(res, 502, {
        ok: false,
        error: "Vision analysis failed",
        details: data
      });

    }

    if (!data.output_text) {

      return send(res, 502, {
        ok: false,
        error:
          "The AI returned no chart analysis."
      });

    }

    let analysis;

    try {

      analysis =
        JSON.parse(data.output_text);

    } catch {

      return send(res, 502, {
        ok: false,
        error:
          "The AI returned invalid analysis data."
      });

    }

    return send(res, 200, {

      ok: true,

      engine:
        "marketlens-chart-vision-v1",

      model: MODEL,

      descriptiveOnly: true,

      analysis

    });

  } catch (error) {

    return send(res, 500, {
      ok: false,
      error: error.message
    });

  }
}
