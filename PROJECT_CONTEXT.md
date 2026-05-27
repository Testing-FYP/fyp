# Project Context

> This document describes the **TravelElite** codebase as observed on 2026-05-27.
> It is intended for AI coding assistants. Do **not** treat assumptions as facts — see Section 21.

---

## 1. Project Summary

**TravelElite** is a full-stack travel planning and booking web application. It provides an AI-powered trip planner that generates personalized itineraries (flights, hotels, activities, budget breakdowns) using Gemini AI, a "Surprise Me" destination discovery feature, and a user account system for saving trips, reservations, and profile information. The app combines a Next.js frontend with a separate Node.js/Express backend.

---

## 2. Core Idea

The website solves the problem of fragmented travel planning by consolidating flight search, hotel search, AI-generated itineraries, and trip management into a single premium interface. Users answer a multi-step wizard and the system builds a complete travel plan — including real flight and hotel results from Google Flights/Hotels (via SerpApi), AI-generated activity recommendations with geocoded coordinates, and a detailed budget breakdown.

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | Next.js 15 (App Router, React 19, TypeScript) |
| **Backend Server** | Node.js / Express 4 (separate process on port 5000) |
| **Primary Database** | Microsoft SQL Server (via `mssql` npm package) — used by the Express backend |
| **Authentication** | JWT (jsonwebtoken + bcryptjs) — custom implementation on Express backend |
| **Styling** | Tailwind CSS 4, shadcn/ui (radix-nova style), CSS custom properties (oklch color system), dark/light mode |
| **UI Components** | shadcn/ui (button, calendar), Radix UI primitives, Lucide React icons |
| **Animations** | Motion (formerly Framer Motion) v12 |
| **AI / LLM** | Google Gemini 2.5 Flash (`@google/genai`), Groq (Llama 3.3 70B) as fallback |
| **Flight Search** | SerpApi Google Flights (primary), Duffel API (legacy/secondary) |
| **Hotel Search** | SerpApi Google Hotels (primary)|
| **Geocoding** | LocationIQ, Nominatim (OpenStreetMap), SerpApi Google Maps |
| **Charts** | Recharts, D3.js |
| **Forms** | react-hook-form with Zod resolvers (`@hookform/resolvers`) |
| **Date Handling** | date-fns, react-day-picker |
| **File Uploads** | Multer (avatar uploads on Express backend) |
| **Deployment** | Google AI Studio (Cloud Run) — `output: 'standalone'` in Next config |
| **Dev Tools** | ESLint, TypeScript 5.9, nodemon, PostCSS |

---

## 4. Repository Structure

