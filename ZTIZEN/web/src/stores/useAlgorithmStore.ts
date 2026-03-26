/**
 * Algorithm Selection Store
 *
 * Manages user's choice of cancelable biometric algorithm.
 * Currently only 'gaussian-sparse' (Achlioptas/Chellappa) is supported.
 *
 * Persists selection in localStorage for consistent user experience
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ALGORITHM_PAPERS, type AlgorithmType, type PaperReference } from '@/lib/CancelableBiometric';

interface AlgorithmStore {
  /**
   * Currently selected algorithm
   * Default: 'gaussian-sparse' (Achlioptas/Chellappa - IEEE TPAMI 2011)
   */
  selectedAlgorithm: AlgorithmType;

  /**
   * Set the selected algorithm
   */
  setAlgorithm: (algo: AlgorithmType) => void;

  /**
   * Get algorithm display name
   */
  getAlgorithmName: (algo: AlgorithmType) => string;

  /**
   * Get algorithm description
   */
  getAlgorithmDescription: (algo: AlgorithmType) => string;

  /**
   * Get paper references for an algorithm
   */
  getPaperReferences: (algo: AlgorithmType) => PaperReference[];

  /**
   * Check if algorithm uses information-theoretic security
   */
  isInformationTheoreticSecure: (algo: AlgorithmType) => boolean;
}

export const useAlgorithmStore = create<AlgorithmStore>()(
  persist(
    (set, get) => ({
      selectedAlgorithm: 'gaussian-sparse', // Default: Achlioptas/Chellappa (IEEE TPAMI 2011) - fastest & verified

      setAlgorithm: (algo) => {
        console.log(`🔧 Algorithm changed to: ${algo}`);
        set({ selectedAlgorithm: algo });
      },

      getAlgorithmName: (algo) => {
        // Only gaussian-sparse is supported
        return 'Sparse Gaussian (Chellappa)';
      },

      getAlgorithmDescription: (algo) => {
        // Only gaussian-sparse is supported
        return 'IEEE TPAMI 2011 verified. Achlioptas sparse matrix (66% zeros). 3× faster, same JL+RIP security. RECOMMENDED.';
      },

      getPaperReferences: (algo) => {
        return ALGORITHM_PAPERS[algo] || [];
      },

      isInformationTheoreticSecure: (algo) => {
        // gaussian-sparse provides computational security, not information-theoretic
        return false;
      },
    }),
    {
      name: 'ztizen-algorithm-selection', // localStorage key
      partialize: (state) => ({
        selectedAlgorithm: state.selectedAlgorithm,
      }),
    }
  )
);
