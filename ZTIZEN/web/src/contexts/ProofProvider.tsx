/**
 * ProofProvider - Pre-initializes Noir circuit with IndexedDB caching
 *
 * This provider:
 * 1. Caches circuit JSON (11MB) in IndexedDB for fast reloads
 * 2. Initializes Noir/Backend on each page load (can't serialize these)
 * 3. Uses Zustand store for state management
 * 4. Loads SignMag128 circuit (sign-mag-rank binarization, 128 values)
 *
 * First load: Fetch from network + cache → Initialize (~15s)
 * Subsequent loads: Load from IndexedDB → Initialize (~5-10s)
 */

import { createContext, useContext, useEffect, ReactNode } from 'react';
import type { Noir } from '@noir-lang/noir_js';
import type { UltraHonkBackend } from '@aztec/bb.js';
import type { CompiledCircuit } from '@noir-lang/types';
import {
  useCircuitStore,
  loadCircuitWithCache,
  shouldInitialize,
  CIRCUIT_CONFIG,
} from '@/stores/useCircuitStore';

interface ProofContextValue {
  noir: Noir | null;
  backend: UltraHonkBackend | null;
  circuit: CompiledCircuit | null;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
}

const ProofContext = createContext<ProofContextValue>({
  noir: null,
  backend: null,
  circuit: null,
  isInitialized: false,
  isLoading: true,
  error: null,
});

export function ProofProvider({ children }: { children: ReactNode }) {
  const {
    noir,
    backend,
    circuit,
    isInitialized,
    isLoading,
    error,
    setNoir,
    setBackend,
    setCircuit,
    setLoading,
    setError,
    setInitialized,
    setInitStartTime,
  } = useCircuitStore();

  console.log('🔍 ProofProvider render:', {
    isInitialized,
    isLoading,
    hasNoir: !!noir,
    hasBackend: !!backend,
  });

  useEffect(() => {
    const initializeCircuit = async () => {
      // Guard: Use global flag to prevent multiple initializations
      if (!shouldInitialize()) {
        console.log('⏭️  ProofProvider: Skipping initialization (already done or in progress)');
        return;
      }

      try {
        console.log('🚀 ProofProvider: Starting circuit initialization...');
        console.log(`📊 ProofProvider: Loading circuit: ${CIRCUIT_CONFIG.variant}`);
        const startTime = Date.now();
        setInitStartTime(startTime);
        setLoading(true);

        // Load Noir and BB.js modules
        const [{ Noir: NoirClass }, { UltraHonkBackend: BackendClass }] = await Promise.all([
          import('@noir-lang/noir_js'),
          import('@aztec/bb.js'),
        ]);

        // Load circuit with IndexedDB caching
        const loadedCircuit = await loadCircuitWithCache();
        setCircuit(loadedCircuit);

        console.log(`⚙️ ProofProvider: Initializing Noir instance...`);
        const noirInstance = new NoirClass(loadedCircuit);

        console.log(`⚙️ ProofProvider: Initializing UltraHonk backend...`);
        const backendInstance = new BackendClass(loadedCircuit.bytecode);

        console.log('🔄 ProofProvider: Calling noir.init()...');
        await noirInstance.init();

        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✅ ProofProvider: Circuit initialized in ${elapsedTime}s`);

        setNoir(noirInstance);
        setBackend(backendInstance);
        setInitialized(true);
        setLoading(false);
      } catch (err) {
        console.error('❌ ProofProvider: Circuit initialization failed:', err);
        setError(err instanceof Error ? err.message : 'Circuit initialization failed');
        setLoading(false);
      }
    };

    initializeCircuit();
  }, []); // Empty deps - only run once on mount

  const value: ProofContextValue = {
    noir,
    backend,
    circuit,
    isInitialized,
    isLoading,
    error,
  };

  return <ProofContext.Provider value={value}>{children}</ProofContext.Provider>;
}

export function useProofContext() {
  const context = useContext(ProofContext);
  if (!context) {
    throw new Error('useProofContext must be used within ProofProvider');
  }
  return context;
}