```
fyp/
├── app/                          # Next.js App Router pages and API routes
│   ├── api/                      # Next.js API route handlers
│   │   ├── airports/suggestions/ # Airport autocomplete (Duffel)
│   │   ├── buses/search/         # Bus search (mock data)
│   │   ├── flights/
│   │   │   ├── search/           # Flight search (Duffel)
│   │   │   └── book/             # Flight booking (Duffel)
│   │   ├── google-api/           # SerpApi helper modules
│   │   │   ├── google-flights.ts # SerpApi Google Flights wrapper
│   │   │   └── google-hotels.ts  # SerpApi Google Hotels wrapper
│   │   └── planner/
│   │       ├── generate/         # Main AI trip planner (~1828 lines, core logic)
│   │       ├── surprise/         # "Surprise Me" AI destination suggestions
│   │       └── cost-estimates/   # AI-powered cost estimation per destination
│   ├── auth/                     # Login / Signup page
│   ├── planner/                  # Redirects to / (planner is on homepage)
│   ├── profile/                  # User profile management page
│   ├── reservations/             # User reservations list page
│   ├── trips/                    # User saved trips list page
│   ├── globals.css               # Global styles, CSS variables, design tokens
│   ├── layout.tsx                # Root layout (fonts, AuthProvider, Navbar)
│   ├── loading.tsx               # Loading state
│   └── page.tsx                  # Homepage — hero + trip planner wizard + results
│
├── backend/                      # Separate Express.js backend (port 5000)
│   ├── db/
│   │   ├── connection.js         # SQL Server connection pool (mssql)
│   │   ├── init.sql              # Full SQL Server schema (Users, Profiles, Trips, Reservations)
│   │   ├── initDb.js             # Database initialization script
│   │   └── migrate_names.js      # Migration: full_name → first_name + last_name
│   ├── middleware/
│   │   └── auth.js               # JWT authentication middleware
│   ├── routes/
│   │   ├── auth.js               # Signup, login, logout, /me endpoints
│   │   ├── profile.js            # Profile CRUD + avatar upload
│   │   ├── trips.js              # Trips CRUD (list, create, get, update, delete)
│   │   └── reservations.js       # Reservations CRUD (list, create, get, cancel)
│   ├── uploads/                  # Avatar file uploads directory
│   ├── server.js                 # Express app entry point
│   └── package.json              # Backend-specific dependencies
│
├── components/                   # React components
│   ├── ui/                       # shadcn/ui components (button, calendar)
│   ├── AIRecommendation.tsx      # AI recommendation display
│   ├── AirportAutocomplete.tsx   # Airport search input (Duffel suggestions)
│   ├── BookingModal.tsx          # Flight booking modal
│   ├── BusCard.tsx               # Bus search result card
│   ├── FlightCard.tsx            # Flight search result card (~19KB)
│   ├── FlightSearch.tsx          # Flight search form (~22KB)
│   ├── HotelCard.tsx             # Hotel search result card
│   ├── Navbar.tsx                # Navigation bar with auth-aware links
│   ├── SurpriseMeDiscovery.tsx   # "Surprise Me" destination discovery UI (~22KB)
│   ├── ThemeToggle.tsx           # Light/dark mode toggle
│   ├── TripPlannerResults.tsx    # Trip plan results display (~55KB, largest component)
│   └── TripPlannerWizard.tsx     # Multi-step trip planning wizard (~60KB)
│
├── hooks/
│   ├── useAuth.tsx               # AuthContext provider (JWT, localStorage)
│   └── use-mobile.ts             # Mobile viewport detection hook
│
├── lib/
│   ├── duffel.ts                 # Duffel API client singleton
│   └── utils.ts                  # cn() utility for class merging
│
├── .env.example                  # Environment variable template
├── .env.local                    # Local environment variables (gitignored values)
├── components.json               # shadcn/ui configuration
├── metadata.json                 # AI Studio app metadata
├── next.config.ts                # Next.js configuration
├── package.json                  # Frontend dependencies
└── tsconfig.json                 # TypeScript configuration
```

---

## 5. Main Features

1. **AI Trip Planner Wizard** — Multi-step form (origin, destination, dates, travelers, cabin class, budget allocation, hotel preferences, transport options, trip vibes) that generates a full itinerary.
2. **AI-Generated Itineraries** — Gemini AI creates day-by-day activity plans with geocoded locations, descriptions, and time allocations.
3. **Real Flight Search** — Live flight results from SerpApi Google Flights with detailed segment info, layovers, amenities, carbon emissions, and pricing.
4. **Real Hotel Search** — Live hotel results from SerpApi Google Hotels with photos, reviews, amenities, GPS coordinates, and pricing.
5. **"Surprise Me" Discovery** — AI suggests 5 destinations based on preferences (region, climate, pace, interests, budget) with match scores.
6. **AI Cost Estimation** — Per-destination daily cost estimates (meals, transport, misc) via Gemini AI.
7. **Flight Booking** — Booking flow via Duffel API (offer creation → passenger details → order).
8. **User Authentication** — Email/password signup and login with JWT tokens.
9. **User Profile Management** — Edit personal info, travel documents, address, bio, preferences, avatar upload.
10. **Trip Management** — Save, view, update status, and delete trips.
11. **Reservation Management** — Create, view, and cancel reservations (flight/hotel/bus).
12. **Budget Upsell** — Option to increase budget and regenerate the plan with upgraded results.
13. **Dark/Light Theme Toggle** — System-aware theme with manual toggle.
14. **Responsive Design** — Mobile-optimized with slide-out navigation drawer.
15. **Airport Autocomplete** — Real-time airport suggestions via Duffel API.

