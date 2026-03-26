/**
 * MetricsPanel Component
 *
 * Collapsible panel for displaying live performance metrics during
 * enrollment and verification flows. Used for academic research and
 * proposal documentation.
 *
 * Features:
 * - Live metrics during active session
 * - Aggregated statistics table
 * - Match rate display with targets
 * - Export buttons (JSON/CSV)
 */

import React, { useState } from 'react';
import {
  useMetricsStore,
  METRIC_OPERATIONS,
  type AggregatedStats,
} from '@/stores/useMetricsStore';

// Target metrics from proposal document
const TARGET_METRICS: Record<string, { target: number; unit: string; description: string }> = {
  [METRIC_OPERATIONS.FACE_DETECTION]: { target: 130, unit: 'ms', description: 'TinyFace + FaceNet' },
  [METRIC_OPERATIONS.COMPOSITE_KEY_DERIVATION]: { target: 2, unit: 'ms', description: 'SHA-256' },
  [METRIC_OPERATIONS.SPARSE_MATRIX_GENERATION]: { target: 180, unit: 'ms', description: '128×128 AES-CTR' },
  [METRIC_OPERATIONS.MATRIX_VECTOR_PROJECTION]: { target: 15, unit: 'ms', description: 'Optimized sparse' },
  [METRIC_OPERATIONS.ZSCORE_ENCODING]: { target: 11, unit: 'ms', description: 'Self-normalizing' },
  [METRIC_OPERATIONS.POSEIDON_HASHING]: { target: 450, unit: 'ms', description: '128 hash operations' },
  [METRIC_OPERATIONS.TOTAL_ENROLLMENT]: { target: 800, unit: 'ms', description: 'Without network' },
  [METRIC_OPERATIONS.WITNESS_PREPARATION]: { target: 50, unit: 'ms', description: 'Format conversion' },
  [METRIC_OPERATIONS.ZK_PROOF_GENERATION]: { target: 3500, unit: 'ms', description: 'Circuit execution' },
  [METRIC_OPERATIONS.TOTAL_VERIFICATION]: { target: 4500, unit: 'ms', description: 'Including ZK proof' },
  [METRIC_OPERATIONS.ZK_PROOF_VERIFICATION]: { target: 150, unit: 'ms', description: 'BB.js verify' },
};

const MATCH_RATE_TARGETS = {
  genuine: { min: 80, target: 86.1, description: 'Genuine Match Rate' },
  impostor: { max: 40, target: 30.5, description: 'Impostor Match Rate' },
};

