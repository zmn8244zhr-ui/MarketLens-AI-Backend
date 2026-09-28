# MarketLens AI — Backend v1

This is the secure backend foundation for the MarketLens AI educational market-analysis app.

## What is included

- `/api/health` — backend health/status
- `/api/market` — NQ/ES/DXY/VIX/Oil/yields market snapshot interface
- `/api/macro` — macro dashboard interface
- `/api/news` — news timeline interface
- `/api/calendar` — economic-calendar interface
- `/api/candle-analysis` — evidence-based candle analysis pipeline
- `/api/history` — candle-analysis history interface
- ICT/market-structure detection helpers
- Provider adapters designed so API keys stay server-side

The initial backend runs in DEMO_MODE until provider credentials are configured. It does not place trades or execute orders.

## Important

Do not put API keys in the GitHub Pages frontend. Put them in the backend host's environment/secrets settings.

For real NQ futures data, use a properly licensed market-data source. CME provides a real-time futures/options WebSocket API with trades and top-of-book data, subject to access and applicable fees/entitlements.

FRED provides economic-data APIs and real-time-period/vintage support for historical analysis.

## Deployment target

This project is structured for Vercel because it can deploy API routes directly from a GitHub repository.

After deployment, the frontend will use a URL such as:
`https://YOUR-BACKEND.vercel.app`

Then set that backend URL in the MarketLens frontend configuration.