---

## 6. User Roles

| Role | Description |
|---|---|
| **Guest** | Can use the AI trip planner, view results, search flights/hotels. Cannot save trips, reservations, or access profile. |
| **Authenticated User** | All guest features + save trips, manage reservations, manage profile, upload avatar. |

There is no admin role, no role-based permissions system, and no user management panel observed in the codebase.

---

## 7. Website Flow

1. **Landing** → Hero section with "Powered by AI" branding and headline "Plan Your Dream Trip".
2. **Mode Selection** → User picks "Build My Trip" (classic wizard) or "Surprise Me" (AI destination discovery).
3. **Classic Wizard Flow:**
   - Step-by-step form: origin → destination → dates → travelers → cabin class → budget → hotel preferences → transport options → trip vibes.
   - On submit → calls `/api/planner/generate` → displays results.
4. **Surprise Me Flow:**
   - User picks origin, dates, travelers, budget, region, climate, pace, interests.
   - AI suggests 5 destinations → user selects one → pre-fills the classic wizard → generates itinerary.
5. **Results** → Day-by-day itinerary with flights, hotels, activities, budget breakdown, map coordinates, upsell option.
6. **Auth** → Login/signup on `/auth` page → JWT stored in localStorage.
7. **Profile** → View/edit profile, upload avatar, change preferences on `/profile`.
8. **Trips** → View saved trips on `/trips`, plan new trips, delete trips.
9. **Reservations** → View booking history on `/reservations`, cancel reservations.

---

## 8. Pages and Frontend Routes

| Route | Page | Auth Required | Description |
|---|---|---|---|
| `/` | Home | No | Hero + trip planner wizard + results display |
| `/auth` | Auth | No | Login / signup tabbed form |
| `/profile` | Profile | Yes | Profile editing with avatar upload |
| `/trips` | My Trips | Yes | List of saved trips with delete |
| `/reservations` | Reservations | Yes | List of reservations with cancel |
| `/planner` | Planner Redirect | No | Redirects to `/` |

---

## 9. Backend/API Routes

### Next.js API Routes (Server-side, `/app/api/`)

| Method | Route | Description |
|---|---|---|
| POST | `/api/planner/generate` | **Core endpoint.** Generates full AI itinerary with real flights (SerpApi), hotels (SerpApi), geocoded activities (Gemini + LocationIQ/Nominatim), and budget breakdown. ~1828 lines. |
| POST | `/api/planner/surprise` | AI-powered destination discovery (Gemini → 5 suggestions with match scores). Groq fallback. |
| POST | `/api/planner/cost-estimates` | AI-powered daily cost estimates for a destination (Gemini). |
| POST | `/api/flights/search` | Flight search via Duffel API. |
| POST | `/api/flights/book` | Flight booking via Duffel API (create order). |
| GET  | `/api/airports/suggestions` | Airport autocomplete via Duffel suggestions API. |
| POST | `/api/buses/search` | Bus search — **returns mock/randomly generated data**. |