export function MetricsPanel() {
  const {
    currentSession,
    sessions,
    isPanelVisible,
    togglePanel,
    getAllOperationStats,
    getMatchRateStats,
    exportToJSON,
    exportToCSV,
    clearAllMetrics,
  } = useMetricsStore();

  const [activeTab, setActiveTab] = useState<'live' | 'aggregate' | 'match'>('live');

  const operationStats = getAllOperationStats();
  const matchStats = getMatchRateStats();

  // Download helper
  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const data = exportToJSON();
    downloadFile(JSON.stringify(data, null, 2), `zkbiown_metrics_${Date.now()}.json`, 'application/json');
  };

  const handleExportCSV = () => {
    const csv = exportToCSV();
    downloadFile(csv, `zkbiown_metrics_${Date.now()}.csv`, 'text/csv');
  };

  // Format duration with color based on target
  const formatDuration = (value: number | undefined, operation: string): React.ReactNode => {
    if (value === undefined) return <span style={styles.noData}>—</span>;

    const target = TARGET_METRICS[operation];
    const formatted = value.toFixed(1);

    if (!target) {
      return <span>{formatted} ms</span>;
    }

    const ratio = value / target.target;
    let color = '#22c55e'; // green - good
    if (ratio > 1.5) color = '#ef4444'; // red - bad
    else if (ratio > 1.2) color = '#f59e0b'; // yellow - warning

    return (
      <span style={{ color, fontWeight: 500 }}>
        {formatted} ms
        <span style={styles.targetHint}>({((ratio - 1) * 100).toFixed(0)}%)</span>
      </span>
    );
  };

  // Format stat row
  const renderStatRow = (operation: string, stats: AggregatedStats | undefined) => {
    const target = TARGET_METRICS[operation];
    const displayName = operation.replace(/([A-Z])/g, ' $1').trim();

    return (
      <tr key={operation} style={styles.tableRow}>
        <td style={styles.tableCell}>
          <span style={styles.operationName}>{displayName}</span>
          {target && <span style={styles.operationDesc}>{target.description}</span>}
        </td>
        <td style={styles.tableCellRight}>
          {stats ? formatDuration(stats.mean, operation) : '—'}
        </td>
        <td style={styles.tableCellRight}>
          {stats ? `±${stats.stdDev.toFixed(1)}` : '—'}
        </td>
        <td style={styles.tableCellRight}>
          {stats ? stats.min.toFixed(1) : '—'}
        </td>
        <td style={styles.tableCellRight}>
          {stats ? stats.max.toFixed(1) : '—'}
        </td>
        <td style={styles.tableCellRight}>
          {target ? `${target.target} ms` : '—'}
        </td>
        <td style={styles.tableCellRight}>
          {stats ? stats.count : 0}
        </td>
      </tr>
    );
  };

  // Collapsed button
  if (!isPanelVisible) {
    return (
      <button
        onClick={togglePanel}
        style={styles.collapsedButton}
        title="Show Metrics Panel"
      >
        📊
      </button>
    );
  }

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>📊 ZK BIOWN Metrics</span>
        <div style={styles.headerActions}>
          <button onClick={handleExportJSON} style={styles.smallButton} title="Export JSON">
            📥 JSON
          </button>
          <button onClick={handleExportCSV} style={styles.smallButton} title="Export CSV">
            📥 CSV
          </button>
          <button
            onClick={clearAllMetrics}
            style={{ ...styles.smallButton, backgroundColor: '#fee2e2', color: '#dc2626' }}
            title="Clear All"
          >
            🗑️
          </button>
          <button onClick={togglePanel} style={styles.closeButton} title="Close">
            ✕
          </button>
        </div>
      </div>

      {/* Session Status */}
      {currentSession && (
        <div style={styles.sessionStatus}>
          <span style={styles.sessionBadge}>
            {currentSession.sessionType === 'enrollment' ? '📝' : '✓'}
            {currentSession.sessionType.toUpperCase()}
          </span>
          <span style={styles.sessionId}>{currentSession.sessionId.slice(0, 16)}...</span>
          <span style={styles.sessionTime}>
            {((performance.now() - currentSession.startTime) / 1000).toFixed(1)}s
          </span>
        </div>
      )}

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          onClick={() => setActiveTab('live')}
          style={activeTab === 'live' ? styles.tabActive : styles.tab}
        >
          Live ({currentSession ? Object.keys(currentSession.timings).length : 0})
        </button>
        <button
          onClick={() => setActiveTab('aggregate')}
          style={activeTab === 'aggregate' ? styles.tabActive : styles.tab}
        >
          Aggregated ({Object.keys(operationStats).length})
        </button>
        <button
          onClick={() => setActiveTab('match')}
          style={activeTab === 'match' ? styles.tabActive : styles.tab}
        >
          Match Rates ({matchStats.genuineTests.total + matchStats.impostorTests.total})
        </button>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {/* Live Tab */}
        {activeTab === 'live' && (
          <div style={styles.liveContent}>
            {currentSession ? (
              <div style={styles.liveTimings}>
                {Object.entries(currentSession.timings).map(([op, duration]) => (
                  <div key={op} style={styles.liveRow}>
                    <span style={styles.liveLabel}>{op.replace(/([A-Z])/g, ' $1').trim()}</span>
                    {formatDuration(duration, op)}
                  </div>
                ))}
                {Object.keys(currentSession.timings).length === 0 && (
                  <div style={styles.emptyState}>Waiting for operations...</div>
                )}
              </div>
            ) : (
              <div style={styles.emptyState}>
                No active session.
                <br />
                <span style={{ fontSize: '0.8rem' }}>
                  Sessions: {sessions.length} recorded
                </span>
              </div>
            )}
          </div>
        )}

        {/* Aggregated Tab */}
        {activeTab === 'aggregate' && (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.tableHeader}>Operation</th>
                  <th style={styles.tableHeaderRight}>Mean</th>
                  <th style={styles.tableHeaderRight}>StdDev</th>
                  <th style={styles.tableHeaderRight}>Min</th>
                  <th style={styles.tableHeaderRight}>Max</th>
                  <th style={styles.tableHeaderRight}>Target</th>
                  <th style={styles.tableHeaderRight}>N</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(METRIC_OPERATIONS).map(op =>
                  renderStatRow(op, operationStats[op])
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Match Rates Tab */}
        {activeTab === 'match' && (
          <div style={styles.matchContent}>
            {/* Genuine Tests */}
            <div style={styles.matchCard}>
              <div style={styles.matchHeader}>
                <span style={styles.matchTitle}>✅ Genuine Tests</span>
                <span style={styles.matchCount}>{matchStats.genuineTests.total} tests</span>
              </div>
              <div style={styles.matchStats}>
                <div style={styles.matchStat}>
                  <span style={styles.matchLabel}>Avg Match Rate</span>
                  <span style={{
                    ...styles.matchValue,
                    color: matchStats.genuineTests.avgMatchRate >= MATCH_RATE_TARGETS.genuine.min
                      ? '#22c55e' : '#ef4444',
                  }}>
                    {matchStats.genuineTests.avgMatchRate.toFixed(1)}%
                  </span>
                  <span style={styles.matchTarget}>
                    Target: ≥{MATCH_RATE_TARGETS.genuine.min}% (goal: {MATCH_RATE_TARGETS.genuine.target}%)
                  </span>
                </div>
                <div style={styles.matchStat}>
                  <span style={styles.matchLabel}>Pass Rate</span>
                  <span style={styles.matchValue}>{matchStats.genuineTests.passRate.toFixed(1)}%</span>
                </div>
                <div style={styles.matchStat}>
                  <span style={styles.matchLabel}>Range</span>
                  <span style={styles.matchValue}>
                    {matchStats.genuineTests.minMatchRate.toFixed(1)}% - {matchStats.genuineTests.maxMatchRate.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Impostor Tests */}
            <div style={styles.matchCard}>
              <div style={styles.matchHeader}>
                <span style={styles.matchTitle}>❌ Impostor Tests</span>
                <span style={styles.matchCount}>{matchStats.impostorTests.total} tests</span>
              </div>
              <div style={styles.matchStats}>
                <div style={styles.matchStat}>
                  <span style={styles.matchLabel}>Avg Match Rate</span>
                  <span style={{
                    ...styles.matchValue,
                    color: matchStats.impostorTests.avgMatchRate <= MATCH_RATE_TARGETS.impostor.max
                      ? '#22c55e' : '#ef4444',
                  }}>
                    {matchStats.impostorTests.avgMatchRate.toFixed(1)}%
                  </span>
                  <span style={styles.matchTarget}>
                    Target: ≤{MATCH_RATE_TARGETS.impostor.max}% (goal: {MATCH_RATE_TARGETS.impostor.target}%)
                  </span>
                </div>
                <div style={styles.matchStat}>
                  <span style={styles.matchLabel}>Rejection Rate</span>
                  <span style={styles.matchValue}>
                    {(100 - matchStats.impostorTests.passRate).toFixed(1)}%
                  </span>
                </div>
                <div style={styles.matchStat}>
                  <span style={styles.matchLabel}>Range</span>
                  <span style={styles.matchValue}>
                    {matchStats.impostorTests.minMatchRate.toFixed(1)}% - {matchStats.impostorTests.maxMatchRate.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Separation Margin */}
            <div style={styles.separationCard}>
              <span style={styles.separationLabel}>Separation Margin (Genuine - Impostor)</span>
              <span style={{
                ...styles.separationValue,
                color: matchStats.separationMargin >= 50 ? '#22c55e' :
                       matchStats.separationMargin >= 30 ? '#f59e0b' : '#ef4444',
              }}>
                {matchStats.separationMargin.toFixed(1)}%
              </span>
              <span style={styles.separationHint}>Higher is better (target: ≥50%)</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <span>Sessions: {sessions.length}</span>
        <span>•</span>
        <span>Last: {sessions.length > 0 ? sessions[sessions.length - 1].sessionType : 'N/A'}</span>
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    width: '480px',
    maxHeight: '600px',
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    border: '1px solid #e5e5e5',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '0.85rem',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  collapsedButton: {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: '#1a1a1a',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1.25rem',
    zIndex: 9999,
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #e5e5e5',
    backgroundColor: '#f9fafb',
  },
  title: {
    fontWeight: 600,
    fontSize: '0.9rem',
  },
  headerActions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  smallButton: {
    padding: '4px 8px',
    fontSize: '0.75rem',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#f0f0f0',
    cursor: 'pointer',
  },
  closeButton: {
    padding: '4px 8px',
    fontSize: '0.9rem',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    cursor: 'pointer',
  },
  sessionStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: '#ecfdf5',
    borderBottom: '1px solid #d1fae5',
  },
  sessionBadge: {
    backgroundColor: '#10b981',
    color: '#fff',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '0.7rem',
    fontWeight: 600,
  },
  sessionId: {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    color: '#666',
    flex: 1,
  },
  sessionTime: {
    fontWeight: 500,
    color: '#059669',
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid #e5e5e5',
  },
  tab: {
    flex: 1,
    padding: '10px',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontSize: '0.8rem',
    color: '#666',
  },
  tabActive: {
    flex: 1,
    padding: '10px',
    border: 'none',
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#1a1a1a',
    borderBottom: '2px solid #1a1a1a',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
  },
  liveContent: {
    minHeight: '150px',
  },
  liveTimings: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  liveRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 8px',
    backgroundColor: '#f9fafb',
    borderRadius: '4px',
  },
  liveLabel: {
    color: '#666',
    fontSize: '0.8rem',
  },
  emptyState: {
    textAlign: 'center',
    color: '#999',
    padding: '32px',
  },
  tableWrapper: {
    overflow: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.75rem',
  },
  tableHeader: {
    textAlign: 'left',
    padding: '8px 4px',
    borderBottom: '2px solid #e5e5e5',
    fontWeight: 600,
    color: '#666',
  },
  tableHeaderRight: {
    textAlign: 'right',
    padding: '8px 4px',
    borderBottom: '2px solid #e5e5e5',
    fontWeight: 600,
    color: '#666',
  },
  tableRow: {
    borderBottom: '1px solid #f0f0f0',
  },
  tableCell: {
    padding: '8px 4px',
    verticalAlign: 'top',
  },
  tableCellRight: {
    padding: '8px 4px',
    textAlign: 'right',
    fontFamily: 'monospace',
    fontSize: '0.75rem',
  },
  operationName: {
    display: 'block',
    fontWeight: 500,
    fontSize: '0.8rem',
  },
  operationDesc: {
    display: 'block',
    fontSize: '0.7rem',
    color: '#999',
  },
  targetHint: {
    fontSize: '0.65rem',
    color: '#999',
    marginLeft: '4px',
  },
  noData: {
    color: '#ccc',
  },
  matchContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  matchCard: {
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    padding: '12px',
    border: '1px solid #e5e5e5',
  },
  matchHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  matchTitle: {
    fontWeight: 600,
  },
  matchCount: {
    fontSize: '0.75rem',
    color: '#666',
  },
  matchStats: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  matchStat: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
  },
  matchLabel: {
    fontSize: '0.75rem',
    color: '#666',
    width: '100px',
  },
  matchValue: {
    fontWeight: 600,
    fontSize: '0.9rem',
  },
  matchTarget: {
    fontSize: '0.7rem',
    color: '#999',
  },
  separationCard: {
    backgroundColor: '#f0f9ff',
    borderRadius: '8px',
    padding: '12px',
    border: '1px solid #bae6fd',
    textAlign: 'center',
  },
  separationLabel: {
    display: 'block',
    fontSize: '0.75rem',
    color: '#0369a1',
    marginBottom: '4px',
  },
  separationValue: {
    display: 'block',
    fontWeight: 700,
    fontSize: '1.5rem',
  },
  separationHint: {
    display: 'block',
    fontSize: '0.7rem',
    color: '#999',
    marginTop: '4px',
  },
  footer: {
    display: 'flex',
    gap: '8px',
    padding: '8px 16px',
    borderTop: '1px solid #e5e5e5',
    fontSize: '0.75rem',
    color: '#999',
    backgroundColor: '#f9fafb',
  },
};

export default MetricsPanel;
