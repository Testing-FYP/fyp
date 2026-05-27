# Project Dead Code & Resource Audit

This document presents a comprehensive audit of all files, npm packages, components, hooks, API routes, and environment variables in the project. 

Every entry is categorized as either:
*   **✅ ACTIVE** (actively imported, fetched, or executed in active runtime flows)
*   **⚠️ UTILITY** (manually executed script or static dev asset)
*   **☠️ DEAD** (exists in the codebase but has zero active runtime invocations or dependencies)

---

## List 1 — Actually Used and Running (✅ ACTIVE & ⚠️ UTILITY)

### 1. npm Packages (Root package.json)

| Package Name | Category | Importing/Calling Modules | One-line Description |
| :--- | :--- | :--- | :--- |
| **`@google/genai`** | ✅ ACTIVE | `app/api/planner/surprise/route.ts`, `app/api/planner/generate/route.ts`, `app/api/planner/cost-estimates/route.ts` | Official client SDK for Google Gemini models and structured generation APIs. |
| **`@duffel/api`** | ✅ ACTIVE | `lib/duffel.ts` | Node client library to interact with the Duffel travel API. |
| **`class-variance-authority`** | ✅ ACTIVE | `components/ui/button.tsx` | Utility to create type-safe, variant-driven UI components. |
| **`clsx`** | ✅ ACTIVE | `lib/utils.ts` | Tiny utility for constructing conditional `className` strings. |
| **`lucide-react`** | ✅ ACTIVE | `components/Navbar.tsx`, `components/TripPlannerWizard.tsx`, `components/TripPlannerResults.tsx`, `components/SurpriseMeDiscovery.tsx`, `app/page.tsx`, etc. | Modern React icon library matching clean visual aesthetics. |
| **`motion`** | ✅ ACTIVE | `components/TripPlannerWizard.tsx`, `components/TripPlannerResults.tsx`, `components/ThemeToggle.tsx`, etc. | Modern library for creating smooth page/component micro-animations. |
| **`next`** | ✅ ACTIVE | Project core build tool and scripts | Production framework for server-rendered React applications. |
| **`postcss`** | ✅ ACTIVE | `postcss.config.mjs` | Tool for transforming CSS styles using Javascript plugins. |
| **`radix-ui`** | ✅ ACTIVE | `components/ui/button.tsx` | Unstyled headless primitives for building accessible React components. |
| **`react`** | ✅ ACTIVE | Project-wide | Core framework library for building interactive user interfaces. |
| **`react-day-picker`** | ✅ ACTIVE | `components/ui/calendar.tsx`, `components/TripPlannerWizard.tsx` | Customizable calendar and date selection picker module. |
| **`react-dom`** | ✅ ACTIVE | Project-wide | Entry point of DOM-related rendering methods for React. |
| **`tailwind-merge`** | ✅ ACTIVE | `lib/utils.ts` | Utility to merge Tailwind classes without style conflicts. |
| **`@tailwindcss/postcss`** | ✅ ACTIVE | `postcss.config.mjs` | Official Tailwind CSS integration for PostCSS environments. |
| **`@types/node`** | ✅ ACTIVE | TS Compiler / IDE Config | TypeScript type definitions for standard Node.js APIs. |
| **`@types/react`** | ✅ ACTIVE | TS Compiler / IDE Config | TypeScript type definitions for React. |
| **`@types/react-dom`** | ✅ ACTIVE | TS Compiler / IDE Config | TypeScript type definitions for React DOM. |
| **`eslint`** | ✅ ACTIVE | Linting scripts (`npm run lint`) | Pluggable static code analyzer for identifying runtime/syntax issues. |
| **`eslint-config-next`** | ✅ ACTIVE | `eslint.config.mjs` | Next.js best-practices rule configuration for ESLint. |
| **`tailwindcss`** | ✅ ACTIVE | `app/globals.css`, build system | Utility-first CSS framework used for frontend styling. |
| **`tw-animate-css`** | ✅ ACTIVE | `app/globals.css` | Animation library imported directly inside the global CSS sheet. |
| **`typescript`** | ✅ ACTIVE | Compiler scripts | Typed superset of JavaScript compiling down to plain JS. |

---

### 2. Files in `lib/`, `hooks/`, `components/`

