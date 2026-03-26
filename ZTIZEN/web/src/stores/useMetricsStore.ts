/**
 * Metrics Store for ZK BIOWN Performance Measurement
 *
 * Captures all performance data required for the academic proposal document:
 * - Face detection + extraction timing
 * - Composite key derivation
 * - Sparse matrix generation
 * - Matrix-vector projection
 * - Z-score computation + encoding
 * - Poseidon hashing (128 operations)
 * - ZK witness preparation
 * - ZK proof generation
 * - ZK proof verification
 * - Proof size
 * - Match rates (genuine vs impostor)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

export type SessionType = 'enrollment' | 'verification';

export interface OperationTiming {
  operation: string;
  durationMs: number;
  timestamp: number;
  sessionId: string;
  sessionType: SessionType;
  metadata?: Record<string, unknown>;
}

export interface MatchResult {
  sessionId: string;
  timestamp: number;
  matchRate: number;
  matchCount: number;
  totalBits: number;
  isGenuine: boolean; // true = same person test, false = impostor test
  threshold: number;
  passed: boolean;
  credentialId: string;
}

export interface SessionMetrics {
  sessionId: string;
  sessionType: SessionType;
  credentialId: string;
  startTime: number;
  endTime?: number;
  totalDurationMs?: number;
  timings: Record<string, number>; // operation -> duration in ms
  matchResult?: MatchResult;
  proofSizeBytes?: number;
}

export interface AggregatedStats {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  median: number;
  count: number;
  values: number[];
}

export interface MetricsExport {
  exportedAt: string;
  version: string;
  operationTimings: Record<string, AggregatedStats>;
  matchRateResults: {
    genuineTests: {
      avgMatchRate: number;
      minMatchRate: number;
      maxMatchRate: number;
      passRate: number;
      total: number;
    };
    impostorTests: {
      avgMatchRate: number;
      minMatchRate: number;
      maxMatchRate: number;
      passRate: number;
      total: number;
    };
    separationMargin: number; // genuine avg - impostor avg
  };
  sessions: SessionMetrics[];
  proofStats: {
    avgSizeBytes: number;
    minSizeBytes: number;
    maxSizeBytes: number;
  };
}

// ============================================================================
// Store State & Actions
// ============================================================================

interface MetricsState {
  // Current session tracking
  currentSession: SessionMetrics | null;

  // Historical data
  sessions: SessionMetrics[];
  timings: OperationTiming[];
  matchResults: MatchResult[];

  // UI state
  isPanelVisible: boolean;

  // Session management
  startSession: (sessionType: SessionType, credentialId: string) => string;
  endSession: (matchResult?: Omit<MatchResult, 'sessionId' | 'timestamp'>) => void;

  // Timing recording
  recordTiming: (operation: string, durationMs: number, metadata?: Record<string, unknown>) => void;

  // Proof size
  recordProofSize: (sizeBytes: number) => void;

  // Match result recording (for manual tests)
  recordMatchResult: (result: Omit<MatchResult, 'sessionId' | 'timestamp'>) => void;

  // Aggregation functions
  getAggregatedStats: (operation: string) => AggregatedStats | null;
  getAllOperationStats: () => Record<string, AggregatedStats>;
  getMatchRateStats: () => MetricsExport['matchRateResults'];

  // Export functions
  exportToJSON: () => MetricsExport;
  exportToCSV: () => string;

  // UI controls
  togglePanel: () => void;
  setPanelVisible: (visible: boolean) => void;

  // Reset/clear
  clearAllMetrics: () => void;
  clearCurrentSession: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function calculateStats(values: number[]): AggregatedStats {
  if (values.length === 0) {
    return { mean: 0, stdDev: 0, min: 0, max: 0, median: 0, count: 0, values: [] };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];

  return {
    mean,
    stdDev,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median,
    count: values.length,
    values: sorted,
  };
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useMetricsStore = create<MetricsState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentSession: null,
      sessions: [],
      timings: [],
      matchResults: [],
      isPanelVisible: false,

      // Start a new measurement session
      startSession: (sessionType, credentialId) => {
        const sessionId = generateSessionId();
        const session: SessionMetrics = {
          sessionId,
          sessionType,
          credentialId,
          startTime: performance.now(),
          timings: {},
        };

        set({ currentSession: session });
        console.log(`📊 [Metrics] Session started: ${sessionId} (${sessionType})`);

        return sessionId;
      },

      // End the current session
      endSession: (matchResult) => {
        const { currentSession, sessions, matchResults } = get();

        if (!currentSession) {
          console.warn('📊 [Metrics] No active session to end');
          return;
        }

        const endTime = performance.now();
        const totalDurationMs = endTime - currentSession.startTime;

        const completedSession: SessionMetrics = {
          ...currentSession,
          endTime,
          totalDurationMs,
        };

        // Record match result if provided
        if (matchResult) {
          const fullMatchResult: MatchResult = {
            ...matchResult,
            sessionId: currentSession.sessionId,
            timestamp: Date.now(),
          };
          completedSession.matchResult = fullMatchResult;

          set({
            matchResults: [...matchResults, fullMatchResult],
          });
        }

        set({
          currentSession: null,
          sessions: [...sessions, completedSession],
        });

        console.log(`📊 [Metrics] Session ended: ${currentSession.sessionId} (${totalDurationMs.toFixed(2)}ms total)`);
      },

      // Record a timing measurement
      recordTiming: (operation, durationMs, metadata) => {
        const { currentSession, timings } = get();

        const timing: OperationTiming = {
          operation,
          durationMs,
          timestamp: Date.now(),
          sessionId: currentSession?.sessionId || 'no_session',
          sessionType: currentSession?.sessionType || 'enrollment',
          metadata,
        };

        // Update current session timings
        if (currentSession) {
          set({
            currentSession: {
              ...currentSession,
              timings: {
                ...currentSession.timings,
                [operation]: durationMs,
              },
            },
          });
        }

        set({ timings: [...timings, timing] });

        console.log(`📊 [Metrics] ${operation}: ${durationMs.toFixed(2)}ms`);
      },

      // Record proof size
      recordProofSize: (sizeBytes) => {
        const { currentSession } = get();

        if (currentSession) {
          set({
            currentSession: {
              ...currentSession,
              proofSizeBytes: sizeBytes,
            },
          });
        }

        console.log(`📊 [Metrics] Proof size: ${sizeBytes} bytes (~${(sizeBytes / 1024).toFixed(2)} KB)`);
      },

      // Record match result manually (for impostor tests)
      recordMatchResult: (result) => {
        const { currentSession, matchResults } = get();

        const fullResult: MatchResult = {
          ...result,
          sessionId: currentSession?.sessionId || 'manual_test',
          timestamp: Date.now(),
        };

        set({ matchResults: [...matchResults, fullResult] });

        const label = result.isGenuine ? 'GENUINE' : 'IMPOSTOR';
        console.log(`📊 [Metrics] Match result (${label}): ${result.matchRate.toFixed(2)}% - ${result.passed ? 'PASS' : 'FAIL'}`);
      },

      // Get aggregated stats for a specific operation
      getAggregatedStats: (operation) => {
        const { timings } = get();
        const operationTimings = timings.filter(t => t.operation === operation);

        if (operationTimings.length === 0) return null;

        const values = operationTimings.map(t => t.durationMs);
        return calculateStats(values);
      },

      // Get stats for all operations
      getAllOperationStats: () => {
        const { timings } = get();
        const operations = [...new Set(timings.map(t => t.operation))];

        const stats: Record<string, AggregatedStats> = {};
        for (const op of operations) {
          const values = timings.filter(t => t.operation === op).map(t => t.durationMs);
          stats[op] = calculateStats(values);
        }

        return stats;
      },

      // Get match rate statistics
      getMatchRateStats: () => {
        const { matchResults } = get();

        const genuineTests = matchResults.filter(r => r.isGenuine);
        const impostorTests = matchResults.filter(r => !r.isGenuine);

        const genuineRates = genuineTests.map(r => r.matchRate);
        const impostorRates = impostorTests.map(r => r.matchRate);

        const genuineAvg = genuineRates.length > 0
          ? genuineRates.reduce((a, b) => a + b, 0) / genuineRates.length
          : 0;
        const impostorAvg = impostorRates.length > 0
          ? impostorRates.reduce((a, b) => a + b, 0) / impostorRates.length
          : 0;

        return {
          genuineTests: {
            avgMatchRate: genuineAvg,
            minMatchRate: genuineRates.length > 0 ? Math.min(...genuineRates) : 0,
            maxMatchRate: genuineRates.length > 0 ? Math.max(...genuineRates) : 0,
            passRate: genuineTests.length > 0
              ? (genuineTests.filter(t => t.passed).length / genuineTests.length) * 100
              : 0,
            total: genuineTests.length,
          },
          impostorTests: {
            avgMatchRate: impostorAvg,
            minMatchRate: impostorRates.length > 0 ? Math.min(...impostorRates) : 0,
            maxMatchRate: impostorRates.length > 0 ? Math.max(...impostorRates) : 0,
            passRate: impostorTests.length > 0
              ? (impostorTests.filter(t => t.passed).length / impostorTests.length) * 100
              : 0,
            total: impostorTests.length,
          },
          separationMargin: genuineAvg - impostorAvg,
        };
      },

      // Export to JSON format
      exportToJSON: () => {
        const { sessions, matchResults } = get();
        const operationStats = get().getAllOperationStats();
        const matchStats = get().getMatchRateStats();

        // Calculate proof size stats
        const proofSizes = sessions
          .filter(s => s.proofSizeBytes !== undefined)
          .map(s => s.proofSizeBytes!);

        const proofStats = proofSizes.length > 0 ? {
          avgSizeBytes: proofSizes.reduce((a, b) => a + b, 0) / proofSizes.length,
          minSizeBytes: Math.min(...proofSizes),
          maxSizeBytes: Math.max(...proofSizes),
        } : {
          avgSizeBytes: 0,
          minSizeBytes: 0,
          maxSizeBytes: 0,
        };

        return {
          exportedAt: new Date().toISOString(),
          version: '1.0.0',
          operationTimings: operationStats,
          matchRateResults: matchStats,
          sessions,
          proofStats,
        };
      },

      // Export to CSV format
      exportToCSV: () => {
        const { sessions } = get();

        // Get all unique operation names across all sessions
        const allOperations = new Set<string>();
        sessions.forEach(s => {
          Object.keys(s.timings).forEach(op => allOperations.add(op));
        });
        const operationColumns = [...allOperations].sort();

        // Build header
        const headers = [
          'session_id',
          'type',
          'credential_id',
          'total_duration_ms',
          ...operationColumns,
          'match_rate',
          'match_count',
          'total_bits',
          'is_genuine',
          'passed',
          'proof_size_bytes',
        ];

        // Build rows
        const rows = sessions.map(s => {
          const row = [
            s.sessionId,
            s.sessionType,
            s.credentialId,
            s.totalDurationMs?.toFixed(2) || '',
            ...operationColumns.map(op => s.timings[op]?.toFixed(2) || ''),
            s.matchResult?.matchRate?.toFixed(2) || '',
            s.matchResult?.matchCount?.toString() || '',
            s.matchResult?.totalBits?.toString() || '',
            s.matchResult?.isGenuine?.toString() || '',
            s.matchResult?.passed?.toString() || '',
            s.proofSizeBytes?.toString() || '',
          ];
          return row.join(',');
        });

        return [headers.join(','), ...rows].join('\n');
      },

      // Toggle panel visibility
      togglePanel: () => {
        set(state => ({ isPanelVisible: !state.isPanelVisible }));
      },

      setPanelVisible: (visible) => {
        set({ isPanelVisible: visible });
      },

      // Clear all metrics
      clearAllMetrics: () => {
        set({
          currentSession: null,
          sessions: [],
          timings: [],
          matchResults: [],
        });
        console.log('📊 [Metrics] All metrics cleared');
      },

      // Clear current session only
      clearCurrentSession: () => {
        set({ currentSession: null });
      },
    }),
    {
      name: 'zkbiown-metrics-storage',
      partialize: (state) => ({
        sessions: state.sessions,
        timings: state.timings,
        matchResults: state.matchResults,
        isPanelVisible: state.isPanelVisible,
      }),
    }
  )
);

// ============================================================================
// Timing Helper Hook
// ============================================================================

/**
 * Helper function to create a timing wrapper
 * Usage:
 *   const result = await withTiming('operationName', async () => {
 *     // ... operation code ...
 *     return value;
 *   });
 */
