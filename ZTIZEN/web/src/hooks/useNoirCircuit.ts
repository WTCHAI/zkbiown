/**
 * useNoirCircuit Hook
 *
 * Loads the compiled Noir circuit JSON for ZK proof generation.
 * Uses singleton pattern to cache the circuit in memory after first load.
 *
 * Circuit file: /public/circuits/ztizen_circuit.json
 * Circuit specs: 128-element templates (~66K ACIR opcodes, browser-compatible)
 */

import { useState, useEffect } from 'react';

interface NoirCircuit {
  bytecode: string;
  abi: {
    parameters: Array<{
      name: string;
      type: { kind: string; [key: string]: any };
      visibility: string;
    }>;
    return_type?: any;
  };
}

interface UseNoirCircuitReturn {
  circuit: NoirCircuit | null;
  isLoading: boolean;
  error: Error | null;
}

// Singleton cache - circuit only loaded once per session
let cachedCircuit: NoirCircuit | null = null;
let loadingPromise: Promise<NoirCircuit> | null = null;

/**
 * Load the Noir circuit from public directory
 */
async function loadCircuit(): Promise<NoirCircuit> {
  // Return cached circuit if already loaded
  if (cachedCircuit) {
    return cachedCircuit;
  }

  // If already loading, wait for existing load
  if (loadingPromise) {
    return loadingPromise;
  }

  // Start loading
  console.log('📦 Loading Noir circuit from /circuits/ztizen_circuit.json...');
  const startTime = performance.now();

  loadingPromise = fetch('/circuits/ztizen_circuit.json')
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load circuit: ${response.statusText}`);
      }

      const circuit = await response.json();
      const loadTime = ((performance.now() - startTime) / 1000).toFixed(2);

      console.log(`✅ Circuit loaded successfully in ${loadTime}s`);
      console.log('Circuit specs:', {
        bytecodeSize: `${(circuit.bytecode.length / 1024 / 1024).toFixed(2)} MB`,
        parameters: circuit.abi.parameters.map((p: any) => ({
          name: p.name,
          type: p.type.kind,
        })),
      });

      cachedCircuit = circuit;
      loadingPromise = null;
      return circuit;
    })
    .catch((error) => {
      loadingPromise = null;
      console.error('❌ Failed to load circuit:', error);
      throw error;
    });

  return loadingPromise;
}

/**
 * Hook to load and access the Noir circuit
 *
 * Usage:
 * ```typescript
 * const { circuit, isLoading, error } = useNoirCircuit();
 *
 * if (isLoading) return <Loading />;
 * if (error) return <Error message={error.message} />;
 * if (circuit) {
 *   // Use circuit for proof generation
 *   const proof = await noir.generateProof(inputs, circuit);
 * }
 * ```
 */
export function useNoirCircuit(): UseNoirCircuitReturn {
  const [circuit, setCircuit] = useState<NoirCircuit | null>(cachedCircuit);
  const [isLoading, setIsLoading] = useState<boolean>(!cachedCircuit);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // If already cached, no need to load
    if (cachedCircuit) {
      setCircuit(cachedCircuit);
      setIsLoading(false);
      return;
    }

    // Load circuit
    setIsLoading(true);
    loadCircuit()
      .then((loadedCircuit) => {
        setCircuit(loadedCircuit);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      });
  }, []);

  return { circuit, isLoading, error };
}

/**
 * Preload circuit in background (optional optimization)
 * Call this early in app lifecycle to start loading before user needs it
 */
export function preloadCircuit(): void {
  if (!cachedCircuit && !loadingPromise) {
    loadCircuit().catch((error) => {
      console.warn('Background circuit preload failed:', error);
    });
  }
}