| File Path | Category | Importing/Calling Modules | One-line Description |
| :--- | :--- | :--- | :--- |
| **`lib/duffel.ts`** | ✅ ACTIVE | `app/api/flights/search/route.ts` (dead), `app/api/flights/book/route.ts` (dead), `app/api/airports/suggestions/route.ts` (active) | Configures and instantiates the Duffel client SDK with access tokens. |
| **`lib/utils.ts`** | ✅ ACTIVE | `components/ui/button.tsx`, `components/ui/calendar.tsx`, `app/layout.tsx` | Core styling helper combining `clsx` and `tailwind-merge`. |
| **`hooks/useAuth.tsx`** | ✅ ACTIVE | `components/Navbar.tsx`, `app/trips/page.tsx`, `app/reservations/page.tsx`, `app/profile/page.tsx`, `app/layout.tsx`, `app/auth/page.tsx` | Custom authentication state context and provider linking to backend. |
| **`components/Navbar.tsx`** | ✅ ACTIVE | `app/layout.tsx` | Main navigation header component offering user-state management. |
| **`components/ThemeToggle.tsx`** | ✅ ACTIVE | `app/layout.tsx` | Dark and light mode toggle using dynamic icons. |
| **`components/TripPlannerWizard.tsx`** | ✅ ACTIVE | `app/page.tsx` | Elegant multi-step form wizard defining itinerary preferences. |
| **`components/TripPlannerResults.tsx`** | ✅ ACTIVE | `app/page.tsx` | Premium container visualising hotel and flight schedules side-by-side. |
| **`components/SurpriseMeDiscovery.tsx`** | ✅ ACTIVE | `app/page.tsx` | Unique gamified AI vacation discovery module. |
| **`components/AirportAutocomplete.tsx`** | ✅ ACTIVE | `components/TripPlannerWizard.tsx`, `components/SurpriseMeDiscovery.tsx`, `components/FlightSearch.tsx` (dead) | Dynamic dropdown matching query input against airport databases. |
| **`components/ui/button.tsx`** | ✅ ACTIVE | `components/ui/calendar.tsx`, `components/SurpriseMeDiscovery.tsx`, `components/Navbar.tsx`, etc. | Reusable styled interactive button element. |
| **`components/ui/calendar.tsx`** | ✅ ACTIVE | `components/TripPlannerWizard.tsx` | Prebuilt date picker popover matching the global theme. |

---

### 3. API Route Files under `app/api/`

| File Path | Category | Fetching/Calling Frontend Files | One-line Description |
| :--- | :--- | :--- | :--- |
| **`app/api/airports/suggestions/route.ts`** | ✅ ACTIVE | `components/AirportAutocomplete.tsx` | Fetches dynamic airport recommendations from Duffel. |
| **`app/api/planner/cost-estimates/route.ts`** | ✅ ACTIVE | `components/TripPlannerWizard.tsx` | Estimates total vacation budget profiles using Gemini structured output. |
| **`app/api/planner/generate/route.ts`** | ✅ ACTIVE | `app/page.tsx` | Formulates full multi-day travel itineraries via Gemini APIs. |
| **`app/api/planner/surprise/route.ts`** | ✅ ACTIVE | `components/SurpriseMeDiscovery.tsx` | Recommends random, highly-curated travel destinations based on user mood. |
| **`app/api/google-api/google-flights.ts`** | ✅ ACTIVE | `app/api/planner/generate/route.ts` | Helper calling SerpApi Google Flights API for airline ticket offers. |
| **`app/api/google-api/google-hotels.ts`** | ✅ ACTIVE | `app/api/planner/generate/route.ts` | Helper calling SerpApi Google Hotels API for nearby accommodation availability. |

---

### 4. Environment Variables

