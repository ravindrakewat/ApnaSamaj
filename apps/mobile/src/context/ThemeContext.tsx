import React, { createContext, useContext } from 'react';
import { theme, Theme } from '../theme';

interface ThemeContextType {
  theme: Theme;
}

const ThemeContext = createContext<ThemeContextType>({ theme });

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <ThemeContext.Provider value={{ theme }}>{children}</ThemeContext.Provider>;
};

export function useTheme(): Theme {
  const context = useContext(ThemeContext);
  return context.theme;
}

