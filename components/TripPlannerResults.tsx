'use client';

import { ReactNode, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  Armchair,
  BadgeCheck,
  BedDouble,
  Bus,
  CalendarDays,
  CarFront,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Compass,
  Crown,
  Hotel,
  MapPin,
  PlaneLanding,
  PlaneTakeoff,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  Star,
  Ticket,
  TrendingUp,
  Train,
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

function formatShortDate(value: string) {
  if (!value) return 'Date TBA';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
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
    if (hours && minutes) return `${hours}h ${minutes}m`;
    if (hours) return `${hours}h`;
    return `${minutes}m`;
  }
  const text = String(value).toUpperCase();
  const days = Number(text.match(/(\d+)D/)?.[1] || 0);
  const hours = Number(text.match(/(\d+)H/)?.[1] || 0) + days * 24;
  const minutes = Number(text.match(/(\d+)M/)?.[1] || 0);
  if (!hours && !minutes) return value;
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
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
    <span className="inline-flex items-center gap-1.5 rounded-xl border border-foreground/15 bg-background px-3 py-1.5 text-sm font-black text-foreground shadow-sm">
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
  return getSliceEndpoints(slice);
}

function getSliceEndpoints(slice: any) {
  const segments = slice?.segments || [];
  const first = segments[0] || {};
  const last = segments[segments.length - 1] || first;
  return { slice, segments, first, last };
}

function getFlightPrice(flight: any) {
  return asNumber(flight?.display_price ?? flight?.total_amount ?? flight?.price);
}

