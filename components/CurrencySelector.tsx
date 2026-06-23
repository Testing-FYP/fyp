'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useCurrency } from '@/context/CurrencyContext';

export default function CurrencySelector() {
  const { currency, symbol, rates, setCurrency } = useCurrency();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectorRef = useRef<HTMLDivElement>(null);

  const currencies = useMemo(
    () => Object.keys(rates).sort((a, b) => a.localeCompare(b)),
    [rates],
  );
  const filteredCurrencies = useMemo(
    () => currencies.filter(code => code.toLowerCase().includes(query.trim().toLowerCase())),
    [currencies, query],
  );

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!selectorRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const chooseCurrency = (code: string) => {
    setCurrency(code);
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div ref={selectorRef} className="relative">
      <button
        type="button"
        aria-label="Display currency"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(open => !open)}
        className="flex items-center gap-1.5 rounded-xl border border-border bg-background/80 px-3 py-2 text-xs font-bold tracking-wide text-foreground transition hover:border-foreground/30"
      >
        <span className="text-muted-foreground">{symbol}</span>
        <span>{currency}</span>
        <span className="text-[9px] text-muted-foreground">⌄</span>
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-full z-[80] mt-2 w-48 overflow-hidden rounded-xl border border-border bg-background shadow-xl">
          <div className="border-b border-border p-2">
            <label className="flex items-center gap-2 rounded-lg bg-muted px-2.5 py-2 text-muted-foreground">
              <Search className="h-3.5 w-3.5" />
              <input
                autoFocus
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search currency"
                className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
          </div>
          <div role="listbox" aria-label="Currencies" className="max-h-60 overflow-y-auto p-1.5">
            {filteredCurrencies.length ? filteredCurrencies.map(code => (
              <button
                key={code}
                type="button"
                role="option"
                aria-selected={code === currency}
                onClick={() => chooseCurrency(code)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                  code === currency ? 'bg-foreground text-background' : 'text-foreground hover:bg-muted'
                }`}
              >
                <span>{code}</span>
              </button>
            )) : (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">No matching currency</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
