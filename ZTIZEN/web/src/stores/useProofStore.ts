/**
 * Proof Store for ZK Proof Generation
 * Simple state management for proof lifecycle
 */

import { create } from "zustand"

interface ProofState {
  proof: Uint8Array | null
  publicInputs: string[] | null
  matchCount: number | null
  computedCommit: string[] | null
  isGenerating: boolean
  isVerifying: boolean
  isVerified: boolean
  transactionHash: string | null
  error: string | null

  // Actions
  setProof: (proof: Uint8Array, publicInputs: string[], matchCount?: number, computedCommit?: string[]) => void
  clearProof: () => void
  setGenerating: (isGenerating: boolean) => void
  setVerifying: (isVerifying: boolean) => void
  setVerified: (isVerified: boolean, txHash?: string) => void
  setError: (error: string | null) => void
  resetVerification: () => void
}

export const useProofStore = create<ProofState>((set) => ({
  proof: null,
  publicInputs: null,
  matchCount: null,
  computedCommit: null,
  isGenerating: false,
  isVerifying: false,
  isVerified: false,
  transactionHash: null,
  error: null,

  setProof: (proof, publicInputs, matchCount, computedCommit) =>
    set({
      proof,
      publicInputs,
      matchCount: matchCount || null,
      computedCommit: computedCommit || null,
      isVerified: false,
      transactionHash: null,
      error: null
    }),

  clearProof: () =>
    set({
      proof: null,
      publicInputs: null,
      matchCount: null,
      computedCommit: null,
      isVerified: false,
      transactionHash: null,
      error: null
    }),

  setGenerating: (isGenerating) => set({ isGenerating }),

  setVerifying: (isVerifying) => set({ isVerifying }),

  setVerified: (isVerified, txHash) =>
    set({
      isVerified,
      transactionHash: txHash || null,
      isVerifying: false
    }),

  setError: (error) => set({ error, isGenerating: false, isVerifying: false }),

  resetVerification: () =>
    set({
      isVerified: false,
      transactionHash: null,
      isVerifying: false,
      error: null
    }),
}))