function getFlightCabin(flight: any) {
  const firstSegment = flight?.slices?.[0]?.segments?.[0];
  return String(firstSegment?.cabin_class || flight?.cabin_class || 'economy').toLowerCase();
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

function getFlightSegmentNumbers(flight: any) {
  const slices = Array.isArray(flight?.slices) ? flight.slices : [];
  const numbers = slices.flatMap((slice: any) =>
    (slice?.segments || []).map((segment: any) => segment?.marketing_carrier_flight_number).filter(Boolean)
  );
  return Array.from(new Set(numbers));
}

function getCarryOnStatus(flight: any) {
  const slices = Array.isArray(flight?.slices) ? flight.slices : [];
  const extensionText = slices
    .flatMap((slice: any) => Array.isArray(slice?.segments) ? slice.segments : [])
    .flatMap((segment: any) => Array.isArray(segment?.extensions) ? segment.extensions : [])
    .find((extension: any) => {
      const text = String(extension || '').toLowerCase();
      return text.includes('carry-on') || text.includes('bag');
    });

  if (!extensionText) return null;

  const label = String(extensionText);
  const unavailable = /(?:^|\b)no\b/i.test(label);
  return {
    label,
    tone: unavailable ? 'red' as const : 'green' as const,
    prefix: unavailable ? '✗' : '✓',
  };
}

function getSliceRouteCodes(slice: any) {
  const segments = Array.isArray(slice?.segments) ? slice.segments : [];
  if (segments.length === 0) return [];
  return [
    segments[0]?.origin?.iata_code || 'DEP',
    ...segments.map((segment: any) => segment?.destination?.iata_code || 'ARR'),
  ];
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

function Badge({ children, tone = 'neutral', strong = false }: { children: ReactNode; tone?: 'neutral' | 'amber' | 'green' | 'red' | 'blue'; strong?: boolean }) {
  const tones = {
    neutral: strong ? 'border-foreground/15 bg-background text-foreground shadow-sm' : 'border-border bg-muted text-muted-foreground',
    amber: strong ? 'border-amber-500/35 bg-amber-500/15 text-amber-800 shadow-sm dark:text-amber-200' : 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    green: strong ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-800 shadow-sm dark:text-emerald-200' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    red: strong ? 'border-red-500/35 bg-red-500/15 text-red-800 shadow-sm dark:text-red-200' : 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300',
    blue: strong ? 'border-sky-500/35 bg-sky-500/15 text-sky-800 shadow-sm dark:text-sky-200' : 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-xl border ${strong ? 'px-3 py-1.5 text-sm font-black' : 'px-2.5 py-1 text-[11px] font-bold'} ${tones[tone]}`}>
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

function getHotelStayPrice(hotel: any, plannerData: any) {
  const total = asNumber(hotel?.totalPrice ?? hotel?.total_price ?? hotel?.total);
  if (total !== null) return total;
  const nightly = asNumber(hotel?.price ?? hotel?.nightlyPrice ?? hotel?.rate_per_night);
  if (nightly === null) return null;
  const nights = Math.max(1, Number(plannerData?.nights) || 1);
  const apartments = Math.max(1, Number(plannerData?.hotelRooms) || 1);
  return nightly * nights * apartments;
}

function normalizeBudgetFlightCabins(plannerData: any) {
  const selected = Array.isArray(plannerData?.budgetFlightCabins)
    ? plannerData.budgetFlightCabins.filter((cabin: any) => cabin === 'economy' || cabin === 'business')
    : [];
  if (selected.length) return selected;
  return [plannerData?.cabinClass === 'business' ? 'business' : 'economy'];
}

function normalizeBudgetHotelStars(plannerData: any) {
  const selected = Array.isArray(plannerData?.budgetHotelStars)
    ? plannerData.budgetHotelStars.map((star: any) => Math.round(Number(star))).filter((star: number) => star >= 1 && star <= 5)
    : [];
  if (selected.length) return selected;
  return [Math.max(1, Math.min(5, Math.round(Number(plannerData?.hotelStars) || 3)))];
}

function buildBudgetInsight(items: any[], budget: number, getPrice: (item: any) => number | null) {
  const priced = items
    .map(item => ({ item, price: getPrice(item) }))
    .filter((entry): entry is { item: any; price: number } => entry.price !== null)
    .sort((a, b) => a.price - b.price);
  const inBudget = priced.filter(entry => entry.price <= budget);
  const aboveBudget = priced.filter(entry => entry.price > budget);
  const cheapest = priced[0] || null;
  const nearestAbove = aboveBudget[0] || null;
  const bestInBudget = inBudget[0] || null;
  return {
    budget,
    priced,
    inBudget,
    aboveBudget,
    cheapest,
    nearestAbove,
    bestInBudget,
    status: !priced.length
      ? 'no_prices'
      : budget <= 0
        ? 'no_budget'
        : cheapest && cheapest.price > budget
          ? 'over_budget'
          : 'fit',
  };
}

function BudgetDecisionPanel({ title, context, insight }: { title: string; context: string; insight: any }) {
  const budget = Number(insight?.budget || 0);
  const cheapest = insight?.cheapest;
  const nearestAbove = insight?.nearestAbove;
  const bestInBudget = insight?.bestInBudget;
  const status = insight?.status;
  const tone = status === 'over_budget' ? 'red' : status === 'fit' ? 'green' : 'amber';
  const titleText = status === 'over_budget'
    ? `Budget is lower than real ${title.toLowerCase()} prices`
    : status === 'fit'
      ? `${title} budget can work`
      : `${title} needs price data`;

  return (
    <section className="rounded-3xl border border-border bg-card p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="small-caps">{context}</p>
          <h3 className="mt-2 text-2xl title-text text-foreground">{titleText}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {status === 'over_budget' && cheapest
              ? `You set ${formatMoney(budget)}. The cheapest real option found is ${formatMoney(cheapest.price)}, so you need ${formatMoney(cheapest.price - budget)} more for this choice.`
              : status === 'fit' && bestInBudget
                ? `You set ${formatMoney(budget)}. There are ${insight.inBudget.length} option(s) at or under that budget.`
                : 'No reliable prices were available for this category in the current result set.'}
          </p>
        </div>
        <Badge tone={tone as any} strong>
          {status === 'over_budget' ? 'Need more budget' : status === 'fit' ? 'Fits budget' : 'Check data'}
        </Badge>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <Detail icon={CircleDollarSign} label="Your budget" value={formatMoney(budget)} />
        <Detail icon={BadgeCheck} label="Cheapest real option" value={cheapest ? formatMoney(cheapest.price) : 'Unavailable'} />
        <Detail
          icon={TrendingUp}
          label="Next option above"
          value={nearestAbove ? `${formatMoney(nearestAbove.price)} (${formatMoney(nearestAbove.price - budget)} more)` : 'None found'}
        />
      </div>
      {status === 'fit' && bestInBudget && budget > bestInBudget.price ? (
        <p className="mt-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
          You can save {formatMoney(budget - bestInBudget.price)} by choosing the cheapest fitting option.
        </p>
      ) : null}
    </section>
  );
}

function HotelStars({ hotel }: { hotel: any }) {
  const starCount = getHotelStarCount(hotel);
  if (!starCount) return <Badge>Class unavailable</Badge>;

  return (
    <span aria-label={`${starCount} star hotel`} className="inline-flex items-center gap-1 rounded-xl border border-amber-500/35 bg-amber-500/15 px-3 py-1.5 shadow-sm">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={`h-4 w-4 ${index < starCount ? 'fill-amber-400 text-amber-500' : 'text-amber-500/25'}`}
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

function BudgetFitPanel({ agent, backgroundImage = '', plannerData }: { agent: any; backgroundImage?: string; plannerData?: any }) {
  if (!agent?.categories) return null;
  const categories = Object.values(agent.categories).filter((category: any) => category?.status !== 'disabled') as any[];
  const hasBudgetProblem = categories.some((category: any) => ['over_budget', 'no_budget'].includes(category?.status));
  const allFit = categories.length > 0 && categories.every((category: any) => category?.status === 'fit');
  const panelTone = hasBudgetProblem ? 'red' : allFit ? 'green' : 'blue';
  const panelTitle = hasBudgetProblem ? 'Budget needs attention' : 'Budget fits your trip';
  const panelCopy = hasBudgetProblem
    ? 'Some real prices are above the budget you selected. Review the highlighted categories before choosing options.'
    : agent.summary || 'Real prices are checked against your budget with a 10% tolerance.';
  const StatusIcon = hasBudgetProblem ? AlertTriangle : BadgeCheck;
  const categoryIcons: Record<string, any> = {
    flights: PlaneTakeoff,
    hotels: Hotel,
    transport: Bus,
    dailyExpenses: MapPin,
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 18, boxShadow: `0 0 0 0 ${hasBudgetProblem ? 'rgba(239,68,68,0.55)' : 'rgba(16,185,129,0.55)'}` }}
      animate={{
        opacity: 1,
        y: 0,
        boxShadow: [
          `0 0 0 0 ${hasBudgetProblem ? 'rgba(239,68,68,0.45)' : 'rgba(16,185,129,0.45)'}`,
          `0 0 0 14px ${hasBudgetProblem ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)'}`,
          `0 0 0 0 ${hasBudgetProblem ? 'rgba(239,68,68,0)' : 'rgba(16,185,129,0)'}`,
        ],
      }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-3xl border border-border bg-card p-5"
    >
      {backgroundImage ? (
        <img
          src={backgroundImage}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-12"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background/95 to-background/80" />
      <div className={`absolute inset-x-0 top-0 h-1 ${panelTone === 'red' ? 'bg-red-500' : panelTone === 'green' ? 'bg-emerald-500' : 'bg-sky-500'}`} />

      <div className="relative">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border ${
              panelTone === 'red'
                ? 'border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-300'
                : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            }`}>
              <StatusIcon className="h-7 w-7" />
            </div>
            <div>
              <p className="small-caps">Budget Fit Agent</p>
              <h2 className="mt-2 text-3xl title-text text-foreground">{panelTitle}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {panelCopy}
              </p>
            </div>
          </div>
          <Badge tone={panelTone as any} strong>{agent.tolerancePercent || 10}% tolerance</Badge>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {categories.map((category: any) => {
            const overBudget = category.status === 'over_budget';
            const noBudget = category.status === 'no_budget';
            const tone = overBudget ? 'red' : noBudget ? 'amber' : category.status === 'fit' ? 'green' : 'neutral';
            const Icon = categoryIcons[category.key] || CircleDollarSign;
            const displayCategory = withBudgetScopeMetrics(category, plannerData);
            return (
              <div key={category.key} className="relative overflow-hidden rounded-2xl border border-border bg-background/85 p-4 shadow-sm backdrop-blur">
                <div className={`absolute inset-y-0 left-0 w-1 ${tone === 'red' ? 'bg-red-500' : tone === 'amber' ? 'bg-amber-500' : tone === 'green' ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-muted text-foreground">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-foreground">{category.label}</p>
                      <p className="mt-1 text-xs font-semibold text-muted-foreground">
                        {category.shownCount}/{category.originalCount} option{category.originalCount === 1 ? '' : 's'} shown
                      </p>
                      {category.usageDetail ? (
                        <p className="mt-1 text-[11px] font-semibold text-muted-foreground">{category.usageDetail}</p>
                      ) : null}
                    </div>
                  </div>
                  <Badge tone={tone as any} strong>{String(category.status || 'checked').replace(/_/g, ' ')}</Badge>
                </div>
                {Array.isArray(displayCategory.scopeMetrics) && displayCategory.scopeMetrics.length ? (
                  <BudgetScopeRows category={displayCategory} />
                ) : (
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <MiniMetric label={category.budgetLabel || 'Budget'} value={formatMoney(category.budget)} />
                    <MiniMetric label={category.cheapestLabel || 'Cheapest'} value={formatMoney(category.cheapestPrice)} />
                    <MiniMetric label={category.upperLabel || 'Upper'} value={formatMoney(category.upperBound)} />
                    <MiniMetric
                      label={category.selectedLabel || 'Selected'}
                      value={formatMoney(category.selectedTotalPrice ?? category.unitCheapest ?? category.cheapestPrice)}
                    />
                  </div>
                )}
                {!Array.isArray(displayCategory.scopeMetrics) && category.unitLabel && (category.unitBudget || category.unitCheapest) ? (
                  <p className="mt-3 rounded-xl border border-border bg-card/70 px-3 py-2 text-xs font-semibold text-muted-foreground">
                    {category.unitBudget ? `${formatMoney(category.unitBudget)} budget` : 'Budget unavailable'}
                    {category.unitCheapest ? ` · ${formatMoney(category.unitCheapest)} cheapest` : ''}
                    {' '}
                    {category.unitLabel}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </motion.section>
  );
}

function withBudgetScopeMetrics(category: any, plannerData?: any) {
  if (Array.isArray(category?.scopeMetrics) && category.scopeMetrics.length) return category;
  if (!['hotels', 'transport', 'dailyExpenses'].includes(category?.key)) return category;

  const nights = Math.max(1, asNumber(category?.nights ?? plannerData?.nights) || 1);
  const rooms = Math.max(1, asNumber(plannerData?.hotelRooms) || 1);
  const budget = asNumber(category?.budget);
  const cheapest = asNumber(category?.selectedTotalPrice ?? category?.cheapestPrice);
  const tolerance = asNumber(category?.upperBound) ?? (budget ? Math.round(budget * 1.1) : null);

  if (category.key === 'hotels') {
    const nightlyBudget = budget ? Math.round(budget / nights / rooms) : null;
    const nightlyCheapest = cheapest ? Math.round(cheapest / nights / rooms) : null;
    return {
      ...category,
      scopeMetrics: [
        { icon: 'hotel', label: 'Total staying budget', value: budget, detail: `${nights} night${nights === 1 ? '' : 's'} total` },
        { icon: 'dollar', label: 'Cheapest option', value: cheapest, detail: 'total stay price' },
        { icon: 'calendar', label: 'Nightly budget', value: nightlyBudget, detail: 'per apartment/night' },
        { icon: 'bed', label: 'Cheapest daily hotel', value: nightlyCheapest, detail: 'per apartment/night' },
        { icon: 'tolerance', label: 'Tolerance', value: tolerance, detail: '10% upper limit' },
      ],
    };
  }

  const perDayBudget = budget ? Math.round(budget / nights) : null;
  const perDayCheapest = cheapest ? Math.round(cheapest / nights) : null;
  if (category.key === 'transport') {
    return {
      ...category,
      scopeMetrics: [
        { icon: 'dollar', label: 'Total budget', value: budget, detail: `${nights} day${nights === 1 ? '' : 's'} total` },
        { icon: 'ticket', label: 'Total cheapest option', value: cheapest, detail: 'cheapest trip option' },
        { icon: 'calendar', label: 'One-day budget', value: perDayBudget, detail: 'daily allowance' },
        { icon: 'bus', label: 'Cheapest option/day', value: perDayCheapest, detail: 'cheapest daily average' },
        { icon: 'tolerance', label: 'Tolerance', value: tolerance, detail: '10% upper limit' },
      ],
    };
  }

  return {
    ...category,
    scopeMetrics: [
      { icon: 'dollar', label: 'Total budget', value: budget, detail: `${nights} day${nights === 1 ? '' : 's'} total` },
      { icon: 'ticket', label: 'Selected total', value: cheapest, detail: 'all selected places' },
      { icon: 'calendar', label: 'One-day budget', value: perDayBudget, detail: 'daily allowance' },
      { icon: 'map', label: 'Selected/day', value: perDayCheapest, detail: 'selected daily average' },
      { icon: 'tolerance', label: 'Tolerance', value: tolerance, detail: '10% upper limit' },
    ],
  };
}

function BudgetScopeRows({ category }: { category: any }) {
  const metrics = Array.isArray(category.scopeMetrics) ? category.scopeMetrics : [];
  const totalMetrics = metrics.slice(0, 2);
  const dayMetrics = metrics.slice(2, 4);
  const toleranceMetric = metrics.find((metric: any) => metric?.icon === 'tolerance') || metrics[4];
  const totalTitle =
    category.key === 'hotels'
      ? 'Total stay'
      : category.key === 'transport'
        ? 'Total transport'
        : 'Total daily expenses';
  const dailyTitle =
    category.key === 'hotels'
      ? 'Nightly hotel'
      : category.key === 'transport'
        ? 'One-day transport'
        : 'One-day spending';

  return (
    <div className="mt-4 space-y-2">
      <div>
        <p className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{totalTitle}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {totalMetrics.map((metric: any) => (
            <BudgetScopeMetric key={`${category.key}-${metric.label}`} metric={metric} />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{dailyTitle}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {dayMetrics.map((metric: any) => (
            <BudgetScopeMetric key={`${category.key}-${metric.label}`} metric={metric} />
          ))}
        </div>
      </div>
      {toleranceMetric ? (
        <BudgetScopeMetric metric={toleranceMetric} compact />
      ) : null}
    </div>
  );
}

function BudgetScopeMetric({ metric, compact = false }: { metric: any; compact?: boolean }) {
  const icons: Record<string, any> = {
    bed: BedDouble,
    bus: Bus,
    calendar: CalendarDays,
    dollar: CircleDollarSign,
    hotel: Hotel,
    map: MapPin,
    ticket: Ticket,
    tolerance: BadgeCheck,
  };
  const Icon = icons[metric?.icon] || CircleDollarSign;
  return (
    <div className={`flex items-start gap-2 rounded-xl border border-border bg-card/75 px-3 py-2 ${compact ? 'items-center bg-muted/50' : ''}`}>
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className={`min-w-0 ${compact ? 'flex flex-1 items-center justify-between gap-3' : ''}`}>
        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-muted-foreground">{metric?.label}</p>
        <div className={compact ? 'text-right' : ''}>
          <p className="mt-0.5 text-xs font-black text-foreground">{formatMoney(metric?.value)}</p>
          {metric?.detail ? <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground">{metric.detail}</p> : null}
        </div>
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/80 px-3 py-2">
      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xs font-black text-foreground">{value}</p>
    </div>
  );
}

function BudgetCategoryNotice({ agent, categoryKey }: { agent: any; categoryKey: string }) {
  const category = agent?.categories?.[categoryKey];
  if (!category || !['over_budget', 'no_budget'].includes(category.status)) return null;

  return (
    <WarningBanner title={`${category.label} budget check`}>
      {category.message}
    </WarningBanner>
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

function BudgetEmptyState({ icon: Icon, title, body, category }: { icon: any; title: string; body: string; category?: any }) {
  const examples = Array.isArray(category?.examples) ? category.examples.filter(Boolean) : [];

  return (
    <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center">
      <Icon className="mx-auto h-8 w-8 text-muted-foreground" />
      <h3 className="mt-4 text-base font-black text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {category?.message || body}
      </p>
      {examples.length > 0 ? (
        <div className="mx-auto mt-5 max-w-2xl space-y-2 text-left">
          {examples.map((example: string, index: number) => (
            <div key={`${example}-${index}`} className="rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-relaxed text-muted-foreground">
              {example}
            </div>
          ))}
        </div>
      ) : null}
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
  const originCode = plannerData?.origin || 'Origin';
  const destinationCode = plannerData?.destination || results?._debug?.resolvedDestination?.iata || 'Destination';
  const tripType = plannerData?.tripType || 'one_way';
  const isRoundTrip = tripType === 'round_trip';
  const routeConnector = tripType === 'round_trip' ? '<->' : '->';
  const route = `${originCode} ${routeConnector} ${destinationCode}`;
  const budget = plannerData?.budgetMode === 'per_category'
    ? (plannerData?.flightBudget || 0) + (plannerData?.hotelBudget || 0) + (plannerData?.transportBudget || 0) + (plannerData?.dailyExpenseBudget || 0)
    : plannerData?.totalBudget || results?.budgetBreakdown?.totalBudget;
  const destinationImages = Array.isArray(results?.destinationImages) ? results.destinationImages : [];
  const fallbackImages = [
    {
      title: `${destination} city view`,
      source: 'Fallback image',
      thumbnail: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?q=80&w=800&auto=format&fit=crop',
      original: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?q=80&w=2000&auto=format&fit=crop',
    },
    {
      title: `${destination} skyline`,
      source: 'Fallback image',
      thumbnail: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=800&auto=format&fit=crop',
      original: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=2000&auto=format&fit=crop',
    },
    {
      title: `${destination} travel landmark`,
      source: 'Fallback image',
      thumbnail: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=800&auto=format&fit=crop',
      original: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2000&auto=format&fit=crop',
    },
  ];
  const heroImage = destinationImages.find((image: any) => image?.original)?.original
    || destinationImages.find((image: any) => image?.thumbnail)?.thumbnail
    || fallbackImages[0].original;
  const destinationName = destination.split(',')[0] || destinationCode;
  const secondaryName = destination.includes(',') ? destination.split(',').slice(1).join(',').trim() : destination;

  return (
    <section className="relative min-h-[680px] overflow-hidden rounded-3xl border border-border bg-black text-white shadow-2xl">
      <img
        src={heroImage}
        alt={`${destinationName} travel view`}
        className="absolute inset-0 h-full w-full object-cover"
        referrerPolicy="no-referrer"
        loading="eager"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/35 to-black/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/25" />

      <div className="relative flex min-h-[680px] flex-col justify-between p-5 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-xl border border-white/25 bg-white/90 px-3 py-1.5 text-xs font-black lowercase text-black shadow-lg">
              {tripType === 'round_trip' ? 'two ways' : 'one way'}
            </span>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-black/50 text-white backdrop-blur">
            <Compass className="h-6 w-6" />
          </div>
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-white/65">{secondaryName || 'Destination'}</p>
          <h1 className="mt-4 max-w-5xl text-6xl title-text leading-none text-white sm:text-7xl lg:text-8xl">
            {destinationName}
          </h1>
          <p className="mt-5 text-3xl title-text text-white/95 sm:text-5xl">{route}</p>
            <div className={`mt-7 grid max-w-4xl gap-3 sm:grid-cols-2 ${isRoundTrip ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
              <HeaderFact icon={CalendarDays} label="Departure" value={formatDate(plannerData?.departureDate)} dark />
              {isRoundTrip ? (
                <HeaderFact icon={PlaneLanding} label="Return" value={formatDate(plannerData?.returnDate)} dark />
              ) : null}
              <HeaderFact icon={Users} label="Travelers" value={getTravelerLabel(plannerData)} dark />
              <HeaderFact icon={CircleDollarSign} label="Budget" value={formatMoney(budget)} dark />
            </div>
        </div>
      </div>
    </section>
  );
}

function HeaderFact({ icon: Icon, label, value, dark = false }: { icon: any; label: string; value: string; dark?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3 ${dark ? 'border-white/20 bg-white/10 text-white backdrop-blur' : 'border-border bg-background/70'}`}>
      <Icon className={`h-4 w-4 ${dark ? 'text-white/70' : 'text-muted-foreground'}`} />
      <p className={`mt-2 text-[10px] font-black uppercase tracking-[0.14em] ${dark ? 'text-white/60' : 'text-muted-foreground'}`}>{label}</p>
      <p className={`mt-1 text-sm font-black ${dark ? 'text-white' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}

function ReadinessBar({ label, value, dark = false }: { label: string; value: number; dark?: boolean }) {
  return (
    <div>
      <div className={`mb-1 flex items-center justify-between text-xs font-semibold ${dark ? 'text-black/70' : 'text-muted-foreground'}`}>
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className={`h-2 overflow-hidden rounded-full ${dark ? 'bg-black/10' : 'bg-muted'}`}>
        <div className={`h-full rounded-full ${dark ? 'bg-black' : 'bg-foreground'}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function BudgetBreakdown({ breakdown, plannerData }: { breakdown: any; plannerData: any }) {
  const items = [
    { label: 'Flight budget', value: breakdown?.flights ?? plannerData?.flightBudget, color: 'bg-sky-500', icon: PlaneTakeoff, enabled: plannerData?.includeFlight !== false },
    { label: 'Hotel budget', value: breakdown?.hotels ?? plannerData?.hotelBudget, color: 'bg-violet-500', icon: Hotel, enabled: plannerData?.includeHotel !== false },
    { label: 'Transport budget', value: breakdown?.transport ?? plannerData?.transportBudget, color: 'bg-amber-500', icon: Bus, enabled: plannerData?.includeTransport !== false },
    { label: 'Daily expenses', value: breakdown?.dailyExpenses ?? plannerData?.dailyExpenseBudget, color: 'bg-emerald-500', icon: MapPin, enabled: plannerData?.includePlaceVisits !== false },
  ].filter(item => item.enabled);
  const allocated = items.reduce((sum, item) => sum + (asNumber(item.value) || 0), 0);
  const total = asNumber(breakdown?.totalBudget ?? plannerData?.totalBudget) || allocated || 0;

  return (
    <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="rounded-3xl border border-border bg-card p-5">
        <p className="small-caps">Budget Breakdown</p>
        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-muted text-foreground">
              <CircleDollarSign className="h-6 w-6" />
            </div>
            <p className="mt-5 text-4xl title-text text-foreground">{formatMoney(total)}</p>
            <p className="mt-1 text-sm text-muted-foreground">Budget Amount</p>
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
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-3xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-muted text-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-black text-foreground">{item.label}</p>
                </div>
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

export function FlightCard({ flight, index, travelerCount = 1, isExpanded, onToggle, onAddToTrip }: { flight: any; index: number; travelerCount?: number; isExpanded: boolean; onToggle: () => void; onAddToTrip?: () => void }) {
  const [activeSliceIndex, setActiveSliceIndex] = useState(0);
  const { slice, segments, first, last } = getFlightEndpoints(flight);
  const slices = Array.isArray(flight?.slices) && flight.slices.length > 0 ? flight.slices : [slice].filter(Boolean);
  const activeSlice = slices[Math.min(activeSliceIndex, slices.length - 1)] || slices[0];
  const activeEndpoints = getSliceEndpoints(activeSlice);
  const activeFirst = activeEndpoints.first;
  const activeLast = activeEndpoints.last;
  const activeSegments = activeEndpoints.segments;
  const price = getFlightPrice(flight);
  const perTravelerPrice = price && travelerCount > 1 ? price / travelerCount : null;
  const direct = slices.every((item: any) => (item?.segments || []).length <= 1);
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
  const flightNumbers = getFlightSegmentNumbers(flight);
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
  const carryOnStatus = getCarryOnStatus(flight);
  const carbon = first?.carbon_emissions || first?.carbonEmissions || flight?.carbon_emissions;

  return (
    <article
      onClick={onToggle}
      className="cursor-pointer rounded-3xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl"
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
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
              <h3 className="text-xl font-black text-foreground">{carrier}</h3>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                {(flightNumbers.length ? flightNumbers.join(' + ') : flightNumber)}{carrierCode ? ` / ${carrierCode}` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {index === 0 ? <Badge tone="green" strong><Sparkles className="h-4 w-4" />Best Value</Badge> : null}
            {index === 0 ? <Badge tone="amber" strong>Cheapest</Badge> : <Badge tone="blue" strong>Available</Badge>}
            {direct ? <Badge tone="blue" strong>Fastest</Badge> : null}
            {carryOnStatus ? <Badge tone={carryOnStatus.tone} strong>{carryOnStatus.prefix} {carryOnStatus.label}</Badge> : null}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_1.25fr_auto] md:items-stretch">
          <div className="rounded-2xl border border-border bg-background/60 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Depart</p>
            <p className="mt-1 text-xl font-black text-foreground">{formatTime(activeFirst?.departing_at)}</p>
            <p className="text-xs font-bold text-muted-foreground">{activeFirst?.origin?.iata_code || 'DEP'}</p>
          </div>
          <div className="rounded-2xl border border-border bg-background/60 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Arrive</p>
            <p className="mt-1 text-xl font-black text-foreground">{formatTime(activeLast?.arriving_at)}</p>
            <p className="text-xs font-bold text-muted-foreground">{activeLast?.destination?.iata_code || 'ARR'}</p>
          </div>
          <div className="rounded-2xl border border-border bg-background/60 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Duration</p>
            <p className="mt-1 text-xl font-black text-foreground">{formatDuration(activeSlice?.duration)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-background/60 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Stops</p>
            <p className="text-xs font-bold uppercase text-muted-foreground">
              {activeSegments.length <= 1 ? 'NONSTOP' : `${activeSegments.length - 1} stop${activeSegments.length === 2 ? '' : 's'}`}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background/60 p-3">
            <p className="text-3xl title-text text-foreground">{formatMoney(price)}</p>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Total fare</p>
            <div className="mt-2 flex justify-start">
              <CabinClassBadge cabin={cabin} />
            </div>
            {perTravelerPrice ? (
              <p className="mt-1 text-sm font-bold text-muted-foreground">
                {formatMoney(perTravelerPrice)} per traveler x {travelerCount}
              </p>
            ) : null}
            {onAddToTrip ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onAddToTrip?.(); }}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-foreground px-4 py-2 text-xs font-black transition hover:bg-foreground hover:text-background"
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                Add to trip
              </button>
            ) : null}
          </div>
          <div className="flex items-center justify-end">
            <ChevronDown className={`h-6 w-6 shrink-0 text-muted-foreground transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </div>

      <div className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${isExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'}`}>
      <div className="mt-5 space-y-4">
        {slices.length > 1 ? (
          <div className="grid gap-2 rounded-2xl border border-border bg-muted p-1 sm:grid-cols-2">
            {slices.map((flightSlice: any, sliceIndex: number) => {
              const label = sliceIndex === 0 ? 'Outbound' : 'Return';
              const Icon = sliceIndex === 0 ? PlaneTakeoff : PlaneLanding;
              const route = getSliceRouteCodes(flightSlice).join(' -> ');
              const active = activeSliceIndex === sliceIndex;

              return (
                <button
                  key={`${flightSlice?.id || 'slice'}-${label}-${sliceIndex}`}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setActiveSliceIndex(sliceIndex);
                  }}
                  className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition ${
                    active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:bg-background/70 hover:text-foreground'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-black">
                    <Icon className="h-4 w-4" />
                    {label}
                  </span>
                  <span className="text-xs font-bold">{route}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        <FlightLeg
          slice={activeSlice}
          label={slices.length > 1 ? (activeSliceIndex === 0 ? 'Outbound' : 'Return') : 'One-way'}
        />
      </div>
      </div>

    </article>
  );
}

function FlightLeg({ slice, label }: { slice: any; label: string }) {
  const { segments, first, last } = getSliceEndpoints(slice);
  const layovers = getLayovers(slice);
  const routeCodes = getSliceRouteCodes(slice);

  return (
    <div className="rounded-2xl border border-border bg-muted p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Badge strong>{label}</Badge>
          <span className="inline-flex items-center gap-2 rounded-xl border border-foreground/15 bg-background px-3 py-1.5 text-sm font-black text-foreground shadow-sm">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            {formatShortDate(first?.departing_at)}
          </span>
        </div>
        <span className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
          {segments.length <= 1 ? 'Nonstop' : `${segments.length - 1} transfer${segments.length === 2 ? '' : 's'}`}
        </span>
      </div>

      <div className="mb-4 rounded-2xl border border-border bg-card px-4 py-3">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Flight path</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {routeCodes.map((code, index) => (
            <div key={`${code}-${index}`} className="flex items-center gap-2">
              <span className="rounded-lg border border-border bg-background px-2.5 py-1 text-sm font-black text-foreground">{code}</span>
              {index < routeCodes.length - 1 ? <span className="h-px w-8 bg-border" /> : null}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <AirportTime code={first?.origin?.iata_code} name={first?.origin_name || first?.origin?.name} time={formatTime(first?.departing_at)} label="Depart" />
        <div className="hidden items-center gap-3 text-muted-foreground md:flex">
          <div className="h-px w-16 bg-border" />
          <div className="rounded-full border border-border bg-card px-3 py-1 text-xs font-black">
            {formatDuration(slice?.duration)}
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

      <div className="mt-4 space-y-3">
        {segments.map((segment: any, segmentIndex: number) => (
          <FlightSegmentDetails
            key={`${segment?.id || 'segment'}-${label}-${segmentIndex}`}
            segment={segment}
            segmentIndex={segmentIndex}
            totalSegments={segments.length}
          />
        ))}
      </div>
    </div>
  );
}

function FlightSegmentDetails({ segment, segmentIndex, totalSegments }: { segment: any; segmentIndex: number; totalSegments: number }) {
  const carrier = segment?.marketing_carrier?.name || 'Airline';
  const flightNumber = segment?.marketing_carrier_flight_number || 'Flight number TBA';
  const amenities = [
    ...(segment?.amenities || []),
    ...(segment?.airfare_details || []),
    ...(segment?.extensions || []),
  ].filter(Boolean);
  const amenitiesText = amenities.join(' ').toLowerCase();
  const hasUsb = amenitiesText.includes('usb');
  const hasWifi = amenitiesText.includes('wi-fi') || amenitiesText.includes('wifi');
  const hasVideo = amenitiesText.includes('video') || amenitiesText.includes('stream');
  const carryOnStatus = getCarryOnStatus({ slices: [{ segments: [segment] }] });

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
            {totalSegments > 1 ? `Segment ${segmentIndex + 1}` : 'Flight details'}
          </p>
          <p className="mt-1 text-sm font-black text-foreground">
            {carrier} {flightNumber}
          </p>
        </div>
        <p className="text-xs font-bold text-muted-foreground">
          {segment?.origin?.iata_code || 'DEP'} {'->'} {segment?.destination?.iata_code || 'ARR'}
        </p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Detail icon={Clock3} label="Flight time" value={formatDuration(segment?.duration)} />
        <Detail icon={PlaneTakeoff} label="Aircraft" value={segment?.aircraft_name || 'Aircraft TBA'} />
        <Detail icon={Ticket} label="Cabin" value={cabinLabel(segment?.cabin_class || 'economy')} />
        <Detail icon={BedDouble} label="Legroom" value={segment?.legroom || 'Legroom TBA'} />
        {carryOnStatus ? <Detail icon={Ticket} label="BAGGAGE" value={carryOnStatus.label} /> : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Amenity enabled={hasUsb} icon={Usb} label="USB" />
        <Amenity enabled={hasWifi} icon={Wifi} label="Wi-Fi" />
        <Amenity enabled={hasVideo} icon={Video} label="Video" />
        {!hasUsb && !hasWifi && !hasVideo ? <Badge strong>Limited amenity data</Badge> : null}
      </div>
    </div>
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

export function HotelCard({ hotel, suspicious, distanceKm, onAddToTrip }: { hotel: any; suspicious: boolean; distanceKm: number | null; onAddToTrip?: () => void }) {
  const photos = Array.isArray(hotel?.images) ? hotel.images : [];
  const amenities = Array.isArray(hotel?.amenities) ? hotel.amenities.slice(0, 6) : [];
  const nearby = Array.isArray(hotel?.nearbyPlaces) ? hotel.nearbyPlaces.slice(0, 3) : [];
  const nightlyPrice = asNumber(hotel?.price);
  const totalPrice = asNumber(hotel?.totalPrice);
  const priceIsEstimated = hotel?.priceSource === 'estimated';

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
                {suspicious ? <Badge tone="amber" strong><AlertTriangle className="h-4 w-4" />Location check</Badge> : <Badge tone="green" strong><BadgeCheck className="h-4 w-4" />Recommended</Badge>}
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
                    <p className="text-xs font-semibold text-muted-foreground">{priceIsEstimated ? 'estimated per night' : 'per night'}</p>
                  </>
                ) : null}
                {totalPrice ? (
                  <p className="mt-1 text-sm font-bold text-foreground">{formatMoney(totalPrice)} total{priceIsEstimated ? ' est.' : ''}</p>
                ) : null}
                {onAddToTrip ? (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onAddToTrip?.(); }}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-foreground px-4 py-2 text-xs font-black transition hover:bg-foreground hover:text-background sm:w-auto"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                    Add to trip
                  </button>
                ) : null}
              </div>
            ) : (
              <Badge tone="red" strong>Price unavailable</Badge>
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
            {amenities.length ? amenities.map((amenity: string) => <Badge key={amenity} strong>{amenity}</Badge>) : <Badge tone="red" strong>Amenities unavailable</Badge>}
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

function getTransportIcon(type: string) {
  if (type === 'metro_subway' || type === 'train') return <Train className="h-6 w-6" />;
  if (type === 'taxi' || type === 'rideshare_uber' || type === 'rental_car') return <CarFront className="h-6 w-6" />;
  return <Bus className="h-6 w-6" />;
}

function getTransportDetailItems(transport: any) {
  return [
    transport?.singleTicketPrice ? { label: 'Ticket', value: transport.singleTicketPrice } : null,
    transport?.dayPassPrice ? { label: 'Day pass', value: transport.dayPassPrice } : null,
    transport?.priceRange ? { label: 'Range', value: transport.priceRange } : null,
    transport?.pricingType ? { label: 'Pricing', value: transport.pricingType } : null,
    transport?.meterInfo ? { label: 'Meter', value: transport.meterInfo } : null,
    transport?.surgePricingNotes ? { label: 'Surge', value: transport.surgePricingNotes } : null,
    transport?.extraCosts ? { label: 'Extras', value: transport.extraCosts } : null,
    transport?.bestUseCase ? { label: 'Best for', value: transport.bestUseCase } : null,
  ].filter(Boolean).slice(0, 3) as { label: string; value: string }[];
}

export function TransportCard({ transport, selected = false }: { transport: any; selected?: boolean }) {
  const icon = getTransportIcon(transport?.id || transport?.transportType || transport?.type);
  const detailItems = getTransportDetailItems(transport);

  return (
    <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground text-background">
            {icon}
          </div>
          <div>
            <div className="flex flex-wrap gap-2">
              {selected ? <Badge tone="green" strong>Selected</Badge> : <Badge tone="blue" strong>Available</Badge>}
            </div>
            <h3 className="mt-3 text-xl font-black text-foreground">{transport?.displayName || transport?.operator || 'Ground transport'}</h3>
            <p className="mt-1 text-sm font-semibold capitalize text-muted-foreground">
              {(transport?.transportType || transport?.type || 'transport').replace(/_/g, ' ')}
            </p>
          </div>
        </div>
        <div className="md:text-right">
          <p className="text-3xl title-text text-foreground">{transport?.priceLabel || formatMoney(transport?.estimatedPrice ?? transport?.price ?? 70)}</p>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">estimated cost</p>
        </div>
      </div>
      <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
        {transport?.notes || transport?.travelTimeNotes || 'Check local provider details before booking.'}
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {detailItems.length ? detailItems.map(item => (
          <Detail key={item.label} icon={Ticket} label={item.label} value={item.value} />
        )) : (
          <>
            <Detail icon={Clock3} label="Timing" value={transport?.travelTimeNotes || transport?.duration || 'Varies'} />
            <Detail icon={Ticket} label="Price" value={transport?.priceLabel || 'Varies'} />
            <Detail icon={MapPin} label="Use case" value={transport?.bestUseCase || 'City travel'} />
          </>
        )}
      </div>
    </article>
  );
}

export function PlaceCard({ place }: { place: any }) {
  return (
    <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <MapPin className="h-5 w-5" />
        </div>
        <Badge tone="green" strong>{formatMoney(place?.estimatedCost ?? 0, 'Cost varies')}</Badge>
      </div>
      <h3 className="mt-4 text-lg font-black text-foreground">{place?.name || 'Place unavailable'}</h3>
      <p className="mt-2 min-h-16 text-sm leading-relaxed text-muted-foreground">{place?.description || 'Description unavailable from the current data source.'}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Badge tone="amber" strong><Star className="h-4 w-4" />{place?.rating ? `${place.rating}` : 'Rating N/A'}</Badge>
        <Badge strong>{place?.reviewsCount ? `${place.reviewsCount.toLocaleString()} reviews` : 'Reviews N/A'}</Badge>
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
        <Badge tone="amber" strong>+{formatMoney(option?.extraAmount || 0)}</Badge>
        <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-1" />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{option?.description || 'Unlock a more comfortable version of this itinerary.'}</p>
    </button>
  );
}

function getFlightLabel(flight: any) {
  const { first, last } = getFlightEndpoints(flight);
  const carrier = first?.marketing_carrier?.name || flight?.owner?.name || 'Flight option';
  const route = `${first?.origin?.iata_code || 'DEP'} -> ${last?.destination?.iata_code || 'ARR'}`;
  return { title: carrier, detail: route, price: getFlightPrice(flight) };
}

function getHotelLabel(hotel: any, plannerData: any) {
  return {
    title: hotel?.name || 'Hotel option',
    detail: `${getHotelStarCount(hotel) || 'Class'} star${hotel?.location ? ` / ${hotel.location}` : ''}`,
    price: getHotelStayPrice(hotel, plannerData),
  };
}

function getTransportLabel(option: any) {
  return {
    title: option?.displayName || option?.operator || option?.type || 'Transport option',
    detail: (option?.transportType || option?.type || option?.bestUseCase || 'Transport').replace(/_/g, ' '),
    price: asNumber(option?.estimatedPrice ?? option?.price ?? option?.totalPrice),
  };
}

function getPlaceLabel(place: any) {
  return {
    title: place?.name || 'Place option',
    detail: place?.description || 'Daily experience',
    price: asNumber(place?.estimatedCost ?? place?.price ?? place?.cost),
  };
}

function buildSummaryCartItems(selections: any, plannerData: any) {
  const items = [];
  const flight = plannerData?.includeFlight !== false ? selections.flights?.[0] : null;
  const hotel = plannerData?.includeHotel !== false ? selections.hotels?.[0] : null;

  if (flight) items.push({ type: 'flight', icon: 'flight', ...getFlightLabel(flight) });
  if (hotel) items.push({ type: 'hotel', icon: 'hotel', ...getHotelLabel(hotel, plannerData) });
  return items.map((item, index) => ({
    id: `${item.type}-${index}`,
    ...item,
    price: asNumber(item.price) || 0,
  }));
}

function SelectedOptionMiniCard({ icon: Icon, title, detail, price }: { icon: any; title: string; detail: string; price: number | null }) {
  return (
    <div className="rounded-2xl border border-border bg-background/80 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-foreground">{title}</p>
          <p className="mt-1 truncate text-xs font-semibold capitalize text-muted-foreground">{detail}</p>
        </div>
        <p className="shrink-0 text-sm font-black text-foreground">{formatMoney(price, 'Price varies')}</p>
      </div>
    </div>
  );
}

function SelectedOptionEmptyCard({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-background/60 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <p className="text-sm font-bold text-muted-foreground">No {label} option fit this budget yet.</p>
      </div>
    </div>
  );
}

function AISummary({ summary, destination, selections, plannerData }: { summary: any; destination: string; selections: any; plannerData: any }) {
  const router = useRouter();
  const cartItems = buildSummaryCartItems(selections, plannerData);
  const cartTotal = cartItems.reduce((sum, item) => sum + (asNumber(item.price) || 0), 0);
  const vibes = Array.isArray(plannerData?.vibes) ? plannerData.vibes.slice(0, 5) : [];

  const goToCart = () => {
    const cart = {
      tripTitle: summary?.title || `Trip to ${destination}`,
      destination,
      tripType: plannerData?.tripType,
      departureDate: plannerData?.departureDate,
      returnDate: plannerData?.returnDate,
      nights: plannerData?.nights,
      travelers: Math.max(1, (plannerData?.adults || 0) + (plannerData?.children || 0)),
      vibes,
      items: cartItems,
      total: cartTotal,
      createdAt: new Date().toISOString(),
    };
    window.localStorage.setItem('travelEliteCart', JSON.stringify(cart));
    window.localStorage.setItem('travelEliteCartAI', JSON.stringify(cart));
    router.push('/cart');
  };

  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="small-caps">AI Travel Summary</p>
              <h2 className="mt-2 text-3xl title-text text-foreground">
                {summary?.title || `Uncover the Hidden Gems of ${destination}`}
              </h2>
              <p className="mt-3 max-w-4xl text-base leading-relaxed text-muted-foreground">
                {summary?.description || `${destination} can work beautifully for a budget-conscious traveler when the flight and stay are selected with discipline. Prioritize transit-friendly neighborhoods, low-cost cultural stops, and one memorable paid experience so the trip feels full without stretching the budget.`}
              </p>
              {vibes.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {vibes.map((vibe: string) => <Badge key={vibe} tone="blue" strong>{vibe.replace(/_/g, ' ')}</Badge>)}
                </div>
              ) : null}
            </div>
            <div className="rounded-2xl border border-border bg-background/80 p-4 lg:min-w-56">
              <p className="small-caps">Cart total</p>
              <p className="mt-2 text-3xl title-text text-foreground">{formatMoney(cartTotal)}</p>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">{cartItems.length} selected item{cartItems.length === 1 ? '' : 's'}</p>
              <button
                type="button"
                onClick={goToCart}
                disabled={!cartItems.length}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground px-4 py-3 text-sm font-black text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ShoppingCart className="h-4 w-4" />
                Checkout
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        {plannerData?.includeFlight !== false && selections.flights.length === 0 ? <SelectedOptionEmptyCard icon={PlaneTakeoff} label="flight" /> : null}
        {plannerData?.includeFlight !== false && selections.flights.slice(0, 1).map((flight: any, index: number) => {
          const item = getFlightLabel(flight);
          return <SelectedOptionMiniCard key={`summary-flight-${index}`} icon={PlaneTakeoff} {...item} />;
        })}
        {plannerData?.includeHotel !== false && selections.hotels.length === 0 ? <SelectedOptionEmptyCard icon={Hotel} label="hotel" /> : null}
        {plannerData?.includeHotel !== false && selections.hotels.slice(0, 1).map((hotel: any, index: number) => {
          const item = getHotelLabel(hotel, plannerData);
          return <SelectedOptionMiniCard key={`summary-hotel-${index}`} icon={Hotel} {...item} />;
        })}
      </div>
    </section>
  );
}

export default function TripPlannerResults({ results, onUpsell, isUpselling, plannerData }: TripPlannerResultsProps) {
  const [activeSection, setActiveSection] = useState('overview');
  const [flightFilter, setFlightFilter] = useState('best');
  const [hotelFilter, setHotelFilter] = useState('recommended');
  const [placeFilter, setPlaceFilter] = useState('all');
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());

  const destination = getDestinationDisplay(results, plannerData);
  const budgetAgent = results?.budgetFitAgent;
  const fitPanelBackground = Array.isArray(results?.destinationImages)
    ? (results.destinationImages.find((image: any) => image?.original)?.original || results.destinationImages.find((image: any) => image?.thumbnail)?.thumbnail || '')
    : '';
  const sourceFlights = Array.isArray(results?.budgetSourceOptions?.flights) && results.budgetSourceOptions.flights.length
    ? results.budgetSourceOptions.flights
    : results?.flights || [];
  const sourceHotels = Array.isArray(results?.budgetSourceOptions?.hotels) && results.budgetSourceOptions.hotels.length
    ? results.budgetSourceOptions.hotels
    : results?.hotels || [];
  const budgetFlightCabins = normalizeBudgetFlightCabins(plannerData);
  const budgetHotelStars = normalizeBudgetHotelStars(plannerData);
  const appliedFlightCabin = budgetFlightCabins.includes('business') ? 'business' : budgetFlightCabins[0] || 'economy';
  const appliedHotelStar = budgetHotelStars.length ? Math.max(...budgetHotelStars) : 0;

  const flights = useMemo(() => {
    const cabinFiltered = [...sourceFlights].filter(flight => getFlightCabin(flight) === appliedFlightCabin);
    const matchedFlights = cabinFiltered.length ? cabinFiltered : [...sourceFlights];
    const pricedFlights = matchedFlights.filter(flight => getFlightPrice(flight) !== null);
    pricedFlights.sort((a, b) => {
      const aPrice = getFlightPrice(a) ?? Number.POSITIVE_INFINITY;
      const bPrice = getFlightPrice(b) ?? Number.POSITIVE_INFINITY;
      return aPrice - bPrice || getDurationMinutes(a) - getDurationMinutes(b);
    });
    if (flightFilter === 'cheapest') return pricedFlights.sort((a, b) => (getFlightPrice(a) ?? Infinity) - (getFlightPrice(b) ?? Infinity));
    if (flightFilter === 'fastest') return pricedFlights.sort((a, b) => getDurationMinutes(a) - getDurationMinutes(b));
    if (flightFilter === 'nonstop') return pricedFlights.filter(flight => getFlightEndpoints(flight).segments.length <= 1);
    return pricedFlights;
  }, [sourceFlights, appliedFlightCabin, flightFilter]);

  const hotels = useMemo(() => {
    const starFiltered = [...sourceHotels].filter(hotel => budgetHotelStars.includes(getHotelStarCount(hotel)));
    const matchedHotels = starFiltered.length ? starFiltered : [...sourceHotels];
    const withFlags = matchedHotels.map(hotel => ({
      hotel,
      suspicious: isHotelSuspicious(hotel, results, destination),
      distance: getHotelDistanceKm(hotel, results),
    }));
    if (hotelFilter === 'cheapest') return withFlags.sort((a, b) => (asNumber(a.hotel?.price ?? a.hotel?.totalPrice) ?? Infinity) - (asNumber(b.hotel?.price ?? b.hotel?.totalPrice) ?? Infinity));
    if (hotelFilter === 'location-check') return withFlags.filter(item => item.suspicious);
    return withFlags.sort((a, b) => Number(a.suspicious) - Number(b.suspicious));
  }, [sourceHotels, budgetHotelStars, results, destination, hotelFilter]);

  const flightBudgetInsight = useMemo(
    () => buildBudgetInsight(flights, Number(plannerData?.flightBudget) || 0, getFlightPrice),
    [flights, plannerData?.flightBudget]
  );
  const hotelBudgetInsight = useMemo(
    () => buildBudgetInsight(hotels.map(item => item.hotel), Number(plannerData?.hotelBudget) || 0, hotel => getHotelStayPrice(hotel, plannerData)),
    [hotels, plannerData]
  );

  const places = useMemo(() => {
    const all = [...(results?.placesToVisit || [])];
    if (placeFilter === 'popular') return all.filter(place => (place?.reviewsCount || 0) >= 1000);
    if (placeFilter === 'paid') return all.filter(place => (asNumber(place?.estimatedCost) || 0) > 0);
    return all;
  }, [results?.placesToVisit, placeFilter]);

  const transportOptions = useMemo(() => [...(results?.transport || [])].filter(option => option?.available !== false), [results?.transport]);
  const selectedTransportTypes = new Set(results?.selectedTransportTypes || []);
  const selectedTransport = transportOptions.filter(option => selectedTransportTypes.has(option?.id || option?.transportType || option?.type));
  const otherTransport = transportOptions.filter(option => !selectedTransportTypes.has(option?.id || option?.transportType || option?.type));
  const suspiciousHotelCount = hotels.filter(item => item.suspicious).length;
  const travelerCount = Math.max(1, (plannerData?.adults || 0) + (plannerData?.children || 0));

  if (!results) return null;

  const sectionTabs = [
    { id: 'overview', label: 'Overview' },
    plannerData?.includeFlight !== false ? { id: 'flights', label: 'Flights', count: flights.length } : null,
    plannerData?.includeHotel !== false ? { id: 'hotels', label: 'Hotels', count: hotels.length } : null,
    plannerData?.includeTransport !== false ? { id: 'transport', label: 'Transport', count: transportOptions.length } : null,
    plannerData?.includePlaceVisits !== false ? { id: 'places', label: 'Places', count: places.length } : null,
  ].filter(Boolean) as Tab[];

  const getFlightKey = (flight: any, index: number) => {
    const route = (flight?.slices || [])
      .map((slice: any) => (slice?.segments || [])
        .map((segment: any) => `${segment?.origin?.iata_code || 'DEP'}-${segment?.destination?.iata_code || 'ARR'}-${segment?.departing_at || ''}`)
        .join('_'))
      .join('|');
    return [
      flight?.id || 'flight',
      flight?.owner?.name || '',
      flight?.total_amount || '',
      route,
      index,
    ].join('-');
  };

  const summary = results?.aiSummary;
  const addToCart = (type: 'flight' | 'hotel', newItem: { title: string; detail: string; price: number | null }) => {
    try {
      const raw = localStorage.getItem('travelEliteCart');
      let cart = raw ? JSON.parse(raw) : null;
      if (!cart) {
        cart = {
          tripTitle: summary?.title || `Trip to ${destination}`,
          destination,
          tripType: plannerData?.tripType,
          departureDate: plannerData?.departureDate,
          returnDate: plannerData?.returnDate,
          nights: plannerData?.nights,
          travelers: Math.max(1, (plannerData?.adults || 0) + (plannerData?.children || 0)),
          vibes: [],
          items: [],
          total: 0,
          createdAt: new Date().toISOString(),
        };
      }
      const existingIndex = cart.items.findIndex((item: any) => item.type === type);
      if (existingIndex >= 0) {
        cart.items[existingIndex] = { ...cart.items[existingIndex], ...newItem, type };
      } else {
        cart.items.push({ type, icon: type, ...newItem });
      }
      cart.total = cart.items.reduce((sum: number, item: any) => sum + (item.price || 0), 0);
      localStorage.setItem('travelEliteCart', JSON.stringify(cart));
      window.dispatchEvent(new Event('storage'));
    } catch { return; }
  };

  const flightCards = flights.map((flight: any, index: number) => (
    <FlightCard
      key={getFlightKey(flight, index)}
      flight={flight}
      index={index}
      travelerCount={travelerCount}
      isExpanded={expandedCards.has(index)}
      onToggle={() => {
        setExpandedCards(prev => {
          const next = new Set(prev);
          if (next.has(index)) next.delete(index);
          else next.add(index);
          return next;
        });
      }}
      onAddToTrip={() => {
        const item = getFlightLabel(flight);
        addToCart('flight', item);
      }}
    />
  ));

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

          <BudgetFitPanel agent={budgetAgent} backgroundImage={fitPanelBackground} plannerData={plannerData} />
          <AISummary
            summary={results?.aiSummary}
            destination={destination}
            plannerData={plannerData}
            selections={{
              flights,
              hotels: hotels.map(item => item.hotel),
              transport: selectedTransport.length ? selectedTransport : transportOptions,
              places,
            }}
          />
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
          <BudgetDecisionPanel
            title="Flights"
            context={`${cabinLabel(appliedFlightCabin)} selected in budget`}
            insight={flightBudgetInsight}
          />
          <BudgetCategoryNotice agent={budgetAgent} categoryKey="flights" />
          {flightCards.length > 0 ? flightCards : (
            <BudgetEmptyState icon={PlaneTakeoff} title="No matching flight options" body="No live flight option matched the selected cabin and budget filters." category={budgetAgent?.categories?.flights} />
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
                { id: 'recommended', label: 'Recommended', count: hotels.length },
                { id: 'cheapest', label: 'Cheapest' },
                { id: 'location-check', label: 'Location Check', count: suspiciousHotelCount },
              ]}
            />
          </SectionHeader>
          <BudgetDecisionPanel
            title="Hotels"
            context={`${[...budgetHotelStars].sort((a, b) => a - b).join(', ') || 'Selected'}-star selected in budget`}
            insight={hotelBudgetInsight}
          />
          <BudgetCategoryNotice agent={budgetAgent} categoryKey="hotels" />
          {suspiciousHotelCount > 0 ? (
            <WarningBanner title="Some hotel locations look inconsistent">
              The hotel provider returned listings that appear outside {destination}. They remain visible for review, but they are marked before booking.
            </WarningBanner>
          ) : null}
          {hotels.length ? hotels.map(({ hotel, suspicious, distance }, index) => (
            <HotelCard
              key={`${hotel?.id || hotel?.name || 'hotel'}-${hotel?.price || ''}-${index}`}
              hotel={hotel}
              suspicious={suspicious}
              distanceKm={distance}
              onAddToTrip={() => {
                const totalPrice = asNumber(hotel?.totalPrice);
                const nightlyPrice = asNumber(hotel?.price);
                addToCart('hotel', {
                  title: hotel?.name || 'Hotel',
                  detail: `${hotel?.stars ? hotel.stars + ' star' : ''} / ${hotel?.city || hotel?.location || ''}`.trim().replace(/^\/\s*/, ''),
                  price: totalPrice || nightlyPrice || 0,
                });
              }}
            />
          )) : (
            <BudgetEmptyState icon={Hotel} title="No matching hotel options" body="No live hotel option matched the selected star category and budget filters." category={budgetAgent?.categories?.hotels} />
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
          <SectionHeader icon={Bus} eyebrow="Transport" title="Your selected transport" />
          <BudgetCategoryNotice agent={budgetAgent} categoryKey="transport" />
          {selectedTransport.length ? selectedTransport.map((transport: any, index: number) => (
            <TransportCard key={`${transport?.id || transport?.transportType || transport?.displayName || 'transport'}-selected-${index}`} transport={transport} selected />
          )) : (
            <BudgetEmptyState icon={Bus} title="No Gemini-selected transport fits" body="Gemini did not select a transport option for this budget." category={budgetAgent?.categories?.transport} />
          )}

          <SectionHeader icon={Compass} eyebrow="Alternatives" title="Other available options" />
          {otherTransport.length ? otherTransport.map((transport: any, index: number) => (
            <TransportCard key={`${transport?.id || transport?.transportType || transport?.displayName || 'transport'}-other-${index}`} transport={transport} />
          )) : (
            <EmptyState icon={Bus} title="No other options available" body="The selected transport choices cover the currently available destination options." />
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
                { id: 'popular', label: 'Popular' },
                { id: 'paid', label: 'Paid' },
              ]}
            />
          </SectionHeader>
          <BudgetCategoryNotice agent={budgetAgent} categoryKey="dailyExpenses" />
          {places.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {places.map((place, index) => <PlaceCard key={`${place?.name || 'place'}-${index}`} place={place} />)}
            </div>
          ) : (
            <BudgetEmptyState icon={MapPin} title="No Gemini-selected places fit" body="Gemini did not select a place or activity option for this budget." category={budgetAgent?.categories?.dailyExpenses} />
          )}
        </motion.section>
      )}
    </motion.div>
  );
}
