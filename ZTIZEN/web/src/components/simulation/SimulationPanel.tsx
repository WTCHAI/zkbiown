/**
 * SimulationPanel
 *
 * Main container for the System Flow visualization
 * Shows step-by-step progression through enrollment or verification
 *
 * Features:
 * - Floating toggle button (bottom-right)
 * - Slide-in panel from right
 * - Two tabs: Flow (current operation) and Navigate (demo guidance)
 * - Dynamic flow diagram based on current stage
 */

import { useState } from 'react';
import { useSimulationStore } from '@/stores/useSimulationStore';
import { FlowDiagram } from './FlowDiagram';
import { DemoNavigation } from './DemoNavigation';

type TabType = 'flow' | 'navigate';

export function SimulationPanel() {
  const { isOpen, toggle, close, flowType, resetFlow } = useSimulationStore();
  const [activeTab, setActiveTab] = useState<TabType>('navigate');

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={toggle}
        style={{
          ...styles.fab,
          transform: isOpen ? 'scale(0.9)' : 'scale(1)',
        }}
        aria-label="Toggle System Flow"
      >
        <span style={styles.fabIcon}>{isOpen ? '✕' : '🔬'}</span>
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          style={styles.overlay}
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Panel */}
      <div
        style={{
          ...styles.panel,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.headerIcon}>🔬</span>
            <span style={styles.headerTitle}>Demo Panel</span>
          </div>
          <button onClick={close} style={styles.closeButton}>
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            onClick={() => setActiveTab('navigate')}
            style={{
              ...styles.tab,
              ...(activeTab === 'navigate' ? styles.tabActive : {}),
            }}
          >
            🧭 Navigate
          </button>
          <button
            onClick={() => setActiveTab('flow')}
            style={{
              ...styles.tab,
              ...(activeTab === 'flow' ? styles.tabActive : {}),
            }}
          >
            📊 Flow
            {flowType !== 'idle' && (
              <span style={styles.tabBadge}>●</span>
            )}
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {activeTab === 'navigate' && <DemoNavigation />}
          {activeTab === 'flow' && (
            <>
              <FlowDiagram />
              {/* Reset Button for Flow tab */}
              {flowType !== 'idle' && (
                <div style={styles.resetSection}>
                  <button onClick={resetFlow} style={styles.resetButton}>
                    Reset Flow
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  // Floating Action Button
  fab: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    backgroundColor: '#1a1a1a',
    color: '#fff',
    border: 'none',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    cursor: 'pointer',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.2s ease, background-color 0.2s ease',
  },
  fabIcon: {
    fontSize: '1.5rem',
  },

  // Overlay
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 1001,
  },

  // Panel
  panel: {
    position: 'fixed',
    top: 0,
    right: 0,
    width: '340px',
    maxWidth: '90vw',
    height: '100vh',
    backgroundColor: '#fff',
    boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
    zIndex: 1002,
    display: 'flex',
    flexDirection: 'column',
    transition: 'transform 0.3s ease',
  },

  // Header
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 1.25rem',
    borderBottom: '1px solid #e5e5e5',
    backgroundColor: '#f8f9fa',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  headerIcon: {
    fontSize: '1.25rem',
  },
  headerTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#1a1a1a',
  },
  closeButton: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontSize: '1rem',
    color: '#666',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Tabs
  tabs: {
    display: 'flex',
    borderBottom: '1px solid #e5e5e5',
    padding: '0 0.5rem',
  },
  tab: {
    flex: 1,
    padding: '0.75rem 0.5rem',
    fontSize: '0.85rem',
    fontWeight: 500,
    color: '#666',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.35rem',
    transition: 'color 0.2s, border-color 0.2s',
  },
  tabActive: {
    color: '#1a1a1a',
    borderBottomColor: '#1a1a1a',
    fontWeight: 600,
  },
  tabBadge: {
    color: '#22c55e',
    fontSize: '0.5rem',
  },

  // Content
  content: {
    flex: 1,
    overflowY: 'auto',
  },

  // Reset Section
  resetSection: {
    padding: '1rem',
    borderTop: '1px solid #e5e5e5',
  },
  resetButton: {
    width: '100%',
    padding: '0.75rem',
    fontSize: '0.85rem',
    fontWeight: 500,
    color: '#666',
    backgroundColor: '#f5f5f5',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
};
