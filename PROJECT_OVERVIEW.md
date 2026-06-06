# Project Overview

## What this project is
Travel Elite is a travel planning and booking app. The main experience helps a user:

1. Find an airport and destination
2. Build a trip with dates, travelers, budget, and travel style
3. Generate an AI-assisted itinerary with flights, hotels, transport, and places to visit
4. Save trips and reservations after signing in
5. Manage profile details, avatar uploads, saved trips, and bookings

The project is split into a Next.js frontend and a Node/Express backend, with several internal API routes that call third-party travel and AI services.

## Internal API inventory

Legend:
- **Used** = directly called by the current UI or another in-repo API route
- **Not used** = defined in the codebase, but I found no in-repo caller

| API | Type | State | Where it is used | Purpose |
| --- | --- | --- | --- | --- |
| `POST /api/planner/generate` | Next route | Used | `app/page.tsx` | Main trip-plan generator that returns flights, hotels, transport, places, budget breakdown, and upsell options |
| `POST /api/planner/surprise` | Next route | Used | `components/SurpriseMeDiscovery.tsx` | Generates surprise destination suggestions based on budget, region, climate, pace, and interests |
| `POST /api/planner/budget-estimates` | Next route | Used | `components/TripPlannerWizard.tsx` | Auto-allocates live budget estimates for flights, hotel, transport, and daily place visits |
| `POST /api/planner/transport` | Next route | Used | `app/api/planner/budget-estimates/route.ts` | Returns transport mode pricing that budget estimates consume |
| `GET /api/geocoded/cities` | Next route | Used | `components/TripPlannerWizard.tsx` | Loads state and city options for the destination country |
| `GET /api/airports/suggestions` | Next route | Used | `components/AirportAutocomplete.tsx` | Airport autocomplete for origin and destination fields |
| `POST /api/auth/signup` | Backend route | Used | `hooks/useAuth.tsx`, `app/auth/page.tsx` | Creates a user account and returns a JWT |
| `POST /api/auth/login` | Backend route | Used | `hooks/useAuth.tsx`, `app/auth/page.tsx` | Authenticates a user and returns a JWT |
| `POST /api/auth/logout` | Backend route | Not used | No caller found | Stateless logout endpoint; frontend clears local auth itself |
| `GET /api/auth/me` | Backend route | Not used | No caller found | Returns the current user and profile |
| `GET /api/profile` | Backend route | Used | `app/profile/page.tsx` | Loads the current user profile |
| `PUT /api/profile` | Backend route | Used | `app/profile/page.tsx` | Saves profile edits |
| `POST /api/profile/avatar` | Backend route | Used | `app/profile/page.tsx` | Uploads a new avatar image |
| `GET /api/trips` | Backend route | Used | `app/trips/page.tsx`, `components/FlightCard.tsx` | Lists saved trips |
| `POST /api/trips` | Backend route | Used | `components/FlightCard.tsx` | Saves a selected flight as a trip |
| `GET /api/trips/:id` | Backend route | Not used | No caller found | Returns a single trip |
| `PATCH /api/trips/:id` | Backend route | Not used | No caller found | Updates trip status, title, or notes |
| `DELETE /api/trips/:id` | Backend route | Used | `app/trips/page.tsx` | Deletes a saved trip |
| `GET /api/reservations` | Backend route | Used | `app/reservations/page.tsx` | Lists user reservations |
| `POST /api/reservations` | Backend route | Used | `components/BookingModal.tsx` | Creates a reservation after booking |
| `GET /api/reservations/:id` | Backend route | Not used | No caller found | Returns a single reservation |
| `PUT /api/reservations/:id/cancel` | Backend route | Used | `app/reservations/page.tsx` | Cancels a reservation |

## External services used

