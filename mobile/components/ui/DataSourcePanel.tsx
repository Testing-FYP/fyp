import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  useDataSource,
  type AutocompleteProvider,
  type DataSource,
} from '@/context/DataSourceContext';
import { useTheme } from '@/hooks/useTheme';

export function DataSourcePanel() {
  const {
    autocompleteProvider,
    setAutocompleteProvider,
    dataSource,
    setDataSource,
  } = useDataSource();
  const { theme } = useTheme();

  const autocompleteOptions: { id: AutocompleteProvider; label: string }[] = [
    { id: 'serpapi', label: '📡 SerpAPI' },
    { id: 'duffel', label: '✈️ Duffel' },
  ];

  const dataSourceOptions: { id: DataSource; label: string }[] = [
    { id: 'serpapi', label: '📡 SerpAPI' },
    { id: 'groq', label: '🤖 Groq' },
    { id: 'deepseek', label: '🤖 DeepSeek' },
  ];

  const isMockMode = dataSource !== 'serpapi';

  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          shadowColor: theme.text,
        },
      ]}
    >
      <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
        AUTOCOMPLETE SOURCE
      </Text>
      <View style={styles.buttonRow}>
        {autocompleteOptions.map((opt) => {
          const isSelected = autocompleteProvider === opt.id;
          return (
            <Pressable
              key={opt.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              onPress={() => setAutocompleteProvider(opt.id)}
              style={({ pressed }) => [
                styles.optionButton,
                {
                  backgroundColor: isSelected ? theme.primary : theme.inputBg,
                  borderColor: theme.border,
                  opacity: pressed ? 0.78 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.optionText,
                  { color: isSelected ? theme.surface : theme.text },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text
        style={[
          styles.sectionLabel,
          { color: theme.textSecondary, marginTop: 10 },
        ]}
      >
        FLIGHT & HOTEL DATA
      </Text>
      {isMockMode ? (
        <Text
          style={[
            styles.mockBadge,
            { color: '#92400e', backgroundColor: '#fef3c7' },
          ]}
        >
          🧪 Mock Mode Active
        </Text>
      ) : null}
      <View style={styles.buttonRow}>
        {dataSourceOptions.map((opt) => {
          const isSelected = dataSource === opt.id;
          return (
            <Pressable
              key={opt.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              onPress={() => setDataSource(opt.id)}
              style={({ pressed }) => [
                styles.optionButton,
                {
                  backgroundColor: isSelected ? theme.primary : theme.inputBg,
                  borderColor: theme.border,
                  opacity: pressed ? 0.78 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.optionText,
                  { color: isSelected ? theme.surface : theme.text },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    width: 220,
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    zIndex: 200,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  optionButton: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  optionText: {
    fontSize: 10,
    fontWeight: '700',
  },
  mockBadge: {
    fontSize: 9,
    fontWeight: '800',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginBottom: 6,
    overflow: 'hidden',
  },
});
