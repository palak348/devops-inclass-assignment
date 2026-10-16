# CareSlot frontend (React + Vite)

Single-page clinic dashboard: KPIs, upcoming visits and the waiting room, appointment list
with status filters, booking dialog, doctor roster and patient register. Responsive (phone
layout below 760 px). All API calls are same-origin `/api/...`.

```text
frontend/
├── src/
│   ├── App.jsx                 views, data loading (30 s refresh), toasts, confirmations
│   ├── api.js                  fetch wrapper for /api
│   ├── styles.css              layout, components, mobile breakpoint
│   └── components/             Sidebar · KpiCards · AppointmentTable · BookingModal · DoctorList · PatientList
├── nginx/default.conf.template Nginx config; ${BACKEND_URL} is filled in at container start
├── Dockerfile                  multi-stage: node:22-alpine build → nginx-unprivileged:1.30-alpine (uid 101, port 8080)
└── package.json / package-lock.json   pinned versions, installed with npm ci
```

## Run

```bash
npm ci
npm run dev       # http://localhost:5173 ; /api is proxied to http://localhost:8000
npm run build     # production build in dist/
```

## How `/api` reaches the backend

| Where | Route |
|---|---|
| `npm run dev` | Vite proxy → `localhost:8000` (`vite.config.js`) |
| Docker Compose | Nginx proxies `/api/` → `BACKEND_URL=http://backend:8000` |
| Kubernetes | the Ingress sends `/api` straight to the backend Service; Nginx's proxy (`BACKEND_URL=http://careslot-backend:8000`) is only used via port-forward |
