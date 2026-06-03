'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Plane, Loader2 } from 'lucide-react';

interface AirportSuggestion {
  id: string;
  name: string;
  iata_code: string;
  city_name: string;
  country_name: string;
}

interface AirportAutocompleteProps {
  value: string;
  onSelect: (iata: string) => void;
  onSelectSuggestion?: (suggestion: AirportSuggestion) => void;
  placeholder: string;
}

export default function AirportAutocomplete({ value, onSelect, onSelectSuggestion, placeholder }: AirportAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<AirportSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (query.length < 2) {
        setSuggestions([]);
        return;
      }
      setIsLoading(true);
      try {
        const res = await fetch(`/api/airports/suggestions?query=${encodeURIComponent(query)}`);
        const data = await res.json();
        setSuggestions(data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timeoutId);
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative group">
        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-foreground transition-colors z-10" />
        <input 
          type="text" 
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="w-full bg-muted border border-border rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:border-foreground/20 focus:bg-muted/80 transition-all text-foreground"
          placeholder={placeholder}
        />
        {isLoading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
          </div>
        )}
      </div>
      <AnimatePresence>
        {isOpen && suggestions.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            className="absolute top-full left-0 right-0 mt-4 bg-background border border-border rounded-[32px] overflow-hidden z-[999] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.4)] backdrop-blur-3xl"
          >
            <div className="max-h-[340px] overflow-y-auto py-4 px-3">
              <div className="px-4 pb-3 mb-2 border-b border-border">
                <span className="small-caps !text-[9px] !text-muted-foreground">Suggestions</span>
              </div>
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onSelect(s.iata_code);
                    onSelectSuggestion?.(s);
                    setQuery(`${s.city_name} (${s.iata_code})`);
                    setIsOpen(false);
                  }}
                  className="w-full px-4 py-4 text-left hover:bg-muted rounded-2xl flex items-center justify-between transition-all group mb-1 last:mb-0"
                >
                  <div className="flex items-center gap-5">
                    <div className="w-11 h-11 rounded-2xl bg-muted flex items-center justify-center group-hover:bg-foreground/5 transition-all duration-500 group-hover:scale-105">
                      <Plane className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                    <div>
                      <div className="font-bold text-[15px] text-foreground/80 group-hover:text-foreground transition-colors">{s.city_name}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] mt-1 font-semibold">{s.name}</div>
                    </div>
                  </div>
                  <div className="bg-muted px-3 py-2 rounded-xl text-[11px] font-bold text-muted-foreground border border-border group-hover:border-foreground/10 group-hover:text-foreground/60 transition-all font-mono">
                    {s.iata_code}
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