### Express Backend Routes (Port 5000, `/backend/`)

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | No | Register new user (email, password, first/last name). Creates profile row. |
| POST | `/api/auth/login` | No | Login with email + password. Returns JWT. |
| POST | `/api/auth/logout` | No | Stateless logout (returns OK). |
| GET  | `/api/auth/me` | Yes | Get current user + profile data. |
| GET  | `/api/profile` | Yes | Get user profile. |
| PUT  | `/api/profile` | Yes | Update profile fields. |
| POST | `/api/profile/avatar` | Yes | Upload avatar image (multer, 5MB limit). |
| GET  | `/api/trips` | Yes | List user's trips (newest first). |
| POST | `/api/trips` | Yes | Create a new trip. |
| GET  | `/api/trips/:id` | Yes | Get single trip (owner check). |
| PATCH| `/api/trips/:id` | Yes | Update trip status/notes/title. |
| DELETE| `/api/trips/:id` | Yes | Delete a trip (owner check). |
| GET  | `/api/reservations` | Yes | List user's reservations. |
| POST | `/api/reservations` | Yes | Create a reservation. |
| GET  | `/api/reservations/:id` | Yes | Get single reservation. |
| PUT  | `/api/reservations/:id/cancel` | Yes | Cancel a reservation. |
| GET  | `/health` | No | Health check endpoint. |

---

## 10. Data Models and Database

### SQL Server (Express Backend — `TravelEliteDB`)

**Users**
| Column | Type | Notes |
|---|---|---|
| id | UNIQUEIDENTIFIER (PK) | Auto-generated NEWID() |
| email | NVARCHAR(255) | Unique, not null |
| password_hash | NVARCHAR(255) | bcrypt hash (12 rounds) |
| password_plaintext | NVARCHAR(255) | **Stored in plaintext** (see Known Issues) |
| first_name | NVARCHAR(100) | |
| last_name | NVARCHAR(100) | |
| created_at | DATETIME2 | Default GETDATE() |
| updated_at | DATETIME2 | Default GETDATE() |

**Profiles** (1-to-1 with Users)
| Column | Type | Notes |
|---|---|---|
| id | UNIQUEIDENTIFIER (PK) | |
| user_id | UNIQUEIDENTIFIER (FK → Users, CASCADE) | Unique |
| phone, date_of_birth, nationality, passport_number | Various | Personal info |
| address, city, country | NVARCHAR | Address fields |
| bio | NVARCHAR(1000) | |
| avatar_url | NVARCHAR(500) | Path to uploaded file |
| preferred_currency | NVARCHAR(10) | Default 'USD' |
| preferred_language | NVARCHAR(10) | Default 'en' |
| notifications_enabled | BIT | Default 1 |

**Trips**
| Column | Type | Notes |
|---|---|---|
| id | UNIQUEIDENTIFIER (PK) | |
| user_id | UNIQUEIDENTIFIER (FK → Users, CASCADE) | |
| title | NVARCHAR(255) | Required |
| origin, destination | NVARCHAR(100) | Required |
| departure_date | DATE | Required |
| return_date | DATE | Nullable |
| passengers | INT | Default 1 |
| trip_type | NVARCHAR(50) | CHECK: flight, hotel, bus, bundle |
| status | NVARCHAR(50) | CHECK: planned, booked, completed, cancelled |
| notes | NVARCHAR(2000) | |
| offer_id, total_amount, currency | Various | Booking details |

**Reservations**
| Column | Type | Notes |
|---|---|---|
| id | UNIQUEIDENTIFIER (PK) | |
| user_id | UNIQUEIDENTIFIER (FK → Users, CASCADE) | |
| trip_id | UNIQUEIDENTIFIER (FK → Trips, nullable) | |
| reservation_type | NVARCHAR(50) | CHECK: flight, hotel, bus |
| provider, provider_booking_ref | NVARCHAR | |
| origin, destination | NVARCHAR(100) | |
| departure_datetime, arrival_datetime | DATETIME2 | |
| passengers | INT | Default 1 |
| total_amount | DECIMAL(10,2) | |
| currency | NVARCHAR(10) | Default 'USD' |
| cabin_class | NVARCHAR(50) | |
| status | NVARCHAR(50) | CHECK: confirmed, cancelled, pending |
| booking_details | NVARCHAR(MAX) | JSON string |

---

## 11. Authentication and Authorization