| Service | Used in | Purpose |
| --- | --- | --- |
| Google Gemini / `@google/genai` | `app/api/planner/*`, `app/api/planner/surprise/route.ts`, `app/api/planner/transport/route.ts` | Generates trip content, destination suggestions, and transport data |
| Groq chat completions | `app/api/planner/generate/route.ts`, `app/api/planner/surprise/route.ts`, `app/api/planner/transport/route.ts` | Fallback AI provider when Gemini is unavailable |
| SerpApi Google Flights | `app/api/google-api/google-flights.ts`, `app/api/planner/generate/route.ts`, `app/api/planner/budget-estimates/route.ts` | Flight search and flight price sampling |
| SerpApi Google Hotels | `app/api/google-api/google-hotels.ts`, `app/api/planner/generate/route.ts`, `app/api/planner/budget-estimates/route.ts` | Hotel search and hotel price sampling |
| LocationIQ | `app/api/planner/generate/route.ts` | Geocodes cities and nearby places |
| Nominatim / OpenStreetMap | `app/api/planner/generate/route.ts` | Fallback geocoding source |
| Geocoded.me | `app/api/geocoded/cities/route.ts` | Country, state, and city lookup for the wizard |
| Duffel | `app/api/airports/suggestions/route.ts` | Airport suggestions |
| SQL Server via `mssql` | `backend/routes/*.js`, `backend/db/*` | Stores users, profiles, trips, and reservations |
| `ui-avatars.com`, `picsum.photos`, `pravatar.cc`, Unsplash | Several UI components and the home hero | Placeholder and hero imagery |

## UI and page summary

| Surface | Uses | Notes |
| --- | --- | --- |
| `/` home page | `TripPlannerWizard`, `SurpriseMeDiscovery`, `TripPlannerResults` | Main planning experience with mode toggle, AI generation, results, and upsell flow |
| `/planner` | Redirects to `/` | Convenience route |
| `/auth` | `useAuth`, login/signup form | Sign-in and account creation |
| `/trips` | Saved trips list | Shows trips, status chips, and delete action |
| `/reservations` | Reservation list | Shows booking history and cancel action |
| `/profile` | Profile editor | Updates identity, travel documents, preferences, and avatar |
| `TripPlannerWizard` | Stepper | 6 visible steps: Where To, When, Who, Budget, Your Vibe, Review |
| `TripPlannerResults` | Tabbed results view | Overview, Flights, Hotels, Transport, Places, Upgrades |
| `FlightCard` | Flight result card | Expandable timeline, save-to-trip action, booking modal trigger |
| `HotelCard` | Hotel result card | Hotel summary with amenities and booking CTA |
| `BusCard` | Bus result card | Ground transport card with booking CTA |
| `BookingModal` | Booking flow modal | Confirms a flight reservation and writes it to the backend |
| `AirportAutocomplete` | Reusable input | Airport search dropdown used in the planner and surprise flow |
| `Navbar` | Global navigation | Shows authenticated and unauthenticated states |
| `ThemeToggle` | Global control | Theme switching |

## Reusable components status

| Component | State | Where it is used |
| --- | --- | --- |
| `TripPlannerWizard` | Used | Home page planner flow |
| `TripPlannerResults` | Used | Home page results view |
| `SurpriseMeDiscovery` | Used | Home page surprise mode |
| `AirportAutocomplete` | Used | Planner and surprise forms |
| `FlightCard` | Used | Results view for flight options |
| `HotelCard` | Used | Results view for hotel options |
| `BookingModal` | Used | Opened from `FlightCard` |
| `Navbar` | Used | Root layout |
| `ThemeToggle` | Used | Root layout |
| `FlightSearch` | Not used | No current in-repo caller found |
| `BusCard` | Not used | No current in-repo caller found |
| `AIRecommendation` | Not used | No current in-repo caller found |

## Planner step map

| Step | Label | Main UI pieces | Main data/API dependency |
| --- | --- | --- | --- |
| 1 | Where To | Airport autocomplete, trip type toggle | `/api/airports/suggestions` |
| 2 | When | Date inputs and range handling | Local state only |
| 3 | Who | Passenger counters, baggage controls | Local state only |
| 4 | Budget | Budget sliders and auto-allocate button | `/api/planner/budget-estimates` |
| 5 | Your Vibe | Vibe chips and destination regions | `/api/geocoded/cities` |
| 6 | Review | Summary cards and final submit button | `/api/planner/generate` |

## Short read

If you want the one-line version: this is an AI-assisted travel planner with authentication, profile management, trip saving, and reservation tracking, backed by a mix of internal Next.js routes, an Express backend, and travel/AI provider APIs.
