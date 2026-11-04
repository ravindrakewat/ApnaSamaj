import React from 'react';
import { View } from 'react-native';

export function useSafeAreaInsets() {
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

export function SafeAreaProvider({ children }: { children: React.ReactNode }) {
  return children;
}

export function SafeAreaView({ children, style, ...props }: any) {
  return React.createElement(View, { style, ...props }, children);
}

