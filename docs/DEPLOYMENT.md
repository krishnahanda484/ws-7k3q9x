# Deployment

Status: **not deployed** - deployment needs Vercel and Render accounts that were not available while building. Everything below is prepared; follow it in order. (Platform free-tier limits change; re-check Render/Vercel pricing pages before relying on them.)

Architecture: static React build on Vercel; FastAPI Docker container on Render (a long-lived process holding the cached dataset in memory - a better fit than serverless functions).

## 1. Push the repository

```bash
git remote add origin https://github.com/<account>/<anonymous-repo-name>.git
git push -u origin main
```

## 2. Backend on Render

1. Render dashboard → **New → Blueprint** → select the repo (it reads `render.yaml`), or **New → Web Service → Docker** with:
   * Dockerfile path `./backend/Dockerfile`, Docker context `.` (repo root - needed so `data/` is bundled).
   * Health check path `/api/health`.
2. Environment variables: `CORS_ORIGINS` = your Vercel URL (e.g. `https://<project>.vercel.app`; comma-separate several). `LOG_LEVEL=INFO` optional. `PORT` is injected by Render and honoured by the image.
3. Deploy, then verify: `https://<service>.onrender.com/api/health` → `{"status":"ok","data_loaded":true,"data_mode":"elexon_cached"}`.
4. Free instances sleep when idle; the first request after a pause can take about a minute. Open `/api/health` before a demo to warm it.

## 3. Frontend on Vercel

1. Vercel → **Add New Project** → import the repo → **Root Directory: `frontend`** (framework preset Vite is auto-detected; `vercel.json` adds the SPA rewrite).
2. Environment variable (Production and Preview): `VITE_API_BASE_URL` = `https://<service>.onrender.com` (no trailing slash).
3. Deploy. If you later change the Vercel domain, update `CORS_ORIGINS` on Render.

## 4. Verify

* Open the Vercel URL: header shows **API online** and **REAL ELEXON DATA · CACHED**.
* Overview loads for 15 Jan 2026; changing the cutoff time changes the forecast publication timestamp.
* Optional CLI check: `curl https://<service>.onrender.com/api/metadata`.

## 5. Record the URLs

Put the real Vercel URL at the top of README.md ("Live demo") and in the submission form. Do not claim deployment until `/api/health` and the UI have been checked from a browser that is not signed in to anything.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| UI says "Cannot reach the API" | `VITE_API_BASE_URL` wrong/missing (it is baked in at build time → redeploy after changing) or Render instance asleep |
| Browser console CORS error | `CORS_ORIGINS` on Render doesn't exactly match the Vercel origin (scheme + host, no path) |
| `/api/health` shows `degraded` | `data/` not in the image: check the Docker context is the repo root |
