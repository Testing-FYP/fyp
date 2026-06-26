'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

type CurrencyContextValue = {
  currency: string;
  symbol: string;
  rates: Record<string, number>;
  setCurrency: (currency: string) => void;
  convertFromUSD: (amountInUSD: number) => string;
};

const fallbackRates: Record<string, number> = { USD: 1 };
const CurrencyContext = createContext<CurrencyContextValue | null>(null);
let activeCurrency = 'USD';
let activeRates: Record<string, number> = fallbackRates;

function currencySymbol(currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).formatToParts(0).find(part => part.type === 'currency')?.value || currency;
}

function formatAmount(amountInUSD: number, currency: string, rates: Record<string, number>) {
  const amount = Number(amountInUSD) || 0;
  const converted = amount * (rates[currency] || 1);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: Number.isInteger(converted) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(converted) ? 0 : 2,
  }).format(converted);
}

// Used by display helpers defined outside React components. Their parent components
// still subscribe with useCurrency(), so they update when the selection changes.
export function formatFromUSD(amountInUSD: number) {
  return formatAmount(amountInUSD, activeCurrency, activeRates);
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState('USD');
  const [rates, setRates] = useState<Record<string, number>>(fallbackRates);

  activeCurrency = currency;
  activeRates = rates;

  useEffect(() => {
    const savedCurrency = localStorage.getItem('travel_currency');
    const apiKey = process.env.NEXT_PUBLIC_EXCHANGE_RATE_API_KEY;
    if (!apiKey) return;

    fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`)
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Rates unavailable')))
      .then(data => {
        const fetchedRates = data?.conversion_rates;
        if (data?.result === 'success' && fetchedRates?.USD && typeof fetchedRates === 'object') {
          setRates(fetchedRates);
          setCurrencyState(savedCurrency && fetchedRates[savedCurrency] ? savedCurrency : 'USD');
        }
      })
      .catch(() => {
        // Keep USD as the silent, reliable fallback when rates cannot be loaded.
      });
  }, []);

  const setCurrency = (nextCurrency: string) => {
    const availableCurrency = rates[nextCurrency] ? nextCurrency : 'USD';
    setCurrencyState(availableCurrency);
    localStorage.setItem('travel_currency', availableCurrency);
  };

  const value = useMemo(() => ({
    currency,
    symbol: currencySymbol(currency),
    rates,
    setCurrency,
    convertFromUSD: (amountInUSD: number) => formatAmount(amountInUSD, currency, rates),
  }), [currency, rates]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error('useCurrency must be used inside CurrencyProvider');
  return context;
}
