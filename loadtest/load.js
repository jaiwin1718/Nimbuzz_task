// k6 load test for the Nimbuz POC.
//
//   PROFILE=smoke : 5 users for 1 minute   (check it works, costs almost nothing)
//   PROFILE=load  : ramp to 250 concurrent users, hold 5 minutes (about 11 minutes in total)
//
// Run with Docker (no install needed), from the repo folder:
//   docker run --rm -i -e BASE_URL=https://<your-app>.nimbuz.tech -e PROFILE=smoke grafana/k6 run - < loadtest/load.js
//
// Each virtual user behaves like a person: one request, then 1-3 s "think time".
// Mix: 50% list, 20% single item, 15% stats, 10% create, 5% CPU-bound compute.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const BASE = (__ENV.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const PROFILE = __ENV.PROFILE || 'smoke';
const CATEGORIES = ['books', 'electronics', 'grocery', 'home', 'sports', 'toys'];

const profiles = {
  smoke: [
    { duration: '1m', target: 5 },
  ],
  load: [
    { duration: '1m', target: 50 },
    { duration: '1m', target: 150 },
    { duration: '1m', target: 250 },
    { duration: '5m', target: 250 },
    { duration: '1m', target: 0 },
  ],
};

export const options = {
  scenarios: {
    users: { executor: 'ramping-vus', startVUs: 0, stages: profiles[PROFILE] || profiles.smoke, gracefulRampDown: '30s' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],                 // under 1% errors
    http_req_duration: ['p(95)<800', 'p(99)<2000'], // ms
    'http_req_duration{endpoint:list}': ['p(95)<800'],
    'http_req_duration{endpoint:create}': ['p(95)<1000'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// Which replica answered (X-Instance header), to confirm load balancing.
const byInstance = new Counter('responses_by_instance');

function record(res, endpoint) {
  check(res, { [`${endpoint} status ok`]: (r) => r.status >= 200 && r.status < 300 });
  const inst = res.headers['X-Instance'];
  if (inst) byInstance.add(1, { instance: inst });
}

export function setup() {
  const r = http.get(`${BASE}/ready`);
  if (r.status !== 200) throw new Error(`App not ready at ${BASE}/ready (status ${r.status}). Wait for the database, then retry.`);
}

export default function () {
  const p = Math.random();
  if (p < 0.5) {
    const page = 1 + Math.floor(Math.random() * 20);
    const cat = Math.random() < 0.3 ? `&category=${CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)]}` : '';
    record(http.get(`${BASE}/api/items?limit=20&page=${page}${cat}`, { tags: { endpoint: 'list' } }), 'list');
  } else if (p < 0.7) {
    const id = 1 + Math.floor(Math.random() * 5000);
    const r = http.get(`${BASE}/api/items/${id}`, { tags: { endpoint: 'get' } });
    check(r, { 'get status ok': (x) => x.status === 200 || x.status === 404 });
    const inst = r.headers['X-Instance'];
    if (inst) byInstance.add(1, { instance: inst });
  } else if (p < 0.85) {
    record(http.get(`${BASE}/api/stats`, { tags: { endpoint: 'stats' } }), 'stats');
  } else if (p < 0.95) {
    const body = JSON.stringify({
      name: `Load test item ${__VU}-${__ITER}`,
      category: CATEGORIES[__ITER % CATEGORIES.length],
      price: Math.round(Math.random() * 100000) / 100,
    });
    record(http.post(`${BASE}/api/items`, body, { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'create' } }), 'create');
  } else {
    record(http.get(`${BASE}/api/compute?n=2000`, { tags: { endpoint: 'compute' } }), 'compute');
  }
  sleep(1 + Math.random() * 2);
}
