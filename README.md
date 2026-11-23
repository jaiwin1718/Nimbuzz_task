# Nimbuz POC sample app

A small **Node.js + MySQL** web API, built to test the **Nimbuz** platform with **250 concurrent users** on a small budget.

It behaves like a typical business app (reads, writes, a report query, some CPU work), but has no real data, no logins and sends no emails, so the results measure **the platform**, not the app.

## What's in it
| Path | What |
|---|---|
| `src/server.js` | Express API |
| `src/db.js` | MySQL pool, table creation, one-time seeding (5,000 rows) |
| `public/index.html` | Small web page: which replica served you, latest items, add form |
| `Dockerfile` | Production image (Node 24, non-root) |
| `docker-compose.yml` | App + MySQL on your own machine |
| `loadtest/load.js` | k6 load test: `smoke` (5 users) and `load` (250 users) |
| `docs/poc-feedback-template.md` | Report to fill in for the manager |

## Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Process is up (no database). Use as the Nimbuz **Health Endpoint** |
| GET | `/ready` | Database reachable |
| GET | `/api/info` | Instance name, Node version, request count, average latency, memory |
| GET | `/api/items?limit=20&page=1&category=books` | List (paged, optional filter) |
| GET | `/api/items/:id` | One item |
| POST | `/api/items` | Create: `{"name":"x","category":"toys","price":12.5}` |
| GET | `/api/stats` | Aggregate query (GROUP BY) |
| GET | `/api/compute?n=2000` | CPU-bound work (2,000 SHA-256 rounds, max 20,000) |
| GET | `/` | Web page |

Every response has an `X-Instance` header naming the replica that answered.

## Configuration (environment variables)
| Name | Default | Notes |
|---|---|---|
| `PORT` | `8080` | |
| `DB_HOST` | `localhost` | From the Nimbuz MySQL tool |
| `DB_PORT` | `3306` | |
| `DB_USER` | `app` | |
| `DB_PASSWORD` | *(empty)* | **Put in Nimbuz "Secrets", not environment variables** |
| `DB_NAME` | `sampledb` | Created automatically if the user is allowed to |
| `DB_POOL_SIZE` | `10` | Connections per replica |
| `SEED_ROWS` | `5000` | Inserted only when the table is empty |
| `DB_SSL` | `false` | `true` for TLS to MySQL |
| `DB_SSL_REJECT_UNAUTHORIZED` | `true` | `false` only for a self-signed database certificate |

## Run locally
```
docker compose up --build
```
Open http://localhost:8080. Stop with `docker compose down -v`.

## Deploy on Nimbuz
1. **Tools → MySQL**: create a MySQL instance. Note host, port, user, password, database.
2. **Applications → New Application**
   - Deployment type: **Deploy from GitHub repo**, this repository, branch `main`
   - Name: `nimbuz-sample-app`
   - Port: `8080`
   - Folder Path: *(leave empty, repo root)*
   - Docker File Name: `Dockerfile`
   - Health Endpoint: `/health`
   - Replicas: `1` to start, Auto scaling off
   - Instance Type: the smallest size with at least **0.25 CPU / 0.5 GB** (`femto.m` at 0.015 CPU / 0.128 GB is too small)
3. **Environment variable** step: `PORT`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_NAME`, `DB_POOL_SIZE`, `SEED_ROWS`
4. **Secrets** step: `DB_PASSWORD`
5. Deploy. Check `https://<app-url>/health`, then `/ready` (may take a minute while the table is seeded), then the web page.

## Load test
Uses k6 in Docker, nothing to install. Run from this folder.

Smoke (5 users, 1 minute, check it works):
```
docker run --rm -i -e BASE_URL=https://<app-url> -e PROFILE=smoke grafana/k6 run - < loadtest/load.js
```
Full test (ramp to **250 concurrent users**, hold 5 minutes, about 11 minutes total):
```
docker run --rm -i -e BASE_URL=https://<app-url> -e PROFILE=load grafana/k6 run - < loadtest/load.js
```
On Windows `cmd`, the same commands work. In PowerShell wrap them: `cmd /c "docker run ... < loadtest\load.js"`.

Pass criteria (built into the script): errors under 1%, p95 under 800 ms, p99 under 2 s.

Suggested runs (record each in `docs/poc-feedback-template.md`):
1. 1 replica, smallest workable instance
2. 2 replicas (or auto scaling on), same instance size
3. One size up, if the budget allows

Each virtual user waits 1–3 s between requests, so 250 users is roughly 100 requests per second.

## Local baseline (23 Nov 2026, laptop, Docker)
Smoke profile: 57 requests, **0% errors**, p95 **23 ms**, all checks passed.
