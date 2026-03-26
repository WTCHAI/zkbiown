import { usePrivy, useWallets } from '@privy-io/react-auth';

/**
 * Centralized hook for extracting and normalizing wallet addresses.
 *
 * This hook ensures consistency across the application by:
 * 1. Prioritizing user.wallet.address (most reliable)
 * 2. Falling back to wallets[0].address if needed
 * 3. Always normalizing to lowercase (Ethereum addresses are case-insensitive)
 *
 * @returns Normalized (lowercase) wallet address or null if no wallet is connected
 */
export function useWalletAddress(): string | null {
  const { user } = usePrivy();
  const { wallets } = useWallets();

  // Priority 1: User's primary wallet (most reliable)
  const primaryAddress = user?.wallet?.address;

  // Priority 2: First wallet in array (fallback)
  const fallbackAddress = wallets[0]?.address;

  // Always return normalized (lowercase) address
  const address = primaryAddress || fallbackAddress;
  return address ? address.toLowerCase() : null;
}

/**
 * Hook that returns both the wallet address and debug information.
 * Useful for debugging wallet address mismatches.
 *
 * @returns Object containing normalized address and debug info
 */
export function useWalletAddressDebug() {
  const { user } = usePrivy();
  const { wallets } = useWallets();

  const primaryAddress = user?.wallet?.address;
  const fallbackAddress = wallets[0]?.address;
  const normalizedAddress = primaryAddress || fallbackAddress;

  return {
    address: normalizedAddress ? normalizedAddress.toLowerCase() : null,
    debug: {
      primaryWallet: primaryAddress,
      fallbackWallet: fallbackAddress,
      walletsCount: wallets.length,
      mismatch: primaryAddress && fallbackAddress &&
                primaryAddress.toLowerCase() !== fallbackAddress.toLowerCase(),
    }
  };
}
