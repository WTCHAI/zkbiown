/**
 * Create Identity Store
 *
 * Stores enrollment data across pages with stage tracking:
 * - Stage 1: PIN entry (pin1)
 * - Stage 2: PIN confirmation (pin2)
 * - Stage 3: Password + Wallet signature (password, signature)
 * - Stage 4: Biometric capture (capture)
 *
 * Flow: Register page → Store data → Scan page → Use for biometric template → Cleanup
 */

import { create } from 'zustand';

export type EnrollmentStage = 'pin1' | 'pin2' | 'password' | 'signature' | 'capture' | 'complete';

interface CreateIdentityState {
  // Current enrollment stage
  currentStage: EnrollmentStage;

  // Enrollment data
  pin: string;
  confirmPin: string;
  password: string;
  confirmPassword: string;
  signature: string;
  address: string;
  userKey: Uint8Array | null;

  // Credential metadata
  product_id: string;
  product_name: string;
  service_name: string;

  // Actions
  setStage: (stage: EnrollmentStage) => void;

  setPin: (pin: string) => void;
  setConfirmPin: (confirmPin: string) => void;

  setPassword: (password: string) => void;
  setConfirmPassword: (confirmPassword: string) => void;

  setSignature: (signature: string, address: string, userKey: Uint8Array) => void;

  setCredentialMetadata: (data: {
    product_id: string;
    product_name: string;
    service_name: string;
  }) => void;

  setEnrollmentData: (data: {
    pin: string;
    password: string;
    signature: string;
    address: string;
    userKey: Uint8Array;
    product_id: string;
    product_name: string;
    service_name: string;
  }) => void;

  clearEnrollmentData: () => void;
}

export const useCreateIdentityStore = create<CreateIdentityState>((set) => ({
  // Initial state
  currentStage: 'pin1',
  pin: '',
  confirmPin: '',
  password: '',
  confirmPassword: '',
  signature: '',
  address: '',
  userKey: null,
  product_id: '',
  product_name: '',
  service_name: '',

  // Stage management
  setStage: (stage) => set({ currentStage: stage }),

  // PIN management
  setPin: (pin) => set({ pin }),
  setConfirmPin: (confirmPin) => set({ confirmPin }),

  // Password management
  setPassword: (password) => set({ password }),
  setConfirmPassword: (confirmPassword) => set({ confirmPassword }),

  // Signature management
  setSignature: (signature, address, userKey) => set({
    signature,
    address,
    userKey,
  }),

  // Credential metadata
  setCredentialMetadata: (data) => set({
    product_id: data.product_id,
    product_name: data.product_name,
    service_name: data.service_name,
  }),

  // Set all enrollment data at once (backward compatibility)
  setEnrollmentData: (data) => set({
    pin: data.pin,
    password: data.password,
    signature: data.signature,
    address: data.address,
    userKey: data.userKey,
    product_id: data.product_id,
    product_name: data.product_name,
    service_name: data.service_name,
    currentStage: 'capture', // Move to capture stage when all data is set
  }),

  // Clear all data (after enrollment complete or on error)
  clearEnrollmentData: () => set({
    currentStage: 'pin1',
    pin: '',
    confirmPin: '',
    password: '',
    confirmPassword: '',
    signature: '',
    address: '',
    userKey: null,
    product_id: '',
    product_name: '',
    service_name: '',
  }),
}));