- **Method:** Custom JWT authentication (no third-party auth providers).
- **Token Storage:** JWT stored in `localStorage` as `travel_token`; user object stored as `travel_user`.
- **Token Payload:** `{ id, email, first_name, last_name }`, signed with `JWT_SECRET`.
- **Token Expiry:** Configurable via `JWT_EXPIRES_IN` (default: 7 days).
- **Password Hashing:** bcrypt with 12 salt rounds.
- **Middleware:** `backend/middleware/auth.js` — extracts Bearer token from `Authorization` header, verifies with `jwt.verify()`.
- **Frontend Auth:** `hooks/useAuth.tsx` — React Context (`AuthProvider`) wrapping entire app. Provides `login`, `signup`, `logout`, `user`, `isAuthenticated`, `token`.
- **Protected Routes:** Profile, Trips, Reservations pages redirect to `/auth` if not authenticated (client-side check via `useEffect`).
- **No server-side route protection** on Next.js pages (no middleware.ts). Protection is only on Express API endpoints.
- **No CSRF protection** observed.
- **No refresh token mechanism** — only single JWT.

---

## 12. Environment Variables

### Frontend (`.env.local` / `.env.example`)

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Google Gemini AI API key (primary) |
| `NEXT_PUBLIC_GEMINI_API_KEY` | Gemini API key exposed to client (used in some API routes) |
| `GEMINI_API_KEY_2` | Secondary Gemini API key (fallback) |
| `GROQ_API_KEY` | Groq API key (Llama 3.3 fallback for AI features) |
| `DUFFEL_ACCESS_TOKEN` | Duffel API token (flights, airport suggestions) |
| `SERPAPI_API_KEY` | SerpApi key (Google Flights, Hotels, Maps) |
| `APP_URL` | Application URL (for Cloud Run deployment) |
| `NEXT_PUBLIC_BACKEND_URL` | Express backend URL (default: `http://localhost:5000`) |
| `DISABLE_HMR` | Disable Hot Module Replacement in AI Studio |

### Backend (`backend/.env`)

| Variable | Purpose |
|---|---|
| `DB_SERVER` | SQL Server hostname |
| `DB_PORT` | SQL Server port (default: 1433) |
| `DB_NAME` | Database name (TravelEliteDB) |
| `DB_USER` | SQL Server username |
| `DB_PASSWORD` | SQL Server password |
| `DB_ENCRYPT` | SQL Server encryption setting |
| `DB_TRUST_SERVER_CERTIFICATE` | Trust self-signed certs |
| `JWT_SECRET` | Secret for signing JWT tokens |
| `JWT_EXPIRES_IN` | JWT expiration duration (default: 7d) |
| `CORS_ORIGIN` | Allowed CORS origin (default: `http://localhost:3000`) |
| `PORT` | Backend server port (default: 5000) |

---

## 13. External Services

| Service | Purpose | Client Library |
|---|---|---|
| **Google Gemini AI** | AI trip generation, cost estimates, surprise destinations | `@google/genai` |
| **Groq (Llama 3.3 70B)** | Fallback AI provider for surprise destinations | Direct HTTP API |
| **SerpApi** | Google Flights search, Google Hotels search, Google Maps geocoding | Direct HTTP API |
| **Duffel** | Flight search, flight booking, airport suggestions | `@duffel/api` |
| **LocationIQ** | Geocoding cities and places, nearby place search | Direct HTTP API |
| **Nominatim (OpenStreetMap)** | Fallback geocoding | Direct HTTP API |
| **Unsplash** | Hero background image | Direct URL |
| **Picsum Photos** | Placeholder images for hotels/buses | Direct URL |
| **i.pravatar.cc** | Unknown (configured in next.config images) | Direct URL |
| **ui-avatars.com** | Fallback avatar generation | Direct URL |
| **Kiwi Images** | Airline logo images | Direct URL |

---

## 14. Business Rules

