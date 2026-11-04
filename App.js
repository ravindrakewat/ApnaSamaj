import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

console.warn(
  '\n⚠️ [Apna Samaj Monorepo] Expo Metro was started from the monorepo root directory.\n' +
  'To run the full Apna Samaj Mobile App with Expo Router, please run:\n\n' +
  '   cd apps/mobile && npx expo start --web\n' +
  '   OR from root: npm run dev:mobile:web\n'
);

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.badge}>MONOREPO ROOT NOTICE</Text>
      <Text style={styles.title}>Apna Samaj Mobile</Text>
      <Text style={styles.description}>
        Expo was started from the monorepo root folder instead of the mobile workspace.
      </Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Run this command to start the mobile app:</Text>
        <Text style={styles.command}>cd apps/mobile && npx expo start --web</Text>
        <Text style={styles.orText}>— OR from root —</Text>
        <Text style={styles.command}>npm run dev:mobile:web</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 24,
  },
  badge: {
    backgroundColor: '#f59e0b',
    color: '#000000',
    fontSize: 12,
    fontWeight: 'bold',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: 480,
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#1e293b',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
    maxWidth: 480,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardTitle: {
    fontSize: 14,
    color: '#cbd5e1',
    marginBottom: 12,
    fontWeight: '600',
  },
  command: {
    backgroundColor: '#0f172a',
    color: '#38bdf8',
    fontSize: 15,
    fontFamily: 'monospace',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38bdf8',
    textAlign: 'center',
    width: '100%',
    fontWeight: 'bold',
  },
  orText: {
    color: '#64748b',
    fontSize: 12,
    marginVertical: 8,
    fontWeight: '600',
  },
});

