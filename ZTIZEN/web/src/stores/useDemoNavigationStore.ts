/**
 * Demo Navigation Store
 *
 * Tracks overall demo flow progress and provides navigation guidance
 * This is separate from the simulation store which tracks individual enrollment/verification steps
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Demo flow steps (overall journey)
export type DemoStep =
  | 'connect_wallet'
  | 'select_credential'
  | 'enroll_start'
  | 'enroll_complete'
  | 'verify_start'
  | 'verify_complete'
  | 'done';

export interface DemoStepInfo {
  id: DemoStep;
  label: string;
  description: string;
  route: string;
  action?: string; // Action text like "Connect Wallet", "Start Enrollment"
}

// Demo flow definition
export const DEMO_STEPS: DemoStepInfo[] = [
  {
    id: 'connect_wallet',
    label: 'Connect Wallet',
    description: 'Link your Web3 wallet to get started',
    route: '/',
    action: 'Connect Wallet',
  },
  {
    id: 'select_credential',
    label: 'Select Credential',
    description: 'Choose or create a credential to enroll',
    route: '/ztizen/me',
    action: 'View Credentials',
  },
  {
    id: 'enroll_start',
    label: 'Start Enrollment',
    description: 'Begin biometric enrollment process',
    route: '/ztizen/register',
    action: 'Start Enrollment',
  },
  {
    id: 'enroll_complete',
    label: 'Complete Enrollment',
    description: 'Finish biometric capture and template generation',
    route: '', // Dynamic based on credential
    action: 'Continue',
  },
  {
    id: 'verify_start',
    label: 'Start Verification',
    description: 'Test your enrolled biometric',
    route: '/product',
    action: 'Start Verification',
  },
  {
    id: 'verify_complete',
    label: 'Complete Verification',
    description: 'View verification results',
    route: '', // Dynamic based on credential
    action: 'View Results',
  },
  {
    id: 'done',
    label: 'Demo Complete',
    description: 'You\'ve completed the full demo flow!',
    route: '/ztizen/me',
    action: 'View Dashboard',
  },
];

interface DemoNavigationStore {
  // Current demo step
  currentStep: DemoStep;
  completedSteps: DemoStep[];

  // Last used credential (for continuing enrollment/verification)
  lastCredentialId: string | null;

  // Actions
  setCurrentStep: (step: DemoStep) => void;
  completeStep: (step: DemoStep) => void;
  setLastCredential: (credentialId: string) => void;
  resetDemo: () => void;

  // Computed helpers
  getNextStep: () => DemoStepInfo | null;
  getCurrentStepInfo: () => DemoStepInfo;
  getProgress: () => number;
  isStepComplete: (step: DemoStep) => boolean;
}

export const useDemoNavigationStore = create<DemoNavigationStore>()(
  persist(
    (set, get) => ({
      currentStep: 'connect_wallet',
      completedSteps: [],
      lastCredentialId: null,

      setCurrentStep: (step) => set({ currentStep: step }),

      completeStep: (step) => set((state) => {
        const newCompleted = state.completedSteps.includes(step)
          ? state.completedSteps
          : [...state.completedSteps, step];

        // Auto-advance to next step
        const currentIndex = DEMO_STEPS.findIndex(s => s.id === step);
        const nextStep = DEMO_STEPS[currentIndex + 1];

        return {
          completedSteps: newCompleted,
          currentStep: nextStep ? nextStep.id : 'done',
        };
      }),

      setLastCredential: (credentialId) => set({ lastCredentialId: credentialId }),

      resetDemo: () => set({
        currentStep: 'connect_wallet',
        completedSteps: [],
        lastCredentialId: null,
      }),

      getNextStep: () => {
        const state = get();
        const currentIndex = DEMO_STEPS.findIndex(s => s.id === state.currentStep);
        const nextStep = DEMO_STEPS[currentIndex + 1];
        return nextStep || null;
      },

      getCurrentStepInfo: () => {
        const state = get();
        return DEMO_STEPS.find(s => s.id === state.currentStep) || DEMO_STEPS[0];
      },

      getProgress: () => {
        const state = get();
        const currentIndex = DEMO_STEPS.findIndex(s => s.id === state.currentStep);
        return Math.round(((currentIndex + 1) / DEMO_STEPS.length) * 100);
      },

      isStepComplete: (step) => {
        const state = get();
        return state.completedSteps.includes(step);
      },
    }),
    {
      name: 'ztizen-demo-navigation',
      partialize: (state) => ({
        currentStep: state.currentStep,
        completedSteps: state.completedSteps,
        lastCredentialId: state.lastCredentialId,
      }),
    }
  )
);