export async function withTiming<T>(
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const startTime = performance.now();
  try {
    const result = await fn();
    const durationMs = performance.now() - startTime;
    useMetricsStore.getState().recordTiming(operation, durationMs, metadata);
    return result;
  } catch (error) {
    const durationMs = performance.now() - startTime;
    useMetricsStore.getState().recordTiming(operation, durationMs, { ...metadata, error: true });
    throw error;
  }
}

/**
 * Synchronous version of withTiming
 */
export function withTimingSync<T>(
  operation: string,
  fn: () => T,
  metadata?: Record<string, unknown>
): T {
  const startTime = performance.now();
  try {
    const result = fn();
    const durationMs = performance.now() - startTime;
    useMetricsStore.getState().recordTiming(operation, durationMs, metadata);
    return result;
  } catch (error) {
    const durationMs = performance.now() - startTime;
    useMetricsStore.getState().recordTiming(operation, durationMs, { ...metadata, error: true });
    throw error;
  }
}

// Export operation name constants for consistency
export const METRIC_OPERATIONS = {
  FACE_DETECTION: 'faceDetection',
  COMPOSITE_KEY_DERIVATION: 'compositeKeyDerivation',
  SPARSE_MATRIX_GENERATION: 'sparseMatrixGeneration',
  MATRIX_VECTOR_PROJECTION: 'matrixVectorProjection',
  ZSCORE_ENCODING: 'zScoreEncoding',
  POSEIDON_HASHING: 'poseidonHashing',
  WITNESS_PREPARATION: 'witnessPreparation',
  ZK_PROOF_GENERATION: 'zkProofGeneration',
  ZK_PROOF_VERIFICATION: 'zkProofVerification',
  TOTAL_ENROLLMENT: 'totalEnrollment',
  TOTAL_VERIFICATION: 'totalVerification',
} as const;