| Variable Name | Category | Referenced In | One-line Description |
| :--- | :--- | :--- | :--- |
| **`GEMINI_API_KEY`** | ✅ ACTIVE | `app/api/planner/surprise/route.ts`, `app/api/planner/generate/route.ts` | Access token for the core Gemini model execution pipelines. |
| **`NEXT_PUBLIC_GEMINI_API_KEY`** | ✅ ACTIVE | `app/api/planner/surprise/route.ts`, `app/api/planner/generate/route.ts`, `app/api/planner/cost-estimates/route.ts` | Browser-accessible access token fallback for runtime AI executions. |
| **`GEMINI_API_KEY_2`** | ✅ ACTIVE | `app/api/planner/surprise/route.ts`, `app/api/planner/generate/route.ts` | Backup Google Gemini access key used to bypass request rate-limits. |
| **`DUFFEL_ACCESS_TOKEN`** | ✅ ACTIVE | `lib/duffel.ts` | Access token allowing flight queries through Duffel API. |
| **`SERPAPI_API_KEY`** | ✅ ACTIVE | `app/api/planner/generate/route.ts`, `app/api/google-api/google-hotels.ts`, `app/api/google-api/google-flights.ts` | Token enabling real-time flight and hotel aggregations from Google Search. |
| **`GROQ_API_KEY`** | ✅ ACTIVE | `app/api/planner/surprise/route.ts`, `app/api/planner/generate/route.ts` | Token enabling Llama/Mixtral model responses for faster processing. |
| **`NEXT_PUBLIC_BACKEND_URL`** | ✅ ACTIVE | `hooks/useAuth.tsx` | Global environment string locating the Node/Express backend endpoints. |
| **`DB_SERVER`** | ✅ ACTIVE | `backend/db/connection.js`, `backend/db/initDb.js` | IP address or local server host running the MS SQL database. |
| **`DB_PORT`** | ✅ ACTIVE | `backend/db/connection.js`, `backend/db/initDb.js` | Connection port listening to SQL Server requests (Default: `1433`). |
| **`DB_NAME`** | ✅ ACTIVE | `backend/db/connection.js`, `backend/db/initDb.js` | Targeted database name containing application structures (`TravelEliteDB`). |
| **`DB_USER`** | ✅ ACTIVE | `backend/db/connection.js`, `backend/db/initDb.js` | Authorized SQL Server username used to initialize and write schema tables. |
| **`DB_PASSWORD`** | ✅ ACTIVE | `backend/db/connection.js`, `backend/db/initDb.js` | Encrypted string confirming database credential access. |
| **`DB_ENCRYPT`** | ✅ ACTIVE | `backend/db/connection.js`, `backend/db/initDb.js` | Controls connection encryption security settings for remote hosts. |
| **`DB_TRUST_SERVER_CERTIFICATE`** | ✅ ACTIVE | `backend/db/connection.js`, `backend/db/initDb.js` | Allows bypassing secure local SSL database verification certificates. |
| **`JWT_SECRET`** | ✅ ACTIVE | `backend/middleware/auth.js`, `backend/routes/auth.js` | Private hash key used for signing JWT tokens. |
| **`JWT_EXPIRES_IN`** | ✅ ACTIVE | `backend/routes/auth.js` | Lifespan configuration for validated JWT authorization cookies. |
| **`CORS_ORIGIN`** | ✅ ACTIVE | `backend/server.js` | Strict validation string pointing to authorized client UI addresses. |

---

### 5. Backend Files under `backend/`

| File Path | Category | Importing/Calling Modules | One-line Description |
| :--- | :--- | :--- | :--- |
| **`backend/server.js`** | ✅ ACTIVE | Process Entry Point | Main node runner managing backend configurations and routing schemas. |
| **`backend/package.json`** | ✅ ACTIVE | Process Runner | Defines startup parameters, configuration details and required packages. |
| **`backend/.env`** | ✅ ACTIVE | `backend/server.js`, `backend/db/connection.js` | Local backend secrets configuration file for database/JWT keys. |
| **`backend/db/connection.js`** | ✅ ACTIVE | `backend/routes/*.js`, `backend/db/migrate_names.js` | Connects, runs queries, and maintains state pools with SQL Server. |
| **`backend/db/init.sql`** | ✅ ACTIVE | `backend/db/initDb.js` | Plain-text definitions containing structural setup scripts for DB tables. |
| **`backend/db/initDb.js`** | ⚠️ UTILITY | `backend/package.json` (`npm run init-db`) | Manual installer script creating database and loading baseline tables. |
| **`backend/db/migrate_names.js`** | ⚠️ UTILITY | Run manually | Migration script dividing full names and upgrading table entries. |
| **`backend/middleware/auth.js`** | ✅ ACTIVE | `backend/routes/profile.js`, `backend/routes/reservations.js`, `backend/routes/trips.js` | Intermediate logic evaluating token compliance against headers. |
| **`backend/routes/auth.js`** | ✅ ACTIVE | `backend/server.js` | Logic routing paths for user registration and authentication states. |
| **`backend/routes/profile.js`** | ✅ ACTIVE | `backend/server.js` | Logic enabling user profile query configurations and avatar updates. |
| **`backend/routes/reservations.js`** | ✅ ACTIVE | `backend/server.js` | Encapsulates all transactional routes for booking reservations. |
| **`backend/routes/trips.js`** | ✅ ACTIVE | `backend/server.js` | Encompasses all standard operations for reading/modifying trips. |

---

