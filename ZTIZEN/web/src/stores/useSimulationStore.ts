/**
 * Simulation Panel Store
 *
 * Controls the visibility of the System Simulation panel and tracks
 * the current flow stage for step-by-step visualization.
 *
 * Also provides helper selectors for the SystemDiagram component
 * to determine which services and paths should be highlighted.
 */

import { create } from 'zustand';

// Flow types
export type FlowType = 'enrollment' | 'verification' | 'idle';

// Enrollment flow stages
export type EnrollmentStep =
  | 'pin'
  | 'pin_confirm'
  | 'password'
  | 'signature'
  | 'credential_create'
  | 'biometric'
  | 'template'
  | 'commit'
  | 'store'
  | 'complete';

// Verification flow stages
export type VerificationStep =
  | 'pin'
  | 'password'
  | 'signature'
  | 'biometric'
  | 'compare'
  | 'result'
  | 'complete';

export type FlowStep = EnrollmentStep | VerificationStep;

// Pipeline stages for data transformation visualization
export type PipelineStage =
  | 'idle'
  | 'input'
  | 'keys'
  | 'raw'
  | 'landmarks'
  | 'template'
  | 'commit'
  | 'store'
  | 'compare'
  | 'proof'
  | 'result'
  | 'complete';

// Diagram mapping type
interface DiagramMapping {
  services: string[];
  paths: string[];
  pipeline: PipelineStage;
}

// Step to diagram element mapping
const STEP_DIAGRAM_MAP: Record<FlowStep, DiagramMapping> = {
  // Enrollment steps
  pin: { services: ['browser'], paths: [], pipeline: 'input' },
  pin_confirm: { services: ['browser'], paths: [], pipeline: 'input' },
  password: { services: ['browser'], paths: [], pipeline: 'input' },
  signature: { services: ['browser', 'product'], paths: ['browserToProduct'], pipeline: 'input' },
  credential_create: { services: ['product', 'ztizen', 'productDb', 'ztizenDb'], paths: ['productToZtizen', 'productToProductDb', 'ztizenToZtizenDb'], pipeline: 'keys' },
  biometric: { services: ['browser'], paths: [], pipeline: 'raw' },
  template: { services: ['browser'], paths: [], pipeline: 'template' },
  commit: { services: ['browser'], paths: [], pipeline: 'commit' },
  store: { services: ['browser', 'ztizen', 'ztizenDb'], paths: ['browserToZtizen', 'ztizenToZtizenDb'], pipeline: 'store' },
  complete: { services: ['browser', 'product', 'ztizen'], paths: [], pipeline: 'complete' },

  // Verification steps
  compare: { services: ['browser', 'ztizen', 'ztizenDb'], paths: ['browserToZtizen', 'ztizenToZtizenDb'], pipeline: 'compare' },
  result: { services: ['ztizen', 'product', 'productDb'], paths: ['productToZtizen', 'productToProductDb'], pipeline: 'result' },
};

interface SimulationStore {
  // Panel state
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;

  // Flow tracking
  flowType: FlowType;
  currentStep: FlowStep | null;
  completedSteps: string[];

  // Actions
  setFlowType: (type: FlowType) => void;
  setCurrentStep: (step: FlowStep) => void;
  markStepComplete: (step: string) => void;
  resetFlow: () => void;

  // Diagram helper selectors
  getActiveServices: () => string[];
  getActivePaths: () => string[];
  getPipelineStage: () => PipelineStage;
  getDiagramMapping: () => DiagramMapping | null;
}

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  // Panel state
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),

  // Flow tracking
  flowType: 'idle',
  currentStep: null,
  completedSteps: [],

  // Flow actions
  setFlowType: (type) => set({
    flowType: type,
    completedSteps: [],
    currentStep: null
  }),

  setCurrentStep: (step) => set((state) => {
    // Auto-mark previous step as complete when moving to new step
    const newCompleted = state.currentStep && state.currentStep !== step
      ? [...state.completedSteps, state.currentStep]
      : state.completedSteps;

    return {
      currentStep: step,
      completedSteps: newCompleted.filter((s, i, arr) => arr.indexOf(s) === i) // dedupe
    };
  }),

  markStepComplete: (step) => set((state) => ({
    completedSteps: [...state.completedSteps, step].filter((s, i, arr) => arr.indexOf(s) === i)
  })),

  resetFlow: () => set({
    flowType: 'idle',
    currentStep: null,
    completedSteps: []
  }),

  // Diagram helper selectors
  getActiveServices: () => {
    const { currentStep } = get();
    if (!currentStep) return [];
    return STEP_DIAGRAM_MAP[currentStep]?.services || [];
  },

  getActivePaths: () => {
    const { currentStep } = get();
    if (!currentStep) return [];
    return STEP_DIAGRAM_MAP[currentStep]?.paths || [];
  },

  getPipelineStage: () => {
    const { currentStep } = get();
    if (!currentStep) return 'idle';
    return STEP_DIAGRAM_MAP[currentStep]?.pipeline || 'idle';
  },

  getDiagramMapping: () => {
    const { currentStep } = get();
    if (!currentStep) return null;
    return STEP_DIAGRAM_MAP[currentStep] || null;
  },
}));

// Export the mapping for use in components
export { STEP_DIAGRAM_MAP };
