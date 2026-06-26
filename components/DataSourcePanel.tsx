'use client';

import { useCallback, useEffect, useState } from 'react';

export type DataSource = 'serpapi' | 'groq' | 'deepseek';
const STORAGE_KEY = 'travel_data_source';
const UPDATE_EVENT = 'travel-data-source-change';

function readStoredSource(): DataSource {
  if (typeof window === 'undefined') return 'serpapi';
  const value = localStorage.getItem(STORAGE_KEY);
  return value === 'groq' || value === 'deepseek' || value === 'serpapi' ? value : 'serpapi';
}

export function useDataSource() {
  const [mockSource, setSource] = useState<DataSource>('serpapi');

  useEffect(() => {
    const syncSource = () => setSource(readStoredSource());
    syncSource();
    window.addEventListener(UPDATE_EVENT, syncSource);
    return () => window.removeEventListener(UPDATE_EVENT, syncSource);
  }, []);

  const setMockSource = useCallback((source: DataSource) => {
    localStorage.setItem(STORAGE_KEY, source);
    setSource(source);
    window.dispatchEvent(new Event(UPDATE_EVENT));
  }, []);

  return { mockSource, setMockSource };
}

export default function DataSourcePanel() {
  const { mockSource, setMockSource } = useDataSource();
  const options: { id: DataSource; label: string; active: string }[] = [
    { id: 'serpapi', label: '📡 SerpAPI', active: 'bg-emerald-600 text-white' },
    { id: 'groq', label: '🤖 Groq', active: 'bg-violet-600 text-white' },
    { id: 'deepseek', label: '🤖 DeepSeek', active: 'bg-blue-600 text-white' },
  ];

  return (
    <aside className="fixed bottom-5 left-5 z-[60] w-[232px] rounded-2xl border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900">
      <p className="px-1 text-[10px] font-black uppercase tracking-[0.14em] text-gray-600 dark:text-gray-300">Flight &amp; Hotel Data Source</p>
      {mockSource !== 'serpapi' ? (
        <div className="mt-2 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">🧪 Mock Mode Active</div>
      ) : null}
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {options.map(option => (
          <button
            key={option.id}
            type="button"
            onClick={() => setMockSource(option.id)}
            className={`rounded-xl px-1.5 py-2 text-[10px] font-bold transition ${mockSource === option.id ? option.active : 'bg-gray-100 text-gray-700 hover:text-gray-950 dark:bg-gray-800 dark:text-gray-200 dark:hover:text-white'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </aside>
  );
}