## List 2 — Dead Code (exists but never actually called) (☠️ DEAD)

### 1. npm Packages (Root package.json & Backend package.json)

| File / Package Name | Why it is Dead | Evidence / Verification Method |
| :--- | :--- | :--- |
| **`@hookform/resolvers`** | Included in package.json dependencies but never imported. | `grep -r "@hookform/resolvers"` returns zero imports. React Hook Form is not used in the wizard/planner. |
| **`@prisma/client`** | Legacy or unintegrated ORM client. Only import is in the dead itinerary save route which is itself never called and non-functional. | `grep -r "@prisma/client"` only lists the dead `app/api/itinerary/save/route.ts` file. No active codebase usage. |
| **`amadeus`** | Amadeus API integration package. Only referenced inside a dead search API route which is never called. | `grep -r "amadeus"` hits are confined to `app/api/hotels/search/route.ts` which has zero fetch/axios hits. |
| **`autoprefixer`** | PostCSS autoplugin package. The tailwind build system uses the new `@tailwindcss/postcss` plugin which replaces it completely. | `grep -r "autoprefixer"` across configurations and modules returns zero active usage. |
| **`d3`** | Premium chart rendering package, included in package.json but never actually imported or used. | `grep -r "from 'd3'"` / `grep -r 'from "d3"'` returns zero hits across all active modules. |
| **`date-fns`** | Helper library for manipulating dates. Only imported by dead/unreferenced components (`FlightCard.tsx` and `BookingModal.tsx`). | `grep -r "date-fns"` lists only dead components `FlightCard.tsx` and `BookingModal.tsx`. |
| **`recharts`** | Chart framework included in the package.json. No visuals, widgets, or statistical diagrams exist to require it. | `grep -r "recharts"` returns zero imports. |
| **`shadcn`** | Configuration utility for component libraries. Never imported or utilized at build or runtime. | `grep -r "shadcn"` returns zero imports. |
| **`@tailwindcss/typography`** | Tailwind prose styling plugin. Never loaded, imported, or configured in the tailwind setup. | `grep -r "@tailwindcss/typography"` returns zero active imports or config entries. |
| **`firebase-tools`** | CLI library for deploying apps to Firebase. The app is designed for local hosting or generic Next.js containers. | `grep -r "firebase"` returns zero imports or scripts in the active codebase. |
| **`prisma`** | DevDependency for database migrations. No prisma schema file (`schema.prisma`), server setup, or DB configuration folders exist in the project root. | `grep -r "prisma"` returns no schema configurations. The folder `c:\Users\hussa\OneDrive\Desktop\fyp\prisma` does not exist. |
| **`uuid`** *(Backend)* | Package for generating unique IDs included in `backend/package.json`. The backend handles IDs via database identity columns. | `grep -r "uuid"` across all `.js` files in `backend/` returns zero imports or calls. |

---

### 2. Files in `lib/`, `hooks/`, `components/`

| File / Component Name | Why it is Dead | Evidence / Verification Method |
| :--- | :--- | :--- |
| **`lib/prisma.ts`** | *Missing Reference File.* Imported by the dead `/api/itinerary/save` route, but this file does not exist on disk, which would crash the endpoint if it were ever hit. | Attempting to locate the file on disk shows it does not exist under `lib/`. `grep -r "@/lib/prisma"` only returned hits inside the uncalled `app/api/itinerary/save/route.ts` file. |
| **`hooks/use-mobile.ts`** | Custom window listener hook. No mobile menu drawer or layout queries reference it. | `grep -r "useMobile"` / `grep -r "use-mobile"` returns zero import hits. |
| **`components/FlightCard.tsx`** | Standalone premium card component. *Note:* A separate inline `FlightCard` component is defined directly inside `TripPlannerResults.tsx` and used there instead. This standalone file is completely unreferenced. | `grep -r "from '@/components/FlightCard'"` returns zero hits. The only files importing it were itself and a dead `BookingModal.tsx` file. |
| **`components/HotelCard.tsx`** | Standalone premium hotel offer component. *Note:* A separate inline `HotelCard` component is defined directly inside `TripPlannerResults.tsx` and used there instead. | `grep -r "from '@/components/HotelCard'"` returns zero hits. |
| **`components/BusCard.tsx`** | Standalone bus schedule card component. Designed for bus offer results but never integrated or displayed in the wizard or page layouts. | `grep -r "from '@/components/BusCard'"` returns zero hits. |
| **`components/FlightSearch.tsx`** | Fully functional travel search interface. Never imported or rendered by any page or layout. | `grep -r "from '@/components/FlightSearch'"` returns zero hits. |
| **`components/BookingModal.tsx`** | Heavy interactive checkout modal. Only imported by the unreferenced standalone `FlightCard.tsx`. | `grep -r "BookingModal"` returns zero active imports except inside the dead `FlightCard.tsx` file. |
| **`components/AIRecommendation.tsx`** | Interactive premium AI-powered budget indicator widget. Completely unreferenced in pages or wizard files. | `grep -r "AIRecommendation"` yields zero import hits. |

