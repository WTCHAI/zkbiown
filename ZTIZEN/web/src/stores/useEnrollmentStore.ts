/**
 * Enrollment Store
 *
 * Manages the complete enrollment flow state:
 * 1. PIN entry
 * 2. Password entry
 * 3. Wallet signature
 * 4. Algorithm selection
 * 5. Biometric capture
 *
 * Used by: ztizen.register.$credentialId.tsx → ztizen.register-scan.$credentialId.tsx
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AlgorithmType } from '@/lib/CancelableBiometric';

interface EnrollmentState {
  // Enrollment metadata
  credentialId: string | null;
  productId: string | null;
  serviceName: string | null;
  serviceType: string | null;  // 'authentication', 'authorization', etc.
  userId: string | null;

  // User credentials
  pin: string | null;
  password: string | null;
  signature: string | null;
  address: string | null;

  // Derived key
  userKey: Uint8Array | null;

  // Raw biometric data (captured from camera)
  rawBiometric: Float32Array | null;

  // Algorithm selection
  selectedAlgorithm: AlgorithmType;

  // Enrollment progress (algorithm step removed - hardcoded to gaussian-sparse)
  currentStep: 'pin' | 'password' | 'signature' | 'biometric' | 'complete';

  // Actions
  setCredentialInfo: (info: {
    credentialId: string;
    productId: string;
    serviceName: string;
    serviceType: string;
    userId: string;
  }) => void;

  setPin: (pin: string) => void;
  setPassword: (password: string) => void;
  setSignature: (signature: string, address: string) => void;
  setUserKey: (userKey: Uint8Array) => void;
  setRawBiometric: (biometric: Float32Array) => void;
  setAlgorithm: (algorithm: AlgorithmType) => void;
  setStep: (step: EnrollmentState['currentStep']) => void;

  // Utilities
  reset: () => void;
  isReady: () => boolean;
}

const initialState = {
  credentialId: null,
  productId: null,
  serviceName: null,
  serviceType: null,
  userId: null,
  pin: null,
  password: null,
  signature: null,
  address: null,
  userKey: null,
  rawBiometric: null,
  selectedAlgorithm: 'gaussian-sparse' as AlgorithmType, // Hardcoded to Chellappa algorithm (IEEE TPAMI 2011)
  currentStep: 'pin' as const,
};

export const useEnrollmentStore = create<EnrollmentState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setCredentialInfo: (info) => {
        console.log('📝 Setting credential info:', info);
        set({
          credentialId: info.credentialId,
          productId: info.productId,
          serviceName: info.serviceName,
          serviceType: info.serviceType,
          userId: info.userId,
        });
      },

      setPin: (pin) => {
        console.log('🔢 PIN set:', pin.length, 'digits');
        set({ pin, currentStep: 'password' });
      },

      setPassword: (password) => {
        console.log('🔐 Password set');
        set({ password, currentStep: 'signature' });
      },

      setSignature: (signature, address) => {
        console.log('✍️ Signature set:', { address, sigLength: signature.length });
        set({ signature, address, currentStep: 'biometric' }); // Skip algorithm step - hardcoded to gaussian-sparse
      },

      setUserKey: (userKey) => {
        console.log('🔑 User key derived:', userKey.length, 'bytes');
        set({ userKey });
      },

      setRawBiometric: (biometric) => {
        console.log('📊 Raw biometric stored:', biometric.length, 'dimensions');
        set({ rawBiometric: biometric });
      },

      setAlgorithm: (algorithm) => {
        console.log('🧬 Algorithm selected:', algorithm);
        set({ selectedAlgorithm: algorithm, currentStep: 'biometric' });
      },

      setStep: (step) => {
        set({ currentStep: step });
      },

      reset: () => {
        console.log('🔄 Resetting enrollment store');
        set(initialState);
      },

      isReady: () => {
        const state = get();
        return !!(
          state.pin &&
          state.password &&
          state.signature &&
          state.userKey &&
          state.credentialId &&
          state.productId
        );
      },
    }),
    {
      name: 'ztizen-enrollment',
      // Persist ALL data including sensitive info in sessionStorage
      // sessionStorage is cleared when tab/window closes (more secure than localStorage)
      storage: {
        getItem: (name) => {
          const str = sessionStorage.getItem(name);
          return str ? JSON.parse(str) : null;
        },
        setItem: (name, value) => {
          sessionStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          sessionStorage.removeItem(name);
        },
      },
      // Persist everything including sensitive data (session only)
      // @ts-ignore - partialize correctly serializes typed arrays to plain arrays
      partialize: (state) => ({
        credentialId: state.credentialId,
        productId: state.productId,
        serviceName: state.serviceName,
        serviceType: state.serviceType,
        userId: state.userId,
        currentStep: state.currentStep,
        selectedAlgorithm: state.selectedAlgorithm,
        // Persist sensitive data in sessionStorage (cleared on tab close)
        pin: state.pin,
        password: state.password,
        signature: state.signature,
        address: state.address,
        // userKey is Uint8Array, need special handling
        userKey: state.userKey ? Array.from(state.userKey) : null,
        // rawBiometric is Float32Array, need special handling
        rawBiometric: state.rawBiometric ? Array.from(state.rawBiometric) : null,
      }),
      // Restore typed arrays from arrays
      onRehydrateStorage: () => (state) => {
        if (state?.userKey && Array.isArray(state.userKey)) {
          state.userKey = new Uint8Array(state.userKey);
        }
        if (state?.rawBiometric && Array.isArray(state.rawBiometric)) {
          state.rawBiometric = new Float32Array(state.rawBiometric);
        }
      },
    }
  )
);
