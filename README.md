# Orca Aviation EFB Platform

Airline-grade Electronic Flight Bag, Payload Calculator, and Dispatch Management Platform for Dash 8 operations.

## Project structure

```
orca-aviation-efb/
├── frontend/    React + TypeScript + Tailwind CSS (UI — fully built)
└── backend/     Node.js + Express + API (skeleton — logic pending)
```

## Getting started

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:5173`. Start at the login screen, then click **Sign In** to enter the application shell (Dashboard, Dispatch Center, Payload & RTOW, and all other modules).

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Runs at `http://localhost:4000`. Every route currently returns `501 Not Implemented` — they are wired up and ready for the performance engine, database, and auth logic to be added.

## What's built

**Frontend (complete UI, mock data):**
- Login page — pixel-matched to the approved mockup: split-screen aviation hero (animated SVG Dash 8 aircraft, radar sweep, route line, globe, telemetry stats) + glassmorphism-style sign-in panel
- App shell — collapsible sidebar (14 modules) + top bar with live UTC clock, search, notifications, profile
- Dashboard — operational overview cards, recent dispatches table, weather alerts
- Payload & RTOW Calculator — full input form + results (RTOW, payload, weights, limiting factor, dispatch status) with a placeholder calculation so the UI is testable before the real engine is wired in
- Dispatch Center, Flight Planning, OFP Generator, Weather, Route Builder, Fleet Management, Airports Database, Performance Analysis (chart), AI Dispatch Assistant (chat UI), Reports, Users, Settings

All pages are mobile responsive (sidebar collapses to a slide-out drawer on small screens, grids stack on mobile).

**Backend (structure only, per request):**
- Express + TypeScript server with CORS, JSON body parsing, WebSocket channel for real-time updates
- Route files for every module (`auth`, `aircraft`, `airports`, `performance`, `dispatch`, `flight-planning`, `ofp`, `weather`, `reports`, `users`) — each currently a stub returning `501`
- JWT-based auth middleware (`requireAuth`, `requireRole`) ready to apply once login is implemented
- PostgreSQL pool + Redis client configs, pointed at `.env` values
- `performanceEngine.service.ts` — the placeholder for the RTOW/WAT interpolation engine described in the PRD; this is where the digitized Dash 8 chart data and lookup logic will go

## Design tokens

```
--primary: #1E5EFF;
--primary-dark: #0F3D91;
--primary-darker: #082A63;
--background: #F8FAFC;
--surface: #FFFFFF;
--success: #22C55E;
--warning: #F59E0B;
--danger: #EF4444;
--text-primary: #14213D;
--text-secondary: #64748B;
--border: #E5EAF3;
```

## Next steps

1. Stand up PostgreSQL + Redis (see `backend/.env.example` for connection strings)
2. Digitize the Dash 8 performance charts into the database
3. Implement `performanceEngine.service.ts` (interpolation logic)
4. Wire up `auth.routes.ts` (JWT issuing, password hashing with bcrypt)
5. Replace frontend mock data (`frontend/src/data/mockData.ts`) with real API calls via React Query