---

### 3. API Route Files under `app/api/`

| File Path / Route Name | Why it is Dead | Evidence / Verification Method |
| :--- | :--- | :--- |
| **`app/api/buses/search/route.ts`** | Intended to allow bus route search. No frontend buttons, search forms, or hooks trigger or reference this endpoint. | `grep -r "/api/buses/search"` returns zero hits project-wide. |
| **`app/api/flights/book/route.ts`** | Intended to initiate a flight booking transaction. No active frontend hooks or components trigger it. | `grep -r "/api/flights/book"` returns zero hits project-wide. |
| **`app/api/flights/search/route.ts`** | Intended to search airline options. Frontend search flows use local state and SerpApi pipelines within the planner generator route instead. | `grep -r "/api/flights/search"` returns zero hits project-wide. |
| **`app/api/hotels/search/route.ts`** | Intended to lookup hotels via Amadeus API. Never triggered by any active component or controller. | `grep -r "/api/hotels/search"` returns zero hits project-wide. |
| **`app/api/itinerary/save/route.ts`** | Intended to write planned itineraries to a Prisma database. It is broken (attempts to import a non-existent `lib/prisma.ts` module) and is never called. | `grep -r "/api/itinerary/save"` returns zero hits project-wide. |

---

### 4. Environment Variables

| Variable Name | Why it is Dead | Evidence / Verification Method |
| :--- | :--- | :--- |
| **`AMADEUS_CLIENT_ID`** | Used for local authentications against the Amadeus API client. Since the only Amadeus endpoint is dead, this is never requested at runtime. | Confined to the dead `app/api/hotels/search/route.ts` file. Missing entirely from local `.env.local` configuration. |
| **`AMADEUS_CLIENT_SECRET`** | Private credential paired with client ID for Amadeus authorization. Unused due to dead hotel lookup route. | Confined to the dead `app/api/hotels/search/route.ts` file. Missing entirely from local `.env.local` configuration. |
| **`DATABASE_URL`** | SQL Server Prisma connection URL defined in `.env.example`. Unused because the Prisma engine has no schema, database, or active connection pathways. | Confined to the dead `/api/itinerary/save` route. Missing entirely from local `.env.local` configuration. |
| **`APP_URL`** | Holds the self-referential deploy link. Zero code integrations retrieve this environment variable. | `grep -r "APP_URL"` returns zero hits across the codebase. |
| **`RAPIDAPI_KEY`** | API key defined inside `.env.local`. No weather, local flight, or transit wrappers query this key. | `grep -r "RAPIDAPI_KEY"` returns zero hits in typescript or JS files. |

---

### 5. Backend Files under `backend/`

All backend files in this project are actively integrated and configured under `backend/server.js`.
*   **`backend/db/initDb.js`** and **`backend/db/migrate_names.js`** do not run automatically during active server queries, but they are critical manuals defined in `backend/package.json` to setup, migrate, and establish the server's relational database structure. Hence, they are categorized as **⚠️ UTILITY** rather than dead.
*   **No backend routes or middleware are dead**, as they are all registered in `backend/server.js` (`app.use('/api/auth', authRoutes)`, etc.) and called by the frontend's authentication hook `hooks/useAuth.tsx` or active page scripts.

---

## Audit Summary Table

| Category | ✅ ACTIVE | ⚠️ UTILITY | ☠️ DEAD | Total | % Dead |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **npm Packages** | 22 | 0 | 12 | **34** | **35.3%** |
| **Files in `lib/`, `hooks/`, `components/`** | 11 | 0 | 8 | **19** | **42.1%** |
| **API Route Files** | 6 | 0 | 5 | **11** | **45.5%** |
| **Environment Variables** | 17 | 0 | 5 | **22** | **22.7%** |
| **Backend Files** | 10 | 2 | 0 | **12** | **0.0%** |
| **Total Project Assets** | **66** | **2** | **30** | **98** | **30.6%** |
