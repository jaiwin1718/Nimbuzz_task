# Nimbuz platform POC: feedback report

**Prepared by:** Jaiwin S  **Date:** ____  **Nimbuz project / region:** Codintools / ap-south-1 / Testing

## 1. What was tested
A small Node.js + MySQL API (this repository), deployed from GitHub, load tested with k6 up to **250 concurrent users** (about 100 requests per second; mix of reads, writes, a report query and CPU work).

## 2. Setup
| Item | Value |
|---|---|
| Application instance type | |
| Replicas / auto scaling | |
| MySQL tool size | |
| Price per hour (app + DB) | |
| Credits used in total | of $10 |

## 3. Deployment experience
| Question | Answer / notes | Score 1–5 |
|---|---|---|
| Time from "New Application" to first healthy deploy | | |
| GitHub connection and build: did it work first time? | | |
| Environment variables and secrets: easy and clear? | | |
| Health checks: correctly detect up/down? | | |
| Logs: build and runtime logs visible and useful? | | |
| Metrics / dashboard: CPU, memory, requests visible? | | |
| Redeploy after a code change: time and zero downtime? | | |
| Default domain and HTTPS: worked out of the box? | | |
| MySQL tool: easy to create and connect? | | |
| Documentation and console clarity | | |
| Support (if contacted): response time | | |

## 4. Load test results
| Run | Setup | Peak users | Req/s | Errors % | p50 ms | p95 ms | p99 ms | Pass? |
|---|---|---|---|---|---|---|---|---|
| Smoke | | 5 | | | | | | |
| Load 1 | 1 replica | 250 | | | | | | |
| Load 2 | 2 replicas / auto scaling | 250 | | | | | | |
| Load 3 | | 250 | | | | | | |

Observations during the test (CPU/memory peak, restarts, scaling events, errors seen):

## 5. Cost
| | Nimbuz (measured) | Same setup on AWS (estimate) |
|---|---|---|
| App per month | | |
| Database per month | | |
| Total | | |

## 6. Verdict
- **Strengths:**
- **Weaknesses / issues found:**
- **Missing features we would need** (for example: deploy from Azure DevOps, private registry images, SQL Server size):
- **Recommendation:** adopt / adopt for small apps only / do not adopt (with one-line reason)
