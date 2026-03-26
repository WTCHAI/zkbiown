/**
 * Circuit Store - Manages ZK circuit initialization with IndexedDB caching
 *
 * Circuit instances (Noir/Backend) can't be serialized, so they're re-initialized
 * on each page load. However, we cache the circuit JSON (11MB) in IndexedDB to
 * avoid network fetch, making re-initialization much faster.
 *
 * Uses signmag128 circuit (Sign-Magnitude with 128 values, 0-8 encoding).
 */

import { create } from 'zustand';
import type { Noir } from '@noir-lang/noir_js';
import type { UltraHonkBackend } from '@aztec/bb.js';
import type { CompiledCircuit } from '@noir-lang/types';

/**
 * Circuit variant - currently only signmag128 is supported
 * Sign-Magnitude encoding with 128 values (0-8 range)
 */
export type CircuitVariant = 'signmag128';

/**
 * Default circuit variant
 */
export const DEFAULT_CIRCUIT_VARIANT: CircuitVariant = 'signmag128';

/**
 * Circuit configuration constants
 */
export const CIRCUIT_CONFIG = {
  variant: 'signmag128' as const,
  templateSize: 128,
  path: '/circuits/ztizen_circuit_signmag128.json',
} as const;

/**
 * Get the circuit path (always returns signmag128)
 */
export function getCircuitPath(): string {
  return CIRCUIT_CONFIG.path;
}

/**
 * Get expected template size (always 128 for signmag128)
 */
export function getExpectedTemplateSize(): number {
  return CIRCUIT_CONFIG.templateSize;
}

interface CircuitStore {
  noir: Noir | null;
  backend: UltraHonkBackend | null;
  circuit: CompiledCircuit | null;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  initStartTime: number | null;

  // Actions
  setNoir: (noir: Noir) => void;
  setBackend: (backend: UltraHonkBackend) => void;
  setCircuit: (circuit: CompiledCircuit) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setInitialized: (initialized: boolean) => void;
  setInitStartTime: (time: number | null) => void;
  reset: () => void;
}

// Global flag to ensure initialization happens only once
let initializationStarted = false;

export const useCircuitStore = create<CircuitStore>((set, get) => ({
  noir: null,
  backend: null,
  circuit: null,
  isInitialized: false,
  isLoading: false,
  error: null,
  initStartTime: null,

  setNoir: (noir) => set({ noir }),
  setBackend: (backend) => set({ backend }),
  setCircuit: (circuit) => set({ circuit }),
  setLoading: (loading) => {
    console.log('📊 Circuit loading state:', loading);
    set({ isLoading: loading });
  },
  setError: (error) => set({ error }),
  setInitialized: (initialized) => {
    console.log('📊 Circuit initialized state:', initialized);
    set({ isInitialized: initialized });
  },
  setInitStartTime: (time) => set({ initStartTime: time }),

  reset: () => {
    initializationStarted = false;
    set({
      noir: null,
      backend: null,
      circuit: null,
      isInitialized: false,
      isLoading: false,
      error: null,
      initStartTime: null,
    });
  },
}));

// Helper to check if initialization should start
export function shouldInitialize(): boolean {
  if (initializationStarted) {
    console.log('⏭️  Initialization already started, skipping...');
    return false;
  }
  const { isInitialized, isLoading } = useCircuitStore.getState();
  if (isInitialized || isLoading) {
    console.log('⏭️  Circuit already initialized or loading:', { isInitialized, isLoading });
    return false;
  }
  initializationStarted = true;
  return true;
}

// IndexedDB Circuit Cache
const DB_NAME = 'ztizen-circuit-cache';
const DB_VERSION = 3; // Bumped for signmag128-only caching
const STORE_NAME = 'circuits';
const CACHE_KEY = 'ztizen_circuit_signmag128';

class CircuitCache {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
  }

  async get(): Promise<CompiledCircuit | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(CACHE_KEY);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async set(circuit: CompiledCircuit): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(circuit, CACHE_KEY);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clear(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

export const circuitCache = new CircuitCache();

/**
 * Load circuit with IndexedDB caching
 * Checks IndexedDB first, falls back to network fetch
 *
 * @returns Compiled circuit (signmag128)
 */
export async function loadCircuitWithCache(): Promise<CompiledCircuit> {
  try {
    const circuitPath = CIRCUIT_CONFIG.path;
    console.log(`📦 Loading circuit: ${CIRCUIT_CONFIG.variant}`);
    console.log(`📦 Checking IndexedDB cache...`);

    const cachedCircuit = await circuitCache.get();

    if (cachedCircuit) {
      console.log(`✅ Circuit loaded from IndexedDB cache`, {
        bytecodeLength: cachedCircuit.bytecode.length,
        sizeKB: Math.round(cachedCircuit.bytecode.length / 1024),
      });
      return cachedCircuit;
    }

    console.log(`📥 Circuit not in cache, fetching from ${circuitPath}...`);
    const response = await fetch(circuitPath);
    if (!response.ok) {
      throw new Error(`Failed to fetch circuit: ${response.statusText}`);
    }

    const circuit = await response.json() as CompiledCircuit;
    console.log(`✅ Circuit fetched from network`, {
      bytecodeLength: circuit.bytecode.length,
      sizeKB: Math.round(circuit.bytecode.length / 1024),
    });

    // Cache for next time
    console.log(`💾 Saving circuit to IndexedDB cache...`);
    await circuitCache.set(circuit);
    console.log(`✅ Circuit cached in IndexedDB`);

    return circuit;
  } catch (error) {
    console.error(`❌ Failed to load circuit:`, error);
    throw error;
  }
}
