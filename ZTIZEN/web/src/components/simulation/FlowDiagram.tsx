/**
 * FlowDiagram Component
 *
 * Visualizes the enrollment/verification flow with two view modes:
 * 1. System Diagram: Architecture view with animated data flow
 * 2. Step List: Linear step-by-step progress (compact)
 *
 * The System Diagram shows real-time animation as users progress
 * through the enrollment/verification flows.
 */

import React, { useState } from 'react';
import { StepNode, StepStatus } from './StepNode';
import { SystemDiagram } from './SystemDiagram';
import { useSimulationStore, FlowType, FlowStep } from '@/stores/useSimulationStore';

// Step definitions for enrollment flow
const ENROLLMENT_STEPS: { id: FlowStep; label: string; description: string }[] = [
  { id: 'pin', label: 'PIN Entry', description: 'Enter 6-digit PIN' },
  { id: 'pin_confirm', label: 'PIN Confirm', description: 'Confirm your PIN' },
  { id: 'password', label: 'Password', description: 'Enter password' },
  { id: 'signature', label: 'Wallet Sign', description: 'Sign for userKey derivation' },
  { id: 'credential_create', label: 'Keys Created', description: 'Product + ZTIZEN partial keys' },
  { id: 'biometric', label: 'Face Scan', description: 'Capture 478 landmarks' },
  { id: 'template', label: 'Template Gen', description: 'CancelableBiometric generation' },
  { id: 'commit', label: 'Commitments', description: 'Poseidon hash (128 bits)' },
  { id: 'store', label: 'Store', description: 'Save to ZTIZEN database' },
  { id: 'complete', label: 'Complete', description: 'Enrollment successful' },
];

// Step definitions for verification flow
const VERIFICATION_STEPS: { id: FlowStep; label: string; description: string }[] = [
  { id: 'pin', label: 'PIN Entry', description: 'Enter your PIN' },
  { id: 'password', label: 'Password', description: 'Enter password' },
  { id: 'signature', label: 'Wallet Sign', description: 'Sign for userKey' },
  { id: 'biometric', label: 'Face Scan', description: 'Capture biometric' },
  { id: 'compare', label: 'Compare', description: 'Template match (204/256)' },
  { id: 'result', label: 'Result', description: 'Success/Fail + nonce roll' },
  { id: 'complete', label: 'Complete', description: 'Verification complete' },
];

type ViewMode = 'diagram' | 'steps';

interface FlowDiagramProps {
  flowType?: FlowType;
}

export function FlowDiagram({ flowType: propFlowType }: FlowDiagramProps) {
  const { flowType: storeFlowType, currentStep, completedSteps } = useSimulationStore();
  const [viewMode, setViewMode] = useState<ViewMode>('diagram');

  const flowType = propFlowType || storeFlowType;

  const steps = flowType === 'enrollment' ? ENROLLMENT_STEPS : VERIFICATION_STEPS;

  const getStepStatus = (stepId: string): StepStatus => {
    if (completedSteps.includes(stepId)) return 'complete';
    if (currentStep === stepId) return 'active';
    return 'pending';
  };

  // Calculate progress
  const completedCount = completedSteps.length;
  const totalSteps = steps.length;
  const progressPercent = flowType === 'idle' ? 0 : Math.round((completedCount / totalSteps) * 100);

  if (flowType === 'idle') {
    return (
      <div style={styles.idleContainer}>
        <div style={styles.idleIcon}>🏗️</div>
        <div style={styles.idleTitle}>System Flow</div>
        <div style={styles.idleSubtitle}>
          Start enrollment or verification to see the data flow through the system
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* View Toggle */}
      <div style={styles.viewToggle}>
        <button
          onClick={() => setViewMode('diagram')}
          style={{
            ...styles.toggleButton,
            ...(viewMode === 'diagram' ? styles.toggleActive : {}),
          }}
        >
          🏗️ Architecture
        </button>
        <button
          onClick={() => setViewMode('steps')}
          style={{
            ...styles.toggleButton,
            ...(viewMode === 'steps' ? styles.toggleActive : {}),
          }}
        >
          📋 Steps
        </button>
      </div>

      {/* Progress Bar */}
      <div style={styles.progressContainer}>
        <div style={styles.progressBar}>
          <div
            style={{
              ...styles.progressFill,
              width: `${progressPercent}%`,
            }}
          />
        </div>
        <span style={styles.progressText}>
          {completedCount}/{totalSteps} ({progressPercent}%)
        </span>
      </div>

      {/* Content based on view mode */}
      {viewMode === 'diagram' ? (
        <SystemDiagram flowType={flowType} />
      ) : (
        <div style={styles.stepsContent}>
          {/* Flow Header */}
          <div style={styles.header}>
            <span style={styles.flowType}>
              {flowType === 'enrollment' ? '📝 ENROLLMENT' : '🔐 VERIFICATION'}
            </span>
          </div>

          {/* Steps List */}
          <div style={styles.stepsContainer}>
            {steps.map((step, index) => (
              <StepNode
                key={step.id}
                label={step.label}
                description={step.description}
                status={getStepStatus(step.id)}
                isLast={index === steps.length - 1}
              />
            ))}
          </div>

          {/* Legend */}
          <div style={styles.legend}>
            <div style={styles.legendItem}>
              <div style={styles.legendComplete}>✓</div>
              <span>Complete</span>
            </div>
            <div style={styles.legendItem}>
              <div style={styles.legendActive}>●</div>
              <span>Active</span>
            </div>
            <div style={styles.legendItem}>
              <div style={styles.legendPending}>○</div>
              <span>Pending</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
  },
  viewToggle: {
    display: 'flex',
    gap: '4px',
    padding: '0.5rem',
    backgroundColor: '#f5f5f5',
    borderBottom: '1px solid #e5e5e5',
  },
  toggleButton: {
    flex: 1,
    padding: '0.5rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: '#666',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  toggleActive: {
    backgroundColor: '#fff',
    color: '#1a1a1a',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  progressContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 0.75rem',
    backgroundColor: '#fafafa',
    borderBottom: '1px solid #e5e5e5',
  },
  progressBar: {
    flex: 1,
    height: '6px',
    backgroundColor: '#e5e5e5',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#22c55e',
    borderRadius: '3px',
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: '0.7rem',
    color: '#666',
    fontWeight: 500,
    minWidth: '60px',
    textAlign: 'right',
  },
  stepsContent: {
    padding: '1rem',
  },
  header: {
    marginBottom: '1.25rem',
  },
  flowType: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#1a1a1a',
    letterSpacing: '0.5px',
  },
  stepsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
  },
  legend: {
    display: 'flex',
    gap: '1rem',
    marginTop: '1.5rem',
    paddingTop: '1rem',
    borderTop: '1px solid #eee',
    justifyContent: 'center',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    fontSize: '0.75rem',
    color: '#666',
  },
  legendComplete: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    backgroundColor: '#22c55e',
    color: '#fff',
    fontSize: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
  },
  legendActive: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    backgroundColor: '#1a1a1a',
    color: '#fff',
    fontSize: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendPending: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    border: '1.5px solid #ccc',
    backgroundColor: '#fff',
    fontSize: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ccc',
  },
  idleContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem 1rem',
    textAlign: 'center',
  },
  idleIcon: {
    fontSize: '2.5rem',
    marginBottom: '0.75rem',
  },
  idleTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#1a1a1a',
    marginBottom: '0.5rem',
  },
  idleSubtitle: {
    fontSize: '0.85rem',
    color: '#666',
    lineHeight: 1.4,
  },
};

export default FlowDiagram;