1. **Budget Allocation** — When upselling, extra budget is distributed: 45% flights, 30% hotels, 10% transport, 15% daily expenses.
2. **Geocoding Distance Limit** — Activity/place geocoding rejects results >100km from destination center.
3. **Hotel Distance Limit** — Hotels rejected if >80km from destination.
4. **SerpApi Rate Limiting** — LocationIQ calls throttled to ≥500ms apart with automatic retry on 429 errors.
5. **Trip Status Lifecycle** — planned → booked → completed → cancelled (enforced by SQL CHECK constraint).
6. **Reservation Types** — flight, hotel, bus (enforced by SQL CHECK constraint).
7. **Password Requirements** — Minimum 6 characters (validated by express-validator on backend).
8. **Avatar Uploads** — Max 5MB, allowed formats: jpeg, jpg, png, gif, webp.
9. **Body Size Limit** — Express backend limits JSON body to 10MB.
10. **Round-Trip Flight Resolution** — For round trips, the system fetches outbound results, selects best offer per carrier, then uses departure tokens to fetch return legs.
11. **AI Fallback Chain** — Surprise Me: Gemini primary key → Gemini secondary key → Groq. Each with 2s delay between attempts.
12. **Cost Estimate Fallback** — If Gemini fails, returns hardcoded defaults (meals: $50, transport: $20, misc: $15, etc.) with `isEstimate: true`.

---

## 15. Current Implementation Status

### Complete / Functional
- ✅ AI trip planner wizard (multi-step form, all steps)
- ✅ AI itinerary generation via Gemini + SerpApi flights/hotels
- ✅ "Surprise Me" AI destination discovery
- ✅ AI cost estimation per destination
- ✅ User authentication (signup, login, logout, JWT)
- ✅ User profile management + avatar upload
- ✅ Trip CRUD (create, read, update status, delete)
- ✅ Reservation CRUD (create, read, cancel)
- ✅ Dark/light theme toggle
- ✅ Responsive mobile navigation
- ✅ Airport autocomplete (Duffel)
- ✅ SQL Server schema + init script
- ✅ Database migration script (full_name → first/last name)

### Partial / Needs Work
- ⚠️ Bus search — returns **mock/random data**, not real API results
- ⚠️ Duffel flight search/booking — implemented but may be secondary to SerpApi in the planner flow
- ⚠️ `/planner` route — just redirects to `/`, effectively unused

### Missing / Not Implemented
- ❌ No test suite (no test files, no test scripts in package.json)
- ❌ No Next.js middleware for server-side auth protection
- ❌ No payment processing integration
- ❌ No email verification
- ❌ No password reset flow
- ❌ No admin panel
- ❌ No search history or recent searches

---

## 16. Known Issues, TODOs, and Risks

1. **CRITICAL — Plaintext Password Storage:** The signup route stores `password_plaintext` alongside the bcrypt hash in the `Users` table (`auth.js` line 50-53). This is a serious security vulnerability.
2. **Security — No CSRF Protection:** No CSRF tokens observed on any form or API call.
3. **Security — JWT in localStorage:** Tokens stored in `localStorage` are vulnerable to XSS attacks. HttpOnly cookies would be more secure.
4. **Security — LocationIQ API Key Hardcoded:** The LocationIQ key is hardcoded directly in the planner generate route (line 6 of `planner/generate/route.ts`) rather than being in an environment variable.
5. **Architecture — Database Systems:** The project uses SQL Server (Express backend).
6. **Architecture — Flight/Hotel APIs:** SerpApi is configured. The planner primarily uses SerpApi.
7. **Mock Data — Bus Search:** `/api/buses/search` returns randomly generated fake data, not real bus API results.
8. **README has Git Merge Conflict:** The `README.md` contains unresolved merge conflict markers (`<<<<<<< HEAD` / `>>>>>>> f2da9670`).
9. **No TODO/FIXME Comments:** No TODO or FIXME comments found in the codebase.
10. **Large Component Files:** `TripPlannerWizard.tsx` (~60KB) and `TripPlannerResults.tsx` (~55KB) are very large and may be difficult to maintain. Consider splitting.
11. **Planner Generate Route is Massive:** `planner/generate/route.ts` is ~1828 lines — contains flight normalization, hotel normalization, geocoding, AI prompting, and response assembly all in one file.
12. **Client-Side Only Auth Guards:** Protected pages use `useEffect` redirects, so a flash of authenticated content may appear before redirect.
13. **ESLint Ignored During Build:** `ignoreDuringBuilds: true` in `next.config.ts` means lint errors won't block production builds.
14. **Missing Error Boundary:** No React Error Boundary component observed.
15. **TypeScript `any` Usage:** Frequent use of `any` types, especially in API handlers and component props.

