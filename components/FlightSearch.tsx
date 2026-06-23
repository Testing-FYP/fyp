'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, MapPin, Calendar, Plus, X, Plane, ArrowRight, Minus, AlertCircle, TriangleAlert, ChevronDown, Loader2 } from 'lucide-react';
import AirportAutocomplete from './AirportAutocomplete';

interface AirportSuggestion {
  id: string;
  name: string;
  iata_code: string;
  city_name: string;
  country_name: string;
}

interface Slice {
  origin: string;
  destination: string;
  departure_date: string;
  originName?: string;
  destinationName?: string;
}

interface FlightSearchProps {
  onSearch: (params: any) => void;
  isLoading: boolean;
}

type TripType = 'one_way' | 'round_trip' | 'multi_city';

export default function FlightSearch({ onSearch, isLoading }: FlightSearchProps) {
  const [tripType, setTripType] = useState<TripType>('one_way');
  const [slices, setSlices] = useState<Slice[]>([
    { origin: '', destination: '', departure_date: '' }
  ]);
  const [returnDate, setReturnDate] = useState('');

  useEffect(() => {
    setSlices(currentSlices => currentSlices.map((slice, index) =>
      index === 0 && !slice.departure_date
        ? { ...slice, departure_date: new Date().toISOString().split('T')[0] }
        : slice
    ));
  }, []);

  const addSlice = () => {
    const lastSlice = slices[slices.length - 1];
    setSlices([...slices, { 
      origin: lastSlice.destination, 
      destination: '', 
      departure_date: lastSlice.departure_date 
    }]);
  };

  const removeSlice = (index: number) => {
    if (slices.length > 1) {
      setSlices(slices.filter((_, i) => i !== index));
    }
  };

  const updateSlice = (index: number, field: keyof Slice, value: string) => {
    const newSlices = [...slices];
    newSlices[index] = { ...newSlices[index], [field]: value };
    setSlices(newSlices);
  };

  const [includeHotels, setIncludeHotels] = useState(false);
  const [includeBuses, setIncludeBuses] = useState(false);
  const [maxBudget, setMaxBudget] = useState(5000);

  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [baggage, setBaggage] = useState(0);

  const [validationError, setValidationError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [isPassengerPopoverOpen, setIsPassengerPopoverOpen] = useState(false);
  const passengerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (passengerRef.current && !passengerRef.current.contains(event.target as Node)) {
        setIsPassengerPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!slices[0].origin || !slices[0].destination) {
      setValidationError('Origin and Destination cities are required before searching.');
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      setTimeout(() => setValidationError(null), 4000);
      return;
    }
    
    let finalSlices = [...slices];
    if (tripType === 'round_trip' && returnDate) {
      finalSlices.push({
        origin: slices[0].destination,
        destination: slices[0].origin,
        departure_date: returnDate
      });
    }

    const passengers = [
      ...Array(adults).fill(null).map((_, i) => ({ 
        type: 'adult',
        // Distribute baggage among adults
        baggage_options: i < baggage ? [{ type: 'checked', quantity: 1 }] : []
      })),
      ...Array(children).fill(null).map(() => ({ type: 'child' })),
      ...Array(infants).fill(null).map(() => ({ type: 'infant_without_seat' }))
    ];

    onSearch({ 
      slices: finalSlices.map(s => ({
        origin: s.origin,
        destination: s.destination,
        departure_date: s.departure_date
      })),
      passengers,
      baggage,
      includeHotels,
      includeBuses,
      maxBudget
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0, x: isShaking ? [-10, 10, -10, 10, -5, 5, 0] : 0 }}
      transition={{ delay: isShaking ? 0 : 0.2, duration: isShaking ? 0.4 : 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="w-full glass-card p-1 md:p-2 rounded-[40px] relative"
    >
      <AnimatePresence>
        {validationError && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="absolute -top-4 md:-top-6 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center gap-3 bg-[#e53e3e] text-white px-6 py-3 md:py-4 rounded-xl shadow-2xl min-w-[340px] md:min-w-[420px]"
          >
            <AlertCircle className="w-4 h-4 md:w-5 md:h-5 shrink-0" />
            <span className="text-xs md:text-sm font-medium">{validationError}</span>
            <TriangleAlert className="w-4 h-4 md:w-5 md:h-5 shrink-0 ml-auto" />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-6 md:p-10 space-y-8">
        <div className="flex flex-wrap gap-8 border-b border-border pb-6">
          <div className="flex gap-8">
            {(['one_way', 'round_trip', 'multi_city'] as TripType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setTripType(type);
                  if (type !== 'multi_city') setSlices([slices[0]]);
                }}
                className={`small-caps transition-all relative px-6 py-2.5 rounded-full text-[10px] font-bold tracking-[0.15em] ${tripType === type ? 'text-background' : 'text-muted-foreground hover:text-foreground/70'}`}
              >
                <span className="relative z-10">{type.replace('_', ' ')}</span>
                {tripType === type && (
                  <motion.div 
                    layoutId="activeTab"
                    className="absolute inset-0 bg-foreground rounded-full shadow-[0_8px_16px_-4px_rgba(0,0,0,0.3)]"
                    transition={{ type: 'spring', bounce: 0.25, duration: 0.6 }}
                  />
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-6 ml-auto">
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className={`w-5 h-5 rounded-md border transition-all flex items-center justify-center ${includeHotels ? 'bg-foreground border-foreground' : 'border-border group-hover:border-foreground/40'}`}>
                {includeHotels && <Search className="w-3 h-3 text-background" />}
              </div>
              <input type="checkbox" className="hidden" checked={includeHotels} onChange={(e) => setIncludeHotels(e.target.checked)} />
              <span className="small-caps !text-[9px] text-muted-foreground group-hover:text-foreground/70 transition-colors">Include Hotels</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className={`w-5 h-5 rounded-md border transition-all flex items-center justify-center ${includeBuses ? 'bg-foreground border-foreground' : 'border-border group-hover:border-foreground/40'}`}>
                {includeBuses && <Search className="w-3 h-3 text-background" />}
              </div>
              <input type="checkbox" className="hidden" checked={includeBuses} onChange={(e) => setIncludeBuses(e.target.checked)} />
              <span className="small-caps !text-[9px] text-muted-foreground group-hover:text-foreground/70 transition-colors">Include Buses</span>
            </label>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {slices.map((slice, index) => (
            <div key={index} className="relative grid grid-cols-1 md:grid-cols-12 gap-6 items-end z-30">
              <div className="md:col-span-4 space-y-3">
                <label className="small-caps ml-1">Origin</label>
                <AirportAutocomplete 
                  value={slice.origin}
                  onSelect={(iata) => updateSlice(index, 'origin', iata)}
                  placeholder="Departure City"
                />
              </div>

              <div className="md:col-span-4 space-y-3">
                <label className="small-caps ml-1">Destination</label>
                <AirportAutocomplete 
                  value={slice.destination}
                  onSelect={(iata) => updateSlice(index, 'destination', iata)}
                  placeholder="Arrival City"
                />
              </div>

              <div className={`${tripType === 'round_trip' ? 'md:col-span-2' : 'md:col-span-3'} space-y-3`}>
                <label className="small-caps ml-1">{tripType === 'multi_city' ? `Flight ${index + 1}` : 'Date'}</label>
                <div className="relative group">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-foreground transition-colors" />
                  <input 
                    type="date" 
                    value={slice.departure_date}
                    onChange={(e) => updateSlice(index, 'departure_date', e.target.value)}
                    className="w-full bg-muted border border-border rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:border-foreground/20 focus:bg-muted/80 transition-all text-foreground"
                  />
                </div>
              </div>

              {tripType === 'round_trip' && index === 0 && (
                <div className="md:col-span-2 space-y-3">
                  <label className="small-caps ml-1">Return</label>
                  <div className="relative group">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-foreground transition-colors" />
                    <input 
                      type="date" 
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                      className="w-full bg-muted border border-border rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:border-foreground/20 focus:bg-muted/80 transition-all text-foreground"
                    />
                  </div>
                </div>
              )}

              {tripType === 'multi_city' && (
                <div className="md:col-span-1 flex justify-end">
                  {slices.length > 1 && (
                    <button 
                      type="button"
                      onClick={() => removeSlice(index)}
                      className="p-4 rounded-2xl bg-red-500/5 text-red-500/60 hover:bg-red-500/10 hover:text-red-500 transition-all border border-red-500/10"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          <div className="flex flex-col md:flex-row justify-between items-start gap-12 pt-8">
            <div className="flex-1 w-full space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 md:gap-8">
                {/* Redesigned Passenger Picker */}
                <div className="w-full md:col-span-2 relative" ref={passengerRef}>
                  <label className="small-caps ml-1 mb-2 block">Passengers</label>
                  <button 
                    type="button" 
                    onClick={() => setIsPassengerPopoverOpen(!isPassengerPopoverOpen)}
                    className={`w-full bg-white border rounded-2xl h-[72px] px-6 flex items-center justify-between transition-all duration-300 ${isPassengerPopoverOpen ? 'border-[#8B5CF6] ring-2 ring-[#8B5CF6]/20' : 'border-black hover:border-[#8B5CF6]'}`}
                  >
                    <span className="text-base font-medium text-black">
                      {adults} {adults === 1 ? 'adult' : 'adults'}
                      {children > 0 && `, ${children} ${children === 1 ? 'child' : 'children'}`}
                    </span>
                    <ChevronDown className={`w-5 h-5 text-black transition-transform duration-300 ${isPassengerPopoverOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {isPassengerPopoverOpen && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute bottom-full left-0 right-0 mb-4 bg-white border border-border rounded-3xl shadow-[0_40px_80px_-20px_rgba(0,0,0,0.15)] p-6 z-[100] min-w-[300px]"
                      >
                        <div className="space-y-8">
                          {/* Adults Row */}
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-lg font-bold text-black">Adults</div>
                              <div className="text-sm text-muted-foreground">18+</div>
                            </div>
                            <div className="flex items-center gap-6">
                              <button 
                                type="button" 
                                onClick={() => setAdults(Math.max(1, adults - 1))}
                                disabled={adults <= 1}
                                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${adults <= 1 ? 'bg-[#C4C4C4] text-white cursor-not-allowed' : 'bg-[#C4C4C4] text-white hover:bg-black'}`}
                              >
                                <Minus className="w-5 h-5" />
                              </button>
                              <span className="text-xl font-bold text-black min-w-[20px] text-center">{adults}</span>
                              <button 
                                type="button" 
                                onClick={() => setAdults(adults + 1)}
                                className="w-10 h-10 rounded-lg bg-black text-white hover:bg-black/80 flex items-center justify-center transition-all"
                              >
                                <Plus className="w-5 h-5" />
                              </button>
                            </div>
                          </div>

                          <div className="h-px bg-border/50" />

                          {/* Children Row */}
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-lg font-bold text-black">Children</div>
                              <div className="text-sm text-muted-foreground">0—17</div>
                            </div>
                            <div className="flex items-center gap-6">
                              <button 
                                type="button" 
                                onClick={() => setChildren(Math.max(0, children - 1))}
                                disabled={children <= 0}
                                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${children <= 0 ? 'bg-[#C4C4C4] text-white cursor-not-allowed' : 'bg-[#C4C4C4] text-white hover:bg-black'}`}
                              >
                                <Minus className="w-5 h-5" />
                              </button>
                              <span className="text-xl font-bold text-black min-w-[20px] text-center">{children}</span>
                              <button 
                                type="button" 
                                onClick={() => setChildren(children + 1)}
                                className="w-10 h-10 rounded-lg bg-black text-white hover:bg-black/80 flex items-center justify-center transition-all"
                              >
                                <Plus className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="w-full text-center md:col-span-1">
                  <div className="bg-white border border-black rounded-[28px] p-1 h-[72px]">
                    <div className="px-6 h-full flex flex-col justify-center">
                      <div className="text-[10px] text-black uppercase tracking-[0.15em] font-bold">Baggage</div>
                      <div className="flex items-center justify-between mt-1 max-w-[140px] mx-auto w-full">
                        <button type="button" onClick={() => setBaggage(Math.max(0, baggage - 1))} className="w-8 h-8 rounded-full bg-white border border-black flex items-center justify-center hover:bg-black hover:text-white transition-all duration-300">
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="text-base font-bold text-black">{baggage}</span>
                        <button type="button" onClick={() => setBaggage(baggage + 1)} className="w-8 h-8 rounded-full bg-white border border-black flex items-center justify-center hover:bg-black hover:text-white transition-all duration-300">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="w-full space-y-4 md:col-span-2">
                  <div className="bg-white border border-black rounded-[28px] px-8 h-[72px] flex items-center justify-center gap-3 md:gap-4 overflow-hidden">
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-black uppercase tracking-[0.15em] font-bold leading-tight">Max</span>
                      <span className="text-[10px] text-black uppercase tracking-[0.15em] font-bold leading-tight">Budget</span>
                    </div>
                    <span className="text-xl md:text-2xl font-bold text-black font-mono leading-none tracking-tight">${maxBudget.toLocaleString()}</span>
                  </div>
                  <div className="px-4">
                    <input 
                      type="range" 
                      min="100" 
                      max="10000" 
                      step="100"
                      value={maxBudget}
                      onChange={(e) => setMaxBudget(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-black/5 rounded-lg appearance-none cursor-pointer accent-[#0066FF] hover:accent-[#0055DD] transition-all duration-300 border border-black/5"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              {tripType === 'multi_city' && slices.length < 5 && (
                <button 
                  type="button"
                  onClick={addSlice}
                  className="nav-pill flex items-center gap-2 py-3 px-6"
                >
                  <Plus className="w-4 h-4" />
                  Add Flight
                </button>
              )}
            </div>

            <button 
              type="submit" 
              disabled={isLoading}
              className="btn-primary group relative w-full md:w-auto min-w-[160px] py-2 px-4 flex items-center justify-center gap-2.5 disabled:opacity-50 overflow-hidden shadow-[0_10px_20px_-10px_rgba(0,0,0,0.3)] dark:shadow-[0_10px_20px_-10px_rgba(0,0,0,0.5)]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-background/20 border-t-background rounded-full animate-spin" />
              ) : (
                <>
                  <div className="relative flex items-center justify-center w-6 h-6 rounded-full bg-background/10 group-hover:bg-background/20 transition-all duration-500 group-hover:rotate-12 border border-background/5">
                    <Search className="w-3 h-3 text-background" />
                  </div>
                  <span className="relative uppercase tracking-[0.2em] text-[9px] font-black text-background/90 group-hover:text-background transition-colors leading-none">Search Flights</span>
                  <div className="relative flex items-center justify-center w-6 h-6 rounded-full border border-background/10 group-hover:border-background/30 transition-all duration-500">
                    <ArrowRight className="w-3 h-3 text-background group-hover:translate-x-1 transition-transform" />
                  </div>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}
