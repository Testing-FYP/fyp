import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type AutocompleteProvider = 'serpapi' | 'duffel';
export type DataSource = 'serpapi' | 'groq' | 'deepseek';

const AUTOCOMPLETE_KEY = 'travel_autocomplete_provider';
const DATA_SOURCE_KEY = 'travel_data_source';

interface DataSourceContextValue {
  autocompleteProvider: AutocompleteProvider;
  setAutocompleteProvider: (provider: AutocompleteProvider) => void;
  dataSource: DataSource;
  setDataSource: (source: DataSource) => void;
}

const DataSourceContext = createContext<DataSourceContextValue | undefined>(undefined);

export function DataSourceProvider({ children }: PropsWithChildren) {
  const [autocompleteProvider, setAutocompleteProviderState] =
    useState<AutocompleteProvider>('serpapi');
  const [dataSource, setDataSourceState] = useState<DataSource>('groq');

  useEffect(() => {
    async function load() {
      try {
        const [storedAutocomplete, storedDataSource] = await Promise.all([
          AsyncStorage.getItem(AUTOCOMPLETE_KEY),
          AsyncStorage.getItem(DATA_SOURCE_KEY),
        ]);
        if (storedAutocomplete === 'duffel' || storedAutocomplete === 'serpapi') {
          setAutocompleteProviderState(storedAutocomplete);
        }
        if (
          storedDataSource === 'groq' ||
          storedDataSource === 'deepseek' ||
          storedDataSource === 'serpapi'
        ) {
          setDataSourceState(storedDataSource);
        }
      } catch {}
    }

    void load();
  }, []);

  const setAutocompleteProvider = useCallback((provider: AutocompleteProvider) => {
    setAutocompleteProviderState(provider);
    void AsyncStorage.setItem(AUTOCOMPLETE_KEY, provider);
  }, []);

  const setDataSource = useCallback((source: DataSource) => {
    setDataSourceState(source);
    void AsyncStorage.setItem(DATA_SOURCE_KEY, source);
  }, []);

  const value = useMemo(
    () => ({
      autocompleteProvider,
      setAutocompleteProvider,
      dataSource,
      setDataSource,
    }),
    [autocompleteProvider, setAutocompleteProvider, dataSource, setDataSource],
  );

  return (
    <DataSourceContext.Provider value={value}>{children}</DataSourceContext.Provider>
  );
}

export function useDataSource() {
  const ctx = useContext(DataSourceContext);
  if (!ctx) {
    throw new Error('useDataSource must be used inside DataSourceProvider');
  }
  return ctx;
}
