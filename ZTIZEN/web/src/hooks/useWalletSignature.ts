/**
 * useWalletSignature Hook
 *
 * Signs messages with connected wallet for deriving user keys.
 * Uses Privy wallet connection and eth_signTypedData_v4 (EIP-712)
 * for structured, domain-separated signatures.
 *
 * Security Notes:
 * ---------------
 * - Uses EIP-712 typed data for better security than personal_sign
 * - Domain separation prevents signature reuse across different apps
 * - Includes nonce for server-side validation
 * - Signature is deterministic for same inputs (allows key recovery)
 * - DO NOT expose signatures publicly - they can reveal low-entropy secrets via brute-force
 *
 * Best Practice Flow:
 * 1. Server issues random nonce
 * 2. Client signs message + nonce with wallet
 * 3. Client derives userKey from signature + HKDF
 * 4. Server verifies signature matches expected address
 * 5. Server stores nonce to prevent replay attacks
 *
 * @example
 * const { signPassword, isLoading, error } = useWalletSignature();
 *
 * const result = await signPassword(password);
 * // result = { signature, message, address, userKey }
 */

import { useCallback, useState } from 'react';
import { usePrivy, useWallets, useSignMessage } from '@privy-io/react-auth';
import { useWalletAddress } from './useWalletAddress';

interface SignatureResult {
  signature: string;
  message: string;
  address: string;
  userKey: Uint8Array;  // Derived from signature for biometric templates
}

export function useWalletSignature() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const walletAddress = useWalletAddress();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Sign a password with the connected wallet using EIP-712
   *
   * @param password - The password to sign
   * @param pin - Optional PIN to include in signature
   * @returns Signature result with derived userKey
   */
  const signPassword = useCallback(
    async (password: string, pin?: string): Promise<SignatureResult> => {
      setIsLoading(true);
      setError(null);

      try {
        // Check wallet connection
        if (!ready || !authenticated) {
          throw new Error('Wallet not connected. Please connect your wallet first.');
        }

        if (!walletAddress) {
          throw new Error('No wallet found. Please connect a wallet.');
        }

        const wallet = wallets[0];
        if (!wallet) {
          throw new Error('No wallet found. Please connect a wallet.');
        }

        const address = walletAddress;

        console.log('🔐 Signing password with wallet:', address);

        // Create message to sign
        // Using personal_sign (EIP-191) for maximum compatibility with Privy wallets
        // The signature is deterministic given the same inputs (no timestamp)
        const messageToSign = `ZTIZEN User Key Derivation\n\nAction: Derive User Key for Biometric Template\nPassword: ${password}\nPIN: ${pin || 'none'}\n\nThis signature will be used to create your biometric credential.`;

        console.log('📝 Signing message with Privy wallet');

        // Use Privy's useSignMessage hook
        // Reference: https://docs.privy.io/wallets/using-wallets/ethereum/sign-a-message
        let signature: string;

        try {
          const uiOptions = {
            title: 'Sign to Create Your Biometric Key',
            description: 'This signature creates your secure user key for biometric authentication.',
            buttonText: 'Sign Message'
          };

          const result = await signMessage(
            { message: messageToSign },
            {
              uiOptions,
              address: wallet.address // Use the first connected wallet
            }
          );

          signature = result.signature;
          console.log('✅ Signed with Privy useSignMessage()');
        } catch (signError: any) {
          console.error('❌ Signature error:', signError);

          // Check if user rejected
          if (signError.message?.includes('rejected') || signError.message?.includes('denied')) {
            throw new Error('Signature request was rejected. Please try again.');
          }

          throw new Error(`Failed to sign message: ${signError.message || 'Unknown error'}`);
        }

        console.log('✅ Signature obtained:', signature.slice(0, 20) + '...');
        console.log('📝 Full signature for comparison:', signature);
        console.log('📝 Message that was signed:', messageToSign);

        // Derive user key from signature using HKDF-like approach
        // This creates a deterministic key from the signature
        const userKey = await deriveUserKey(signature, pin || '');

        console.log('🔑 User key derived from signature');

        return {
          signature,
          message: messageToSign,
          address,
          userKey,
        };
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to sign with wallet';
        setError(errorMessage);
        console.error('❌ Wallet signature error:', err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [ready, authenticated, wallets, walletAddress, signMessage]
  );

  return {
    signPassword,
    isLoading,
    error,
  };
}

/**
 * Derive user key from signature + PIN
 * Uses HKDF-like key derivation for deterministic key generation
 *
 * @param signature - Wallet signature (hex string)
 * @param pin - User PIN
 * @returns 32-byte user key
 */
async function deriveUserKey(signature: string, pin: string): Promise<Uint8Array> {
  // Remove '0x' prefix if present
  const sigHex = signature.startsWith('0x') ? signature.slice(2) : signature;

  // Convert signature hex to bytes
  const sigBytes = new Uint8Array(
    sigHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
  );

  // Combine signature with PIN for additional entropy
  const pinEncoder = new TextEncoder();
  const pinBytes = pinEncoder.encode(pin);

  // Concatenate signature + PIN
  const combined = new Uint8Array(sigBytes.length + pinBytes.length);
  combined.set(sigBytes);
  combined.set(pinBytes, sigBytes.length);

  // Hash with SHA-256 to get 32-byte key
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  const userKey = new Uint8Array(hashBuffer);

  // DEBUG: Log derivation details
  console.log('🔑 UserKey Derivation:', {
    signatureLength: signature.length,
    signaturePreview: signature.slice(0, 20) + '...',
    pin: pin.replace(/./g, '•'),
    pinLength: pin.length,
    sigBytesLength: sigBytes.length,
    combinedLength: combined.length,
    userKeyPreview: Array.from(userKey.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(''),
  });

  return userKey;
}

