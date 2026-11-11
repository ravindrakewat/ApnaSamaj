export const useRouter = () => ({
  push: () => {},
  replace: () => {},
  back: () => {},
  canGoBack: () => true,
  setParams: () => {},
});

export const useSegments = () => [];
export const useLocalSearchParams = () => ({});
export const useFocusEffect = (fn: any) => {
  if (typeof fn === 'function') fn();
};

export const Stack = {
  Screen: () => null,
};

export const Link = () => null;

export default {
  useRouter,
  useSegments,
  useLocalSearchParams,
  useFocusEffect,
  Stack,
  Link,
};

