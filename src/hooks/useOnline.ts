import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/**
 * True unless the device is definitely offline. `isInternetReachable` can be
 * null while probing, so only a firm `false` counts as offline — the banner
 * should never flash during startup.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        setOnline(state.isConnected !== false && state.isInternetReachable !== false);
      }),
    []
  );

  return online;
}
