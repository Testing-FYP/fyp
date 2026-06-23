'use client';

import { motion, AnimatePresence } from 'motion/react';
import { 
  Plane, 
  Clock, 
  ArrowRight, 
  BookmarkPlus, 
  ChevronRight, 
  Briefcase, 
  Hotel, 
  Bus, 
  MapPin, 
  Navigation,
  Circle,
  Dot,
  CheckCircle2,
  Calendar
} from 'lucide-react';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import { useState } from 'react';
import Image from 'next/image';
import BookingModal from './BookingModal';
import { useAuth } from '@/hooks/useAuth';

/**
 * Parses an ISO 8601 duration string (e.g. "PT8H30M", "P1DT6H20M")
 * into a clean, human-readable format like "8h 30m" or "1d 6h 20m".
 */
function formatDuration(iso: string): string {
  if (!iso) return '—';
  const upper = iso.toUpperCase();
  const dayMatch = upper.match(/(\d+)D/);
  const hourMatch = upper.match(/(\d+)H/);
  const minMatch = upper.match(/(\d+)M/);

  const days = dayMatch ? parseInt(dayMatch[1], 10) : 0;
  let hours = hourMatch ? parseInt(hourMatch[1], 10) : 0;
  const mins = minMatch ? parseInt(minMatch[1], 10) : 0;

  // Convert days to hours for simpler display when ≤ 2 days
  if (days > 0 && days <= 2) {
    hours += days * 24;
    return `${hours}h ${mins}m`;
  }
  if (days > 2) {
    return `${days}d ${hours}h ${mins}m`;
  }
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

interface FlightCardProps {
  offer: any;
}

export default function FlightCard({ offer }: FlightCardProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const { token } = useAuth();
  
  // Detect if this is a round-trip offer
  const isRoundTrip = offer.slices.length > 1;
  
  // Outbound Leg Data
  const outboundSlice = offer.slices[0];
  const outboundSegments = outboundSlice.segments;
  const firstOutbound = outboundSegments[0];
  const lastOutbound = outboundSegments[outboundSegments.length - 1];
  
  const depTime = parseISO(firstOutbound.departing_at);
  const arrTime = parseISO(lastOutbound.arriving_at);

  // Inbound Leg Data (if applicable)
  const inboundSlice = isRoundTrip ? offer.slices[1] : null;
  const inboundSegments = inboundSlice ? inboundSlice.segments : [];
  const firstInbound = inboundSegments.length > 0 ? inboundSegments[0] : null;
  const lastInbound = inboundSegments.length > 0 ? inboundSegments[inboundSegments.length - 1] : null;

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token) {
      alert('You must be signed in to save a trip.');
      return;
    }
    setIsSaving(true);
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${backendUrl}/api/trips`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: isRoundTrip 
            ? `Round Trip to ${lastOutbound.destination.iata_code}`
            : `Flight to ${lastOutbound.destination.iata_code}`,
          origin: firstOutbound.origin.iata_code,
          destination: lastOutbound.destination.iata_code,
          departure_date: firstOutbound.departing_at,
          passengers: offer.passengers.length,
          trip_type: 'flight'
        }),
      });
      if (response.ok) setIsSaved(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="group glass-card rounded-[32px] overflow-hidden border border-border shadow-sm hover:shadow-xl transition-all duration-500"
      >
        {/* 1. Summary Header (Clickable to Expand) */}
        <div 
          onClick={() => setIsExpanded(!isExpanded)}
          className="px-10 py-8 border-b border-border bg-foreground/[0.01] flex flex-col md:flex-row items-center justify-between gap-6 cursor-pointer hover:bg-foreground/[0.03] transition-colors"
        >
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 bg-white border border-border rounded-2xl flex items-center justify-center p-3 shadow-sm">
              <Image 
                src={firstOutbound.marketing_carrier.logo_symbol_url || `https://api.duffel.com/air/airline_logos/${firstOutbound.marketing_carrier.iata_code}.png`} 
                alt={firstOutbound.marketing_carrier.name}
                width={40}
                height={40}
                className="object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
                {format(depTime, 'HH:mm')}
                <span className="text-muted-foreground/30 font-light">—</span>
                {format(arrTime, 'HH:mm')}
                {arrTime < depTime && <span className="text-[10px] text-muted-foreground/40 translate-y-[-8px] font-bold">+1</span>}
                
                {isRoundTrip && (
                  <div className="ml-2 px-3 py-1 rounded-full bg-foreground text-background text-[9px] uppercase tracking-widest font-black flex items-center gap-2">
                    <ArrowRight className="w-2.5 h-2.5 rotate-180" /> Round Trip
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1.5 ">
                <div className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground">
                  {firstOutbound.marketing_carrier.name}
                </div>
                {isRoundTrip && firstInbound && (
                  <>
                    <div className="w-1 h-1 rounded-full bg-border" />
                    <div className="text-[10px] text-muted-foreground/60 font-medium">
                       Return: {format(parseISO(firstInbound.departing_at), 'dd MMM')}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center">
            <div className="text-sm font-bold text-foreground">
              {formatDuration(outboundSlice.duration)}
              {isRoundTrip && inboundSlice && (
                <span className="text-muted-foreground/40 font-normal ml-2">leg 1</span>
              )}
            </div>
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground/40 mt-1">
              <span>{firstOutbound.origin.iata_code}</span>
              <div className="w-8 h-px bg-border flex items-center justify-center">
                <div className="w-1 h-1 rounded-full bg-border" />
              </div>
              <span>{lastOutbound.destination.iata_code}</span>
            </div>
          </div>

          <div className="flex items-center gap-6 text-right">
            <div>
              <div className={`text-[10px] uppercase tracking-widest font-black ${outboundSegments.length > 1 ? 'text-amber-600' : 'text-foreground'}`}>
                {outboundSegments.length > 1 ? `${outboundSegments.length - 1} Stop${outboundSegments.length > 2 ? 's' : ''}` : 'Non-stop'}
              </div>
              {outboundSegments.length > 1 && (
                <div className="text-[10px] text-muted-foreground/60 mt-1 font-medium">
                  Via {outboundSegments[0].destination.iata_code}
                </div>
              )}
            </div>
            
            <motion.div
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={{ duration: 0.3 }}
              className="w-8 h-8 rounded-full bg-border/40 flex items-center justify-center text-muted-foreground hover:bg-border/60 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </motion.div>
          </div>
        </div>

        {/* 2. Detailed Timeline Body (Collapsible) */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="p-10 space-y-16">
                {offer.slices.map((slice: any, sliceIdx: number) => (
                  <div key={slice.id} className="space-y-10">
                    {/* Slice Title / Divider */}
                    <div className="flex items-center gap-6">
                      <div className="px-6 py-2.5 rounded-2xl bg-foreground text-background text-[10px] uppercase tracking-[0.2em] font-black shadow-lg shadow-foreground/10">
                        {sliceIdx === 0 ? 'Outbound Journey' : 'Return Journey'}
                      </div>
                      <div className="h-px flex-1 bg-border/50" />
                      <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground/40">
                         {formatDuration(slice.duration)}
                      </div>
                    </div>

                    <div className="space-y-10">
                      {slice.segments.map((seg: any, idx: number) => {
                        const depTime = parseISO(seg.departing_at);
                        const arrTime = parseISO(seg.arriving_at);
                        const isLast = idx === slice.segments.length - 1;
                        const nextSeg = !isLast ? slice.segments[idx + 1] : null;
                        
                        let layoverString = '';
                        if (nextSeg) {
                          const nextDep = parseISO(nextSeg.departing_at);
                          const diffMins = differenceInMinutes(nextDep, arrTime);
                          const hours = Math.floor(diffMins / 60);
                          const mins = diffMins % 60;
                          layoverString = `${hours.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m layover at ${seg.destination_name || seg.destination.name} (${seg.destination.iata_code})`;
                        }

                        return (
                          <div key={seg.id} className="relative">
                            {/* Vertical Timeline Visual */}
                            <div className="flex gap-10">
                              <div className="flex flex-col items-center">
                                <div className="w-3 h-3 rounded-full border-2 border-muted-foreground/20 bg-background z-10" />
                                <div className="flex-1 w-px border-l-2 border-dotted border-border my-2" />
                                <div className="w-3 h-3 rounded-full border-2 border-muted-foreground/20 bg-background z-10" />
                              </div>

                              <div className="flex-1 space-y-8">
                                {/* Departure Node */}
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                  <div>
                                    <div className="text-[11px] uppercase tracking-widest font-black text-muted-foreground mb-1">
                                      {format(depTime, 'EEE, dd MMM yyyy')}
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="text-xl font-bold text-foreground">{format(depTime, 'HH:mm')}</span>
                                      <span className="text-sm font-light text-muted-foreground">
                                        Depart from <span className="font-bold text-foreground">{seg.origin_name || seg.origin.name}</span> ({seg.origin.iata_code}), Terminal {seg.origin_terminal || '1'}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Flight Duration Row */}
                                <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/40 pl-2">
                                   Flight duration: {formatDuration(seg.duration)}
                                </div>

                                {/* Arrival Node */}
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                  <div>
                                    <div className="text-[11px] uppercase tracking-widest font-black text-muted-foreground mb-1">
                                      {format(arrTime, 'EEE, dd MMM yyyy')}
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="text-xl font-bold text-foreground">{format(arrTime, 'HH:mm')}</span>
                                      <span className="text-sm font-light text-muted-foreground">
                                        Arrive at <span className="font-bold text-foreground">{seg.destination_name || seg.destination.name}</span> ({seg.destination.iata_code}), Terminal {seg.destination_terminal || '1'}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Metadata Row */}
                                <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-border/50">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60">{(seg.cabin_class || 'economy').replace(/_/g, ' ')}</span>
                                  </div>
                                  <div className="w-1 h-1 rounded-full bg-border" />
                                  <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60">{seg.marketing_carrier_name || seg.marketing_carrier.name}</span>
                                  <div className="w-1 h-1 rounded-full bg-border" />
                                  <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60">{seg.aircraft_name || 'Airbus A321'}</span>
                                  <div className="w-1 h-1 rounded-full bg-border" />
                                  <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60">{seg.marketing_carrier_flight_number}</span>
                                  <div className="flex items-center gap-3 ml-auto">
                                    <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest font-black text-foreground">
                                       <Briefcase className="w-3 h-3 opacity-40" /> 1 Carry-on bag
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest font-black text-foreground">
                                       <Briefcase className="w-3 h-3 opacity-40 text-blue-500" /> {offer.baggage_metadata?.checked || 1} Checked bag
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Layover Badge (Conditional) */}
                            {!isLast && (
                              <div className="my-8 ml-[6px] pl-16 py-4 flex items-center">
                                <div className="px-5 py-2.5 rounded-full bg-muted border border-border flex items-center gap-3 shadow-sm">
                                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                                  <span className="text-[10px] uppercase tracking-widest font-black text-foreground">
                                    {layoverString}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 3. Price & Action Footer */}
        <div className="px-10 py-8 bg-muted/30 border-t border-border flex items-center justify-between">
          <div>
             <span className="text-[10px] uppercase tracking-[0.3em] font-black text-muted-foreground/40 block mb-1">Total Package Price</span>
             <div className="flex items-end gap-2">
               <span className="text-xs font-bold text-muted-foreground/40 mb-1">{offer.total_currency}</span>
               <span className="text-4xl title-text text-foreground">{(offer.display_price || parseFloat(offer.total_amount)).toLocaleString()}</span>
             </div>
          </div>

          <div className="flex items-center gap-4">
             <button 
                onClick={handleSave}
                disabled={isSaving || isSaved}
                className={`w-12 h-12 flex items-center justify-center rounded-2xl border transition-all ${isSaved ? 'bg-green-500/10 border-green-500/20 text-green-600' : 'bg-background border-border hover:border-foreground/30 text-muted-foreground hover:text-foreground'}`}
              >
                {isSaved ? <CheckCircle2 className="w-5 h-5" /> : <BookmarkPlus className="w-5 h-5" />}
              </button>
              <button 
                onClick={() => setShowModal(true)}
                className="btn-primary px-12 py-4 flex items-center gap-3"
              >
                <span className="text-[11px] uppercase tracking-[0.2em] font-black">Select Experience</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {showModal && (
          <BookingModal 
            offer={offer} 
            onClose={() => setShowModal(false)} 
          />
        )}
      </AnimatePresence>
    </>
  );
}
