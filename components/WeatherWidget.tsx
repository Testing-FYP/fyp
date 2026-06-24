'use client';

import { useEffect, useMemo, useState } from 'react';
import { Cloud, Droplets } from 'lucide-react';

interface WeatherWidgetProps {
  lat: number;
  lon: number;
  city: string;
  country: string;
  departureDate?: string;
  returnDate?: string;
}

interface DayForecast {
  date: string;
  maxC: number;
  minC: number;
  weathercode: number;
  precipProb: number;
}

function getWeatherDetails(weathercode: number) {
  if (weathercode === 0) return { emoji: '☀️', label: 'Clear' };
  if ([1, 2, 3].includes(weathercode)) return { emoji: '⛅', label: 'Partly cloudy' };
  if ([45, 48].includes(weathercode)) return { emoji: '🌫️', label: 'Foggy' };
  if ([51, 53, 55, 61, 63, 65].includes(weathercode)) return { emoji: '🌧️', label: 'Rain' };
  if ([71, 73, 75, 77].includes(weathercode)) return { emoji: '❄️', label: 'Snow' };
  if ([80, 81, 82].includes(weathercode)) return { emoji: '🌦️', label: 'Showers' };
  if ([95, 96, 99].includes(weathercode)) return { emoji: '⛈️', label: 'Thunderstorm' };
  return { emoji: '🌡️', label: 'Mixed' };
}

export default function WeatherWidget({ lat, lon, city, country, departureDate, returnDate }: WeatherWidgetProps) {
  const [forecast, setForecast] = useState<DayForecast[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [unit, setUnit] = useState<'C' | 'F'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('weatherUnit') as 'C' | 'F') || 'C';
    }
    return 'C';
  });

  useEffect(() => {
    const controller = new AbortController();

    const loadForecast = async () => {
      setLoading(true);
      setError(false);

      try {
        const params = new URLSearchParams({
          latitude: String(lat),
          longitude: String(lon),
          daily: 'temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_mean',
          timezone: 'auto',
          forecast_days: '16',
        });
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Failed to load weather forecast');

        const data = await response.json();
        const days: DayForecast[] = data.daily.time.map((date: string, index: number) => ({
          date,
          maxC: data.daily.temperature_2m_max[index],
          minC: data.daily.temperature_2m_min[index],
          weathercode: data.daily.weathercode[index],
          precipProb: data.daily.precipitation_probability_mean[index],
        })).filter((day: DayForecast) => (
          day.maxC !== null &&
          day.maxC !== undefined &&
          day.minC !== null &&
          day.minC !== undefined &&
          !(day.maxC === 0 && day.minC === 0)
        ));
        setForecast(days);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadForecast();
    return () => controller.abort();
  }, [lat, lon]);

  const { displayedForecast, isOutsideForecastWindow } = useMemo(() => {
    if (!forecast || !departureDate || !returnDate) {
      return { displayedForecast: forecast, isOutsideForecastWindow: false };
    }

    const filteredForecast = forecast.filter(day => day.date >= departureDate && day.date <= returnDate);
    return filteredForecast.length
      ? { displayedForecast: filteredForecast, isOutsideForecastWindow: false }
      : { displayedForecast: forecast, isOutsideForecastWindow: true };
  }, [forecast, departureDate, returnDate]);

  const toDisplay = (c: number) =>
    unit === 'C' ? `${Math.round(c)}°C` : `${Math.round(c * 9 / 5 + 32)}°F`;

  const changeUnit = (newUnit: 'C' | 'F') => {
    setUnit(newUnit);
    localStorage.setItem('weatherUnit', newUnit);
  };

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Cloud size={16} className="text-muted-foreground" />
          <span className="ml-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">Weather Forecast</span>
        </div>
        <span className="text-sm font-semibold text-foreground">{city}, {country}</span>
      </div>

      <div className="mt-2 flex justify-end">
        <div className="flex gap-1">
          {(['C', 'F'] as const).map(option => (
            <button
              key={option}
              type="button"
              onClick={() => changeUnit(option)}
              className={`cursor-pointer rounded-full px-3 py-1 text-xs transition-colors ${
                unit === option ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
              }`}
            >
              °{option}
            </button>
          ))}
        </div>
      </div>
      {isOutsideForecastWindow ? (
        <p className="mt-1 text-right text-xs italic text-muted-foreground">Trip dates beyond forecast window · showing next 16 days</p>
      ) : null}

      {loading ? (
        <div className="mt-4 grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, index) => <div key={index} className="h-24 w-full animate-pulse rounded-2xl bg-muted" />)}
        </div>
      ) : error ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Could not load weather forecast.</p>
      ) : (
        <div className="mt-4 grid grid-cols-7 gap-2">
          {displayedForecast?.map(day => {
            const weather = getWeatherDetails(day.weathercode);
            return (
              <div key={day.date} title={weather.label} className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-background/60 p-3 text-center">
                <span className="text-xs text-muted-foreground">
                  {new Date(`${day.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                </span>
                <span className="text-2xl">{weather.emoji}</span>
                <span className="text-sm font-semibold text-foreground">{toDisplay(day.maxC)}</span>
                <span className="text-xs text-muted-foreground">{toDisplay(day.minC)}</span>
                <span className="flex items-center gap-0.5 text-xs text-blue-400"><Droplets size={10} />{day.precipProb}%</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
