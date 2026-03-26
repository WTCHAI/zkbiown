/**
 * Privy Provider for ZTIZEN
 * Wallet connection for biometric identity
 */

import { PrivyProvider as BasePrivyProvider, type PrivyClientConfig } from '@privy-io/react-auth';
import { ENV } from '../lib/environment'

// Use the validated environment value. `environment` will throw on startup
// if required variables are missing, making misconfiguration obvious.
const PRIVY_APP_ID = ENV.PRIVY_APP_ID

export default function PrivyProvider({ children }: { children: React.ReactNode }) {
  const config: PrivyClientConfig = {
    loginMethods: ['wallet', 'email'],
    appearance: {
      walletChainType: 'ethereum-only',
    },
    embeddedWallets: {
      ethereum: {
        createOnLogin: "off"
      }
    },
  };

  return (
    <BasePrivyProvider appId={PRIVY_APP_ID} config={config}>
      {children}
    </BasePrivyProvider>
  );
}
