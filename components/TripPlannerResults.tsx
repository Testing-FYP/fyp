'use client';

import { ReactNode, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  Armchair,
  BadgeCheck,
  BedDouble,
  Bus,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Compass,
  Crown,
  Hotel,
  Info,
  Leaf,
  MapPin,
  PlaneTakeoff,
  ShieldAlert,
  Sparkles,
  Star,
  Ticket,
  TrendingUp,
  Usb,
  Users,
  Video,
  Wifi,
} from 'lucide-react';

interface TripPlannerResultsProps {
  results: any;
  onUpsell: (extraBudget: number) => void;
  isUpselling: boolean;
  selectedVibes?: string[];
  plannerData?: any;
  onNavigateToStep?: (step: number) => void;
}

type Tab = {
  id: string;
  label: string;
  count?: number;
};

const cityFallbacks: Record<string, string> = {
  RUH: 'Riyadh, Saudi Arabia',
  AMM: 'Amman, Jordan',
};

function asNumber(value: any): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function formatMoney(value: any, fallback = 'Unavailable') {
  const amount = asNumber(value);
  if (amount === null) return fallback;
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  });
}

function formatDate(value: string) {
  if (!value) return 'Date not set';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(value: string) {
  if (!value) return 'Time TBA';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(11, 16) || value;
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDuration(value: any) {
  if (!value) return 'Duration TBA';
  if (typeof value === 'number') {
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
  }
  const text = String(value).toUpperCase();
  const days = Number(text.match(/(\d+)D/)?.[1] || 0);
  const hours = Number(text.match(/(\d+)H/)?.[1] || 0) + days * 24;
  const minutes = Number(text.match(/(\d+)M/)?.[1] || 0);
  if (!hours && !minutes) return value;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function normalizeCabin(value: string) {
  return (value || 'economy').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function cabinLabel(value: string) {
  const cabin = (value || 'economy').toLowerCase();
  if (cabin === 'economy') return 'Economy Class';
  if (cabin === 'business') return 'Business Class';
  if (cabin === 'first') return 'First Class';
  if (cabin === 'premium_economy') return 'Premium Economy';
  return normalizeCabin(value);
}

function CabinClassBadge({ cabin }: { cabin: string }) {
  const normalized = (cabin || 'economy').toLowerCase();
  const isPremium = normalized.includes('business') || normalized.includes('first');
  const Icon = isPremium ? Crown : Armchair;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-2.5 py-1 text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {cabinLabel(cabin)}
    </span>
  );
}

function getTravelerLabel(plannerData: any) {
  const adults = plannerData?.adults ?? 1;
  const children = plannerData?.children ?? 0;
  return `${adults} adult${adults === 1 ? '' : 's'}${children ? `, ${children} child${children === 1 ? '' : 'ren'}` : ''}`;
}

function getDestinationDisplay(results: any, plannerData: any) {
  const debugDestination = results?._debug?.resolvedDestination;
  const code = plannerData?.destination || debugDestination?.iata || '';
  const city = debugDestination?.city && debugDestination.city !== code ? debugDestination.city : '';
  const country = debugDestination?.country || '';
  if (city && country) return `${city}, ${country}`;
  if (city) return city;
  return cityFallbacks[code] || code || 'Destination pending';
}

function getFlightEndpoints(flight: any) {
  const slice = flight?.slices?.[0];
  const segments = slice?.segments || [];
  const first = segments[0] || {};
  const last = segments[segments.length - 1] || first;
  return { slice, segments, first, last };
}

function getFlightPrice(flight: any) {
  return asNumber(flight?.display_price ?? flight?.total_amount ?? flight?.price);
}

function getDurationMinutes(flight: any) {
  const { first, last, slice } = getFlightEndpoints(flight);
  const start = first?.departing_at ? new Date(first.departing_at).getTime() : NaN;
  const end = last?.arriving_at ? new Date(last.arriving_at).getTime() : NaN;
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) return Math.round((end - start) / 60000);
  const hours = Number(String(slice?.duration || '').match(/(\d+)H/)?.[1] || 0);
  const minutes = Number(String(slice?.duration || '').match(/(\d+)M/)?.[1] || 0);
  return hours * 60 + minutes || 99999;
}

function getLayovers(slice: any) {
  const provided = Array.isArray(slice?.layovers) ? slice.layovers : [];
  if (provided.length > 0) return provided;

  const segments = Array.isArray(slice?.segments) ? slice.segments : [];
  return segments.slice(0, -1).map((segment: any, index: number) => {
    const next = segments[index + 1];
    const arrival = segment?.arriving_at ? new Date(segment.arriving_at).getTime() : NaN;
    const departure = next?.departing_at ? new Date(next.departing_at).getTime() : NaN;
    const durationMinutes = Number.isFinite(arrival) && Number.isFinite(departure)
      ? Math.max(0, Math.round((departure - arrival) / 60000))
      : 0;
    return {
      airportName: segment?.destination_name || segment?.destination?.name || 'Transfer airport',
      airportCode: segment?.destination?.iata_code || '',
      duration: formatDuration(durationMinutes),
      durationMinutes,
      overnight: durationMinutes >= 360,
    };
  }).filter((layover: any) => layover.durationMinutes > 0);
}

function getHotelDistanceKm(hotel: any, results: any) {
  const center = results?._debug?.geocodedCenter;
  const lat = asNumber(hotel?.lat ?? hotel?.gpsCoordinates?.latitude);
  const lon = asNumber(hotel?.lon ?? hotel?.gpsCoordinates?.longitude);
  const centerLat = asNumber(center?.lat);
  const centerLon = asNumber(center?.lon);
  if (lat === null || lon === null || centerLat === null || centerLon === null) return null;

  const radius = 6371;
  const dLat = ((lat - centerLat) * Math.PI) / 180;
  const dLon = ((lon - centerLon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((centerLat * Math.PI) / 180) *
      Math.cos((lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return radius * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function isHotelSuspicious(hotel: any, results: any, destination: string) {
  const distance = getHotelDistanceKm(hotel, results);
  const location = `${hotel?.name || ''} ${hotel?.location || ''} ${hotel?.address || ''}`.toLowerCase();
  const mismatchWords = /(bentonville|arkansas|kansas|missouri|walmart|salina|webb city|northwest arkansas)/i;
  if (distance !== null) return distance > 120;
  return mismatchWords.test(location) && !location.includes(destination.toLowerCase().split(',')[0]);
}

function getHotelImageUrl(image: any) {
  if (!image) return '';
  if (typeof image === 'string') return image;
  return image?.thumbnail || image?.original_image || image?.url || '';
}

function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'amber' | 'green' | 'red' }) {
  const tones = {
    neutral: 'border-border bg-muted text-muted-foreground',
    amber: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    green: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    red: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold ${tones[tone]}`}>
      {children}
    </span>
  );
}

function getHotelStarCount(hotel: any) {
  const candidates = [hotel?.rating, hotel?.hotelClass, hotel?.raw?.hotel_class, hotel?.raw?.extracted_hotel_class];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return Math.max(1, Math.min(5, Math.round(candidate)));
    if (typeof candidate === 'string') {
      const match = candidate.match(/(\d)/);
      if (match) return Math.max(1, Math.min(5, Number(match[1])));
    }
  }
  return 0;
}

function HotelStars({ hotel }: { hotel: any }) {
  const starCount = getHotelStarCount(hotel);
  if (!starCount) return <Badge>Class unavailable</Badge>;

  return (
    <span aria-label={`${starCount} star hotel`} className="inline-flex items-center gap-1 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={`h-3.5 w-3.5 ${index < starCount ? 'fill-amber-400 text-amber-500' : 'text-amber-500/25'}`}
        />
      ))}
    </span>
  );
}

export function FilterTabs({ tabs, active, onChange }: { tabs: Tab[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-border bg-muted p-1">
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold transition ${
            active === tab.id
              ? 'bg-foreground text-background shadow-sm'
              : 'text-muted-foreground hover:bg-background hover:text-foreground'
          }`}
        >
          {tab.label}
          {typeof tab.count === 'number' ? <span className="ml-1 opacity-70">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function WarningBanner({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-amber-800 dark:text-amber-200">
      <div className="flex gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="text-sm font-black">{title}</p>
          <div className="mt-1 text-sm leading-relaxed opacity-85">{children}</div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center">
      <Icon className="mx-auto h-8 w-8 text-muted-foreground" />
      <h3 className="mt-4 text-base font-black text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function SectionHeader({ icon: Icon, eyebrow, title, children }: { icon: any; eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
          <Icon className="h-4 w-4" />
          {eyebrow}
        </div>
        <h2 className="mt-2 text-3xl title-text text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export function TripHeader({ results, plannerData }: { results: any; plannerData: any }) {
  const destination = getDestinationDisplay(results, plannerData);
  const route = `${plannerData?.origin || 'Origin'} -> ${plannerData?.destination || results?._debug?.resolvedDestination?.iata || 'Destination'}`;
  const budget = plannerData?.budgetMode === 'per_category'
    ? (plannerData?.flightBudget || 0) + (plannerData?.hotelBudget || 0) + (plannerData?.transportBudget || 0) + (plannerData?.dailyExpenseBudget || 0)
    : plannerData?.totalBudget || results?.budgetBreakdown?.totalBudget;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-card">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-emerald-500/10" />
      <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.25fr_0.75fr]">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="amber">Recommended</Badge>
            <Badge>{cabinLabel(plannerData?.cabinClass || 'economy')}</Badge>
            <Badge>{(plannerData?.tripType || 'one_way').replace(/_/g, ' ')}</Badge>
          </div>
          <h1 className="mt-5 text-5xl title-text leading-none text-foreground">{route}</h1>
          <p className="mt-3 text-lg font-semibold text-muted-foreground">{destination}</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <HeaderFact icon={CalendarDays} label="Departure" value={formatDate(plannerData?.departureDate)} />
            <HeaderFact icon={Users} label="Travelers" value={getTravelerLabel(plannerData)} />
            <HeaderFact icon={Ticket} label="Cabin" value={cabinLabel(plannerData?.cabinClass || 'economy')} />
            <HeaderFact icon={CircleDollarSign} label="Budget" value={formatMoney(budget)} />
          </div>
        </div>
        <div className="rounded-3xl border border-border bg-background/70 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="small-caps">Trip Readiness</p>
              <p className="mt-2 text-3xl title-text text-foreground">Value first</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground text-background">
              <Compass className="h-6 w-6" />
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <ReadinessBar label="Flight fit" value={88} />
            <ReadinessBar label="Stay fit" value={64} />
            <ReadinessBar label="Daily cushion" value={72} />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeaderFact({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background/70 p-3">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <p className="mt-2 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-black text-foreground">{value}</p>
    </div>
  );
}

function ReadinessBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs font-semibold text-muted-foreground">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-foreground" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function BudgetBreakdown({ breakdown, plannerData }: { breakdown: any; plannerData: any }) {
  const total = asNumber(breakdown?.totalBudget ?? plannerData?.totalBudget) || 0;
  const items = [
    { label: 'Flight budget', value: breakdown?.flights ?? plannerData?.flightBudget, color: 'bg-foreground' },
    { label: 'Hotel budget', value: breakdown?.hotels ?? plannerData?.hotelBudget, color: 'bg-muted-foreground' },
    { label: 'Transport budget', value: breakdown?.transport ?? plannerData?.transportBudget, color: 'bg-amber-500' },
    { label: 'Daily expenses', value: breakdown?.dailyExpenses ?? plannerData?.dailyExpenseBudget, color: 'bg-emerald-500' },
  ];
  const allocated = items.reduce((sum, item) => sum + (asNumber(item.value) || 0), 0);

  return (
    <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="rounded-3xl border border-border bg-card p-5">
        <p className="small-caps">Budget Breakdown</p>
        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-4xl title-text text-foreground">{formatMoney(total)}</p>
            <p className="mt-1 text-sm text-muted-foreground">Recommended total allocation</p>
          </div>
          <div className="flex h-28 w-28 items-center justify-center rounded-full border-[14px] border-foreground bg-background text-sm font-black text-foreground">
            {total ? Math.round((allocated / total) * 100) : 0}%
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map(item => {
          const value = asNumber(item.value) || 0;
          const percent = total ? Math.min(100, Math.round((value / total) * 100)) : 0;
          return (
            <div key={item.label} className="rounded-3xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black text-foreground">{item.label}</p>
                <p className="font-black text-foreground">{formatMoney(value)}</p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${item.color}`} style={{ width: `${percent}%` }} />
              </div>
              <p className="mt-2 text-xs font-medium text-muted-foreground">{percent}% of total budget</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function FlightCard({ flight, index, travelerCount = 1 }: { flight: any; index: number; travelerCount?: number }) {
  const { slice, segments, first, last } = getFlightEndpoints(flight);
  const price = getFlightPrice(flight);
  const perTravelerPrice = price && travelerCount > 1 ? price / travelerCount : null;
  const direct = segments.length <= 1;
  const layovers = getLayovers(slice);
  const carrier = first?.marketing_carrier?.name || flight?.owner?.name || 'Airline pending';
  const carrierCode = first?.marketing_carrier?.iata_code || flight?.owner?.iata_code || '';
  const carrierLogo =
    first?.marketing_carrier?.logo_symbol_url ||
    first?.marketing_carrier?.logo_url ||
    flight?.airline_logo ||
    flight?.owner?.logo_symbol_url ||
    flight?.owner?.logo_url ||
    '';
  const flightNumber = first?.marketing_carrier_flight_number || 'Flight TBA';
  const cabin = first?.cabin_class || flight?.cabin_class || 'economy';
  const amenities = [
    ...(first?.amenities || []),
    ...(first?.airfare_details || []),
    ...(first?.extensions || []),
  ].filter(Boolean);
  const amenitiesText = amenities.join(' ').toLowerCase();
  const hasUsb = amenitiesText.includes('usb');
  const hasWifi = amenitiesText.includes('wi-fi') || amenitiesText.includes('wifi');
  const hasVideo = amenitiesText.includes('video') || amenitiesText.includes('stream');
  const carbon = first?.carbon_emissions || first?.carbonEmissions || flight?.carbon_emissions;

  return (
    <article className="rounded-3xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-background text-muted-foreground">
            <PlaneTakeoff className="h-7 w-7" />
            {carrierLogo ? (
              <img
                src={carrierLogo}
                alt={`${carrier} logo`}
                className="absolute inset-0 h-full w-full bg-background object-contain p-1.5"
                referrerPolicy="no-referrer"
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
            ) : null}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {index === 0 ? <Badge tone="green"><Sparkles className="h-3 w-3" />Best Value</Badge> : null}
              {index === 0 ? <Badge tone="amber">Cheapest</Badge> : <Badge>Available</Badge>}
              {direct ? <Badge>Fastest</Badge> : null}
            </div>
            <h3 className="mt-3 text-xl font-black text-foreground">{carrier}</h3>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              {flightNumber}{carrierCode ? ` / ${carrierCode}` : ''}
            </p>
          </div>
        </div>
        <div className="text-left lg:text-right">
          <p className="text-3xl title-text text-foreground">{formatMoney(price)}</p>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Total fare</p>
          <div className="mt-1 flex justify-start lg:justify-end">
            <CabinClassBadge cabin={cabin} />
          </div>
          {perTravelerPrice ? (
            <p className="mt-1 text-sm font-bold text-muted-foreground">
              {formatMoney(perTravelerPrice)} per traveler x {travelerCount}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-4 rounded-2xl bg-muted p-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <AirportTime code={first?.origin?.iata_code} name={first?.origin_name || first?.origin?.name} time={formatTime(first?.departing_at)} label="Depart" />
        <div className="hidden items-center gap-3 text-muted-foreground md:flex">
          <div className="h-px w-16 bg-border" />
          <div className="rounded-full border border-border bg-card px-3 py-1 text-xs font-black">
            {formatDuration(slice?.duration || getDurationMinutes(flight))}
          </div>
          <div className="h-px w-16 bg-border" />
        </div>
        <AirportTime code={last?.destination?.iata_code} name={last?.destination_name || last?.destination?.name} time={formatTime(last?.arriving_at)} label="Arrive" alignRight />
      </div>

      {layovers.length > 0 ? (
        <div className="mt-3 space-y-2">
          {layovers.map((layover: any, layoverIndex: number) => (
            <div key={`${layover.airportCode || 'transfer'}-${layoverIndex}`} className="flex flex-col gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 font-bold">
                <Clock3 className="h-4 w-4" />
                Transfer at {layover.airportName}{layover.airportCode ? ` (${layover.airportCode})` : ''}
              </div>
              <div className="font-black">
                {layover.duration || formatDuration(layover.durationMinutes)}
                {layover.overnight ? <span className="ml-2 font-bold">(overnight)</span> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Detail icon={Clock3} label="Duration" value={formatDuration(slice?.duration || getDurationMinutes(flight))} />
        <Detail icon={PlaneTakeoff} label="Aircraft" value={first?.aircraft_name || 'Aircraft TBA'} />
        <Detail icon={BedDouble} label="Legroom" value={first?.legroom || 'Legroom TBA'} />
        <Detail icon={Leaf} label="Carbon" value={carbon ? `${carbon}` : 'Estimate unavailable'} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Amenity enabled={hasUsb} icon={Usb} label="USB" />
        <Amenity enabled={hasWifi} icon={Wifi} label="Wi-Fi" />
        <Amenity enabled={hasVideo} icon={Video} label="Video" />
        {!hasUsb && !hasWifi && !hasVideo ? <Badge>Limited amenity data</Badge> : null}
      </div>
    </article>
  );
}

function AirportTime({ code, name, time, label, alignRight = false }: { code: string; name: string; time: string; label: string; alignRight?: boolean }) {
  return (
    <div className={alignRight ? 'md:text-right' : ''}>
      <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black text-foreground">{time}</p>
      <p className="mt-1 text-sm font-black text-foreground">{code || 'TBA'}</p>
      <p className="mt-1 text-xs text-muted-foreground">{name || 'Airport pending'}</p>
    </div>
  );
}

function Detail({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background/60 p-3">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <p className="mt-2 text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function Amenity({ enabled, icon: Icon, label }: { enabled: boolean; icon: any; label: string }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold ${enabled ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-border bg-muted text-muted-foreground'}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

export function HotelCard({ hotel, suspicious, distanceKm }: { hotel: any; suspicious: boolean; distanceKm: number | null }) {
  const photos = Array.isArray(hotel?.images) ? hotel.images : [];
  const amenities = Array.isArray(hotel?.amenities) ? hotel.amenities.slice(0, 6) : [];
  const nearby = Array.isArray(hotel?.nearbyPlaces) ? hotel.nearbyPlaces.slice(0, 3) : [];
  const nightlyPrice = asNumber(hotel?.price);
  const totalPrice = asNumber(hotel?.totalPrice);

  return (
    <article className={`overflow-hidden rounded-3xl border bg-card shadow-sm ${suspicious ? 'border-amber-500/40' : 'border-border'}`}>
      <div className="grid lg:grid-cols-[0.42fr_0.58fr]">
        <div className="min-h-56 bg-muted p-3">
          <div className="grid h-full min-h-56 grid-cols-3 grid-rows-2 gap-2">
            {[0, 1, 2, 3].map(i => {
              const imageUrl = getHotelImageUrl(photos[i]);
              return (
              <div key={i} className={`relative overflow-hidden rounded-2xl border border-border bg-background/60 ${i === 0 ? 'col-span-2 row-span-2' : ''}`}>
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={`${hotel?.name || 'Hotel'} photo ${i + 1}`}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-end p-3 text-xs font-bold text-muted-foreground">
                    Photo placeholder
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </div>
        <div className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap gap-2">
                {suspicious ? <Badge tone="amber"><AlertTriangle className="h-3 w-3" />Location check</Badge> : <Badge tone="green"><BadgeCheck className="h-3 w-3" />Recommended</Badge>}
                <HotelStars hotel={hotel} />
              </div>
              <h3 className="mt-3 text-xl font-black text-foreground">{hotel?.name || 'Hotel name unavailable'}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{hotel?.location || hotel?.address || 'Location unavailable'}</p>
            </div>
            {nightlyPrice || totalPrice ? (
              <div className="sm:text-right">
                {nightlyPrice ? (
                  <>
                    <p className="text-2xl title-text text-foreground">{formatMoney(nightlyPrice)}</p>
                    <p className="text-xs font-semibold text-muted-foreground">per night</p>
                  </>
                ) : null}
                {totalPrice ? (
                  <p className="mt-1 text-sm font-bold text-foreground">{formatMoney(totalPrice)} total</p>
                ) : null}
              </div>
            ) : (
              <Badge tone="red">Price unavailable</Badge>
            )}
          </div>

          {suspicious ? (
            <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
              This listing may be outside the selected destination. Verify the address before booking.
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Detail icon={Star} label="Guest rating" value={hotel?.overallRating ? `${hotel.overallRating}/5` : 'No rating'} />
            <Detail icon={Users} label="Reviews" value={hotel?.reviews ? `${hotel.reviews.toLocaleString()}` : 'No reviews'} />
            <Detail icon={MapPin} label="Distance" value={distanceKm !== null ? `${distanceKm.toFixed(1)} km` : 'Coordinates unavailable'} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {amenities.length ? amenities.map((amenity: string) => <Badge key={amenity}>{amenity}</Badge>) : <Badge tone="red">Amenities unavailable</Badge>}
          </div>

          <div className="mt-4 grid gap-4 border-t border-border pt-4 md:grid-cols-2">
            <div className="text-sm text-muted-foreground">
              <span className="font-bold text-foreground">Check-in:</span> {hotel?.checkInTime || 'TBA'}
              <br />
              <span className="font-bold text-foreground">Check-out:</span> {hotel?.checkOutTime || 'TBA'}
            </div>
            <div className="text-sm text-muted-foreground">
              <span className="font-bold text-foreground">Nearby:</span>{' '}
              {nearby.length ? nearby.map((place: any) => place?.name).filter(Boolean).join(', ') : 'Nearby places unavailable'}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function TransportCard({ transport }: { transport: any }) {
  return (
    <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground text-background">
            <Bus className="h-6 w-6" />
          </div>
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="amber">Cheapest</Badge>
              <Badge tone="green">Recommended</Badge>
            </div>
            <h3 className="mt-3 text-xl font-black text-foreground">{transport?.operator || 'Ground transport'}</h3>
            <p className="mt-1 text-sm font-semibold capitalize text-muted-foreground">
              Type: {(transport?.transportType || transport?.type || 'bus').replace(/_/g, ' ')} / Priority: cheapest
            </p>
          </div>
        </div>
        <div className="md:text-right">
          <p className="text-3xl title-text text-foreground">{formatMoney(transport?.price ?? 70)}</p>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">estimated budget</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Detail icon={Clock3} label="Duration" value={transport?.duration || 'Time TBA'} />
        <Detail icon={Ticket} label="Class" value={transport?.class || 'Standard'} />
        <Detail icon={MapPin} label="Pickup" value={transport?.location || 'Station TBA'} />
      </div>
    </article>
  );
}

export function PlaceCard({ place }: { place: any }) {
  const hasCoordinates = place?.lat && place?.lon;
  return (
    <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <MapPin className="h-5 w-5" />
        </div>
        <Badge tone={hasCoordinates ? 'green' : 'red'}>{hasCoordinates ? place?.distance || 'Mapped' : 'Coordinates unavailable'}</Badge>
      </div>
      <h3 className="mt-4 text-lg font-black text-foreground">{place?.name || 'Place unavailable'}</h3>
      <p className="mt-2 min-h-16 text-sm leading-relaxed text-muted-foreground">{place?.description || 'Description unavailable from the current data source.'}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Badge tone="amber"><Star className="h-3 w-3" />{place?.rating ? `${place.rating}` : 'Rating N/A'}</Badge>
        <Badge>{place?.reviewsCount ? `${place.reviewsCount.toLocaleString()} reviews` : 'Reviews N/A'}</Badge>
        <Badge tone="green">{formatMoney(place?.estimatedCost ?? 0, 'Cost varies')}</Badge>
      </div>
    </article>
  );
}

export function UpsellCard({ option, onSelect, disabled }: { option: any; onSelect: (amount: number) => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(option?.extraAmount || 0)}
      disabled={disabled}
      className="group rounded-3xl border border-border bg-card p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
    >
      <div className="flex items-center justify-between gap-4">
        <Badge tone="amber">+{formatMoney(option?.extraAmount || 0)}</Badge>
        <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-1" />
      </div>
      <h3 className="mt-4 text-lg font-black text-foreground">{option?.title || 'Upgrade option'}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{option?.description || 'Unlock a more comfortable version of this itinerary.'}</p>
    </button>
  );
}

function AISummary({ summary, destination }: { summary: any; destination: string }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <p className="small-caps">AI Travel Summary</p>
          <h2 className="mt-2 text-3xl title-text text-foreground">
            {summary?.title || `Uncover the Hidden Gems of ${destination}`}
          </h2>
          <p className="mt-3 max-w-4xl text-base leading-relaxed text-muted-foreground">
            {summary?.description || `${destination} can work beautifully for a budget-conscious traveler when the flight and stay are selected with discipline. Prioritize transit-friendly neighborhoods, low-cost cultural stops, and one memorable paid experience so the trip feels full without stretching the budget.`}
          </p>
        </div>
      </div>
    </section>
  );
}

export default function TripPlannerResults({ results, onUpsell, isUpselling, plannerData }: TripPlannerResultsProps) {
  const [activeSection, setActiveSection] = useState('overview');
  const [flightFilter, setFlightFilter] = useState('best');
  const [hotelFilter, setHotelFilter] = useState('recommended');
  const [placeFilter, setPlaceFilter] = useState('all');

  const destination = getDestinationDisplay(results, plannerData);

  const flights = useMemo(() => {
    const pricedFlights = [...(results?.flights || [])].filter(flight => getFlightPrice(flight) !== null);
    pricedFlights.sort((a, b) => {
      const aPrice = getFlightPrice(a) ?? Number.POSITIVE_INFINITY;
      const bPrice = getFlightPrice(b) ?? Number.POSITIVE_INFINITY;
      return aPrice - bPrice || getDurationMinutes(a) - getDurationMinutes(b);
    });
    if (flightFilter === 'cheapest') return pricedFlights.sort((a, b) => (getFlightPrice(a) ?? Infinity) - (getFlightPrice(b) ?? Infinity));
    if (flightFilter === 'fastest') return pricedFlights.sort((a, b) => getDurationMinutes(a) - getDurationMinutes(b));
    if (flightFilter === 'nonstop') return pricedFlights.filter(flight => getFlightEndpoints(flight).segments.length <= 1);
    return pricedFlights;
  }, [results?.flights, flightFilter]);

  const hiddenUnpricedFlightCount = (results?.flights || []).filter((flight: any) => getFlightPrice(flight) === null).length;

  const hotels = useMemo(() => {
    const withFlags = [...(results?.hotels || [])].map(hotel => ({
      hotel,
      suspicious: isHotelSuspicious(hotel, results, destination),
      distance: getHotelDistanceKm(hotel, results),
    }));
    if (hotelFilter === 'cheapest') return withFlags.sort((a, b) => (asNumber(a.hotel?.price) ?? Infinity) - (asNumber(b.hotel?.price) ?? Infinity));
    if (hotelFilter === 'location-check') return withFlags.filter(item => item.suspicious);
    return withFlags.sort((a, b) => Number(a.suspicious) - Number(b.suspicious));
  }, [results, destination, hotelFilter]);

  const places = useMemo(() => {
    const all = [...(results?.placesToVisit || [])];
    if (placeFilter === 'mapped') return all.filter(place => place?.lat && place?.lon);
    if (placeFilter === 'popular') return all.filter(place => (place?.reviewsCount || 0) >= 1000);
    if (placeFilter === 'unmapped') return all.filter(place => !place?.lat || !place?.lon);
    return all;
  }, [results?.placesToVisit, placeFilter]);

  const transport = [...(results?.transport || [])].sort((a, b) => (asNumber(a?.price) ?? Infinity) - (asNumber(b?.price) ?? Infinity))[0];
  const suspiciousHotelCount = hotels.filter(item => item.suspicious).length;
  const travelerCount = Math.max(1, (plannerData?.adults || 0) + (plannerData?.children || 0));

  if (!results) return null;

  const sectionTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'flights', label: 'Flights', count: flights.length },
    { id: 'hotels', label: 'Hotels', count: results?.hotels?.length || 0 },
    { id: 'transport', label: 'Transport', count: transport ? 1 : 0 },
    { id: 'places', label: 'Places', count: results?.placesToVisit?.length || 0 },
    { id: 'upgrades', label: 'Upgrades', count: results?.upsellOptions?.length || 3 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-10"
    >
      <TripHeader results={results} plannerData={plannerData} />

      <div className="sticky top-20 z-20 rounded-3xl border border-border bg-background/95 p-2 shadow-sm backdrop-blur">
        <FilterTabs tabs={sectionTabs} active={activeSection} onChange={setActiveSection} />
      </div>

      {activeSection === 'overview' && (
        <motion.section
          key="overview"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-5"
        >
          <BudgetBreakdown breakdown={results?.budgetBreakdown} plannerData={plannerData} />
          <AISummary summary={results?.aiSummary} destination={destination} />
        </motion.section>
      )}

      {activeSection === 'flights' && (
        <motion.section
          key="flights"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-5"
        >
          <SectionHeader icon={PlaneTakeoff} eyebrow="Flight Results" title="Best value flights">
            <FilterTabs
              active={flightFilter}
              onChange={setFlightFilter}
              tabs={[
                { id: 'best', label: 'Best Value', count: flights.length },
                { id: 'cheapest', label: 'Cheapest' },
                { id: 'fastest', label: 'Fastest' },
                { id: 'nonstop', label: 'Nonstop' },
              ]}
            />
          </SectionHeader>
          {hiddenUnpricedFlightCount > 0 ? (
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
              <Info className="h-4 w-4" />
              {hiddenUnpricedFlightCount} flight{hiddenUnpricedFlightCount === 1 ? '' : 's'} hidden because no valid price was returned.
            </div>
          ) : null}
          {flights.length ? flights.map((flight, index) => <FlightCard key={flight?.id || index} flight={flight} index={index} travelerCount={travelerCount} />) : (
            <EmptyState icon={PlaneTakeoff} title="No priced flight results returned" body="Flights with missing, null, or zero prices are hidden until the provider returns a valid fare." />
          )}
        </motion.section>
      )}

      {activeSection === 'hotels' && (
        <motion.section
          key="hotels"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-5"
        >
          <SectionHeader icon={Hotel} eyebrow="Hotel Results" title="Matched stays">
            <FilterTabs
              active={hotelFilter}
              onChange={setHotelFilter}
              tabs={[
                { id: 'recommended', label: 'Recommended', count: results?.hotels?.length || 0 },
                { id: 'cheapest', label: 'Cheapest' },
                { id: 'location-check', label: 'Location Check', count: suspiciousHotelCount },
              ]}
            />
          </SectionHeader>
          {suspiciousHotelCount > 0 ? (
            <WarningBanner title="Some hotel locations look inconsistent">
              The hotel provider returned listings that appear outside {destination}. They remain visible for review, but they are marked before booking.
            </WarningBanner>
          ) : null}
          {hotels.length ? hotels.map(({ hotel, suspicious, distance }, index) => (
            <HotelCard key={hotel?.id || index} hotel={hotel} suspicious={suspicious} distanceKm={distance} />
          )) : (
            <EmptyState icon={Hotel} title="No hotel cards for this filter" body="Try another hotel filter or run a new search with broader stay preferences." />
          )}
        </motion.section>
      )}

      {activeSection === 'transport' && (
        <motion.section
          key="transport"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-5"
        >
          <SectionHeader icon={Bus} eyebrow="Transport" title="Cheapest selected transport" />
          {transport ? <TransportCard transport={transport} /> : (
            <EmptyState icon={Bus} title="No transport returned" body="Ground transport will appear when the selected destination has matching options." />
          )}
        </motion.section>
      )}

      {activeSection === 'places' && (
        <motion.section
          key="places"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-5"
        >
          <SectionHeader icon={MapPin} eyebrow="Places to Visit" title={`Attractions around ${plannerData?.destination || 'your destination'}`}>
            <FilterTabs
              active={placeFilter}
              onChange={setPlaceFilter}
              tabs={[
                { id: 'all', label: 'All', count: results?.placesToVisit?.length || 0 },
                { id: 'mapped', label: 'Mapped' },
                { id: 'popular', label: 'Popular' },
                { id: 'unmapped', label: 'Missing Coordinates' },
              ]}
            />
          </SectionHeader>
          {places.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {places.map((place, index) => <PlaceCard key={`${place?.name || 'place'}-${index}`} place={place} />)}
            </div>
          ) : (
            <EmptyState icon={MapPin} title="No attractions match this filter" body="Places without coordinates and places with verified map data are kept separate so data gaps stay visible." />
          )}
        </motion.section>
      )}

      {activeSection === 'upgrades' && (
        <motion.section
          key="upgrades"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-5"
        >
          <SectionHeader icon={TrendingUp} eyebrow="Upsell Options" title="Upgrade paths" />
          <div className="grid gap-4 md:grid-cols-3">
            {(results?.upsellOptions || []).length ? results.upsellOptions.map((option: any, index: number) => (
              <UpsellCard key={`${option?.title || 'upsell'}-${index}`} option={option} onSelect={onUpsell} disabled={isUpselling} />
            )) : (
              <>
                <UpsellCard option={{ extraAmount: 100, title: 'Comfort Upgrade', description: 'Add a little more room for better flight times or a stronger hotel match.' }} onSelect={onUpsell} disabled={isUpselling} />
                <UpsellCard option={{ extraAmount: 250, title: 'Premium Stay Upgrade', description: 'Move the stay budget toward better reviewed hotels in a stronger location.' }} onSelect={onUpsell} disabled={isUpselling} />
                <UpsellCard option={{ extraAmount: 500, title: 'Luxury Experience', description: 'Unlock premium routing, private transfer options, and signature destination experiences.' }} onSelect={onUpsell} disabled={isUpselling} />
              </>
            )}
          </div>
        </motion.section>
      )}
    </motion.div>
  );
}