---

## 17. Setup and Run Commands

### Frontend (Next.js)

```bash
# Install dependencies
npm install

# Run development server (port 3000)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint
npm run lint

# Clean .next cache
npm run clean
```

### Backend (Express)

```bash
# Navigate to backend
cd backend

# Install dependencies
npm install

# Initialize database (creates TravelEliteDB + tables)
npm run init-db

# Run development server with nodemon (port 5000)
npm run dev

# Run production server
npm start
```

### Database

```bash
# Initialize SQL Server database
cd backend && node db/initDb.js

# Run name migration (if upgrading from full_name to first/last name)
cd backend && node db/migrate_names.js

```

### Prerequisites
- Node.js
- Microsoft SQL Server (e.g., SQL Server Express on Windows)
- API keys for: Gemini, SerpApi, Duffel, LocationIQ (see Section 12)

---

## 18. Testing and Verification

There is **no test suite** in this project. Future agents should verify changes by:

1. **Manual Testing:**
   - Start both frontend (`npm run dev`) and backend (`cd backend && npm run dev`).
   - Test the AI planner wizard end-to-end.
   - Test auth flow: signup → login → profile → logout.
   - Test trips: create, view, delete.
   - Test reservations: create, view, cancel.
   - Test dark/light mode toggle.
   - Test mobile responsive layout.

2. **Build Verification:**
   - Run `npm run build` to ensure no TypeScript or build errors.
   - Note: ESLint errors are ignored during build.

3. **API Verification:**
   - Test API routes individually (e.g., using curl or a REST client).
   - Check console logs — the planner route logs extensively.

---

## 19. Coding Patterns and Conventions

### Component Patterns
- All pages use `'use client'` directive (client-side rendering).
- Pages handle their own data fetching via `useEffect` and `fetch`.
- Auth-protected pages redirect via `useEffect` checking `isAuthenticated`.
- Motion/Framer Motion used extensively for page transitions and micro-animations.
- All icons from `lucide-react`.

### Styling Conventions
- Tailwind CSS utility classes throughout.
- CSS variables defined in `globals.css` using oklch color space.
- Custom utility classes: `.title-text` (Playfair Display font), `.small-caps` (uppercase, tracked, 11px), `.glass-card`, `.btn-primary`, `.btn-secondary`, `.nav-pill`.
- Fonts: Geist (sans), Playfair Display (display/headings) — loaded via `next/font/google`.
- Dark mode via `.dark` class on `<html>`.

### API Patterns
- Next.js API routes use `NextResponse.json()` for responses.
- Express routes use `express-validator` for input validation.
- Express uses parameterized queries with named parameters (`@param`).
- All Express routes include error handling with console.error logging.

### State Management
- React Context for auth (`AuthProvider` in `hooks/useAuth.tsx`).
- Component-local state via `useState` for all other state.
- No global state library (no Redux, Zustand, etc.).

### File Organization
- Path aliases: `@/components`, `@/lib`, `@/hooks` (configured in tsconfig).
- Backend uses CommonJS (`require`/`module.exports`).
- Frontend uses ESM (`import`/`export`).

