/**
 * Verification Store
 *
 * Manages verification flow with stage tracking:
 * - Stage 1: Password entry
 * - Stage 2: PIN entry (mobile-style)
 * - Stage 3: Wallet signature
 * - Stage 4: Biometric capture
 * - Stage 5: Verification result
 *
 * Also manages rolling nonce state after successful verification:
 * - Stores next nonce for DB update
 * - Stores next auth_commit for replacement
 *
 * Flow:
 * 1. User enters password → PIN → Sign wallet → Scan biometric
 * 2. Verification passes → Generate next nonce + auth_commit
 * 3. Store in this store (not saved to DB yet)
 * 4. User clicks continue → Save to DB
 * 5. Clear store
 */

import { create } from 'zustand';

export type VerificationStage = 'password' | 'pin' | 'signature' | 'scan' | 'comparing' | 'result';

interface VerificationState {
  // Current stage
  currentStage: VerificationStage;

  // Input data
  password: string;
  confirmPassword: string;
  pin: string;
  signature: string | null;
  address: string | null;
  userKey: Uint8Array | null;

  // Raw biometric data (captured from camera)
  rawBiometric: Float32Array | null;

  // Verification result
  verified: boolean;
  credentialId: string;
  matchRate: number;

  // Rolling nonce data (prepared but not yet saved)
  nextNonce: bigint | null;
  nextAuthCommit: string[] | null; // Array of 128 commitment strings

  // Actions
  setStage: (stage: VerificationStage) => void;

  setPassword: (password: string) => void;
  setConfirmPassword: (confirmPassword: string) => void;

  setPin: (pin: string) => void;

  setSignature: (signature: string, address: string, userKey: Uint8Array) => void;

  setRawBiometric: (biometric: Float32Array) => void;

  setVerificationResult: (data: {
    verified: boolean;
    credentialId: string;
    matchRate: number;
    nextNonce: bigint | null;
    nextAuthCommit: bigint[] | null;
  }) => void;

  clearVerification: () => void;
}

export const useVerificationStore = create<VerificationState>((set) => ({
  // Initial state - Stage tracking
  currentStage: 'password',

  // Initial state - Input data
  password: '',
  confirmPassword: '',
  pin: '',
  signature: null,
  address: null,
  userKey: null,
  rawBiometric: null,

  // Initial state - Verification result
  verified: false,
  credentialId: '',
  matchRate: 0,
  nextNonce: null,
  nextAuthCommit: null,

  // Actions
  setStage: (stage) => set({ currentStage: stage }),

  setPassword: (password) => set({ password }),

  setConfirmPassword: (confirmPassword) => set({ confirmPassword }),

  setPin: (pin) => set({ pin }),

  setSignature: (signature, address, userKey) =>
    set({ signature, address, userKey }),

  setRawBiometric: (biometric) => {
    console.log('📊 Raw biometric stored in verification store:', biometric.length, 'dimensions');
    set({ rawBiometric: biometric });
  },

  setVerificationResult: (data) =>
    set({
      verified: data.verified,
      credentialId: data.credentialId,
      matchRate: data.matchRate,
      nextNonce: data.nextNonce,
      nextAuthCommit: data.nextAuthCommit?.map((c) => c.toString()) || null,
    }),

  clearVerification: () =>
    set({
      currentStage: 'password',
      password: '',
      confirmPassword: '',
      pin: '',
      signature: null,
      address: null,
      userKey: null,
      rawBiometric: null,
      verified: false,
      credentialId: '',
      matchRate: 0,
      nextNonce: null,
      nextAuthCommit: null,
    }),
}));