### Naming Conventions
- React components: PascalCase filenames and exports.
- API routes: kebab-case directories, `route.ts` file.
- Database columns: snake_case.
- TypeScript interfaces: PascalCase.
- CSS classes: kebab-case custom utilities, Tailwind for everything else.

---

## 20. Instructions for Future AI Assistants

### Important Files to Inspect First
1. `app/page.tsx` — Homepage and main user entry point.
2. `app/api/planner/generate/route.ts` — Core AI planner logic (~1828 lines). Understand this before modifying the planner.
3. `hooks/useAuth.tsx` — Auth context, understand before touching any auth-related feature.
4. `backend/server.js` — Express backend entry, shows all registered routes.
5. `backend/db/init.sql` — Complete SQL Server schema.
6. `app/globals.css` — Design tokens and custom utility classes.
7. `app/layout.tsx` — Root layout, font setup, providers.

### Files/Areas to Avoid Changing Without Permission
- `backend/db/init.sql` — Schema changes affect the entire data layer.
- `hooks/useAuth.tsx` — Auth changes affect every authenticated feature.
- `app/layout.tsx` — Root layout changes affect every page.
- `.env.example` / `.env.local` — May contain deployment-specific values.
- `package.json` / `package-lock.json` — Dependency changes can break builds.

### How to Safely Add Features
1. Understand the dual-architecture: Next.js API routes for AI/search, Express backend for user data (auth, profile, trips, reservations).
2. For new user-data features → add Express route + SQL Server table.
3. For new AI/search features → add Next.js API route in `app/api/`.
4. For new pages → add directory under `app/` with `page.tsx`. Add nav link in `components/Navbar.tsx`.
5. Follow existing patterns: use `useAuth()` for auth, `BACKEND_URL` for Express calls, `fetch('/api/...')` for Next.js API calls.
6. Use existing design tokens (CSS variables) and Tailwind classes. Prefer `.title-text`, `.small-caps` for typography consistency.

### How to Verify Work
1. Run `npm run build` — check for TypeScript errors.
2. Start both servers and test the UI manually.
3. Check browser console for errors.
4. Check terminal console for backend errors and planner logs.

### Project-Specific Warnings
- ⚠️ The planner `generate` route is ~1828 lines. Do NOT try to rewrite it entirely — make surgical, targeted edits.
- ⚠️ `TripPlannerWizard.tsx` and `TripPlannerResults.tsx` are extremely large. Read carefully before editing.
- ⚠️ SerpApi is present for flights/hotels. The planner primarily uses SerpApi.
- ⚠️ The bus search returns fake data — do not assume it's connected to a real API.
- ⚠️ The LocationIQ API key is hardcoded in `planner/generate/route.ts` line 6.
- ⚠️ Never log, commit, or expose values from `.env.local` or `backend/.env`.

---

## 21. Assumptions and Unknowns

### Assumptions (Needs Confirmation)
- The project appears to be a university Final Year Project (FYP) based on the directory name and README reference to "ENGR498-Seminar".
- SQL Server is the database.
- The project was initially scaffolded using Google AI Studio (based on `metadata.json` and README).

### Unknowns
- **Deployment target:** The exact current deployment platform is unknown. The README mentions AI Studio / Cloud Run, but the backend uses SQL Server which is uncommon in Cloud Run.
- **Database hosting:** Where the SQL Server instance is hosted (appears to be local: `DESKTOP-QOH5V7E\SQLEXPRESS`).
- **SerpApi quota/limits:** What plan or quota is available for SerpApi calls.
- **Payment processing:** Whether payment integration is planned or out of scope.
- **Test strategy:** Whether automated tests are planned.
- **The `password_plaintext` column:** Whether this was intentional for debugging or is a security oversight that should be removed.
- **Multiple Gemini keys:** Why there are two Gemini API keys (primary + secondary). Could be for rate limit avoidance.
