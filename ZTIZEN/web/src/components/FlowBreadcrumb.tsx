/**
 * FlowBreadcrumb Component
 *
 * A visual progress indicator that shows the overall journey through the ZTIZEN
 * enrollment or verification flow. Helps users understand where they are in the
 * multi-page process.
 *
 * Usage:
 *   <FlowBreadcrumb
 *     flow="enrollment"
 *     currentPhase="keys"
 *     currentStep={2}
 *   />
 */

import React from 'react';

type FlowType = 'enrollment' | 'verification';

interface FlowPhase {
  id: string;
  label: string;
  icon: string;
  steps?: string[];
}

const ENROLLMENT_PHASES: FlowPhase[] = [
  {
    id: 'service',
    label: 'Select Service',
    icon: '1',
    steps: ['Choose product', 'Confirm service']
  },
  {
    id: 'keys',
    label: 'Create Keys',
    icon: '2',
    steps: ['Enter PIN', 'Confirm PIN', 'Set Password', 'Sign Message']
  },
  {
    id: 'biometric',
    label: 'Face Scan',
    icon: '3',
    steps: ['Position face', 'Capture', 'Process']
  },
  {
    id: 'complete',
    label: 'Done',
    icon: '✓',
    steps: ['Enrolled']
  },
];

const VERIFICATION_PHASES: FlowPhase[] = [
  {
    id: 'auth',
    label: 'Authenticate',
    icon: '1',
    steps: ['Enter PIN', 'Enter Password', 'Sign Message']
  },
  {
    id: 'biometric',
    label: 'Face Scan',
    icon: '2',
    steps: ['Position face', 'Capture']
  },
  {
    id: 'result',
    label: 'Result',
    icon: '3',
    steps: ['Verify', 'ZK Proof']
  },
];

interface FlowBreadcrumbProps {
  flow: FlowType;
  currentPhase: string;
  currentStep?: number;
  totalSteps?: number;
  showStepLabel?: boolean;
  compact?: boolean;
}

export function FlowBreadcrumb({
  flow,
  currentPhase,
  currentStep,
  totalSteps,
  showStepLabel = true,
  compact = false,
}: FlowBreadcrumbProps) {
  const phases = flow === 'enrollment' ? ENROLLMENT_PHASES : VERIFICATION_PHASES;
  const currentPhaseIndex = phases.findIndex(p => p.id === currentPhase);

  const getPhaseStatus = (index: number): 'complete' | 'current' | 'pending' => {
    if (index < currentPhaseIndex) return 'complete';
    if (index === currentPhaseIndex) return 'current';
    return 'pending';
  };

  return (
    <div style={styles.container}>
      {/* Flow Type Label */}
      <div style={styles.flowLabel}>
        {flow === 'enrollment' ? 'ENROLLMENT' : 'VERIFICATION'} FLOW
      </div>

      {/* Phase Indicators */}
      <div style={styles.phasesContainer}>
        {phases.map((phase, index) => {
          const status = getPhaseStatus(index);
          const isLast = index === phases.length - 1;

          return (
            <React.Fragment key={phase.id}>
              {/* Phase Circle + Label */}
              <div style={styles.phaseItem}>
                <div
                  style={{
                    ...styles.phaseCircle,
                    ...(status === 'complete' ? styles.phaseComplete : {}),
                    ...(status === 'current' ? styles.phaseCurrent : {}),
                    ...(status === 'pending' ? styles.phasePending : {}),
                  }}
                >
                  {status === 'complete' ? '✓' : phase.icon}
                </div>
                {!compact && (
                  <div
                    style={{
                      ...styles.phaseLabel,
                      ...(status === 'current' ? styles.phaseLabelActive : {}),
                      ...(status === 'pending' ? styles.phaseLabelPending : {}),
                    }}
                  >
                    {phase.label}
                  </div>
                )}
              </div>

              {/* Connector Line */}
              {!isLast && (
                <div
                  style={{
                    ...styles.connector,
                    ...(status === 'complete' ? styles.connectorComplete : {}),
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Current Step Detail */}
      {showStepLabel && currentStep !== undefined && totalSteps !== undefined && (
        <div style={styles.stepDetail}>
          <span style={styles.stepText}>
            Step {currentStep} of {totalSteps}
            {phases[currentPhaseIndex]?.steps?.[currentStep - 1] && (
              <span style={styles.stepName}>
                {' '}— {phases[currentPhaseIndex].steps[currentStep - 1]}
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

// Step Indicator Component for individual pages
interface StepIndicatorProps {
  steps: Array<{
    id: string;
    label: string;
    icon?: string;
  }>;
  currentStep: string;
  orientation?: 'horizontal' | 'vertical';
}

export function StepIndicator({
  steps,
  currentStep,
  orientation = 'horizontal',
}: StepIndicatorProps) {
  const currentIndex = steps.findIndex(s => s.id === currentStep);

  const getStepStatus = (index: number): 'complete' | 'current' | 'pending' => {
    if (index < currentIndex) return 'complete';
    if (index === currentIndex) return 'current';
    return 'pending';
  };

  if (orientation === 'vertical') {
    return (
      <div style={styles.verticalSteps}>
        {steps.map((step, index) => {
          const status = getStepStatus(index);
          return (
            <div key={step.id} style={styles.verticalStep}>
              <div
                style={{
                  ...styles.stepCircleSmall,
                  ...(status === 'complete' ? styles.stepComplete : {}),
                  ...(status === 'current' ? styles.stepCurrent : {}),
                  ...(status === 'pending' ? styles.stepPending : {}),
                }}
              >
                {status === 'complete' ? '✓' : step.icon || (index + 1)}
              </div>
              <span
                style={{
                  ...styles.stepLabelSmall,
                  ...(status === 'current' ? styles.stepLabelActive : {}),
                  ...(status === 'pending' ? styles.stepLabelPending : {}),
                }}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={styles.horizontalSteps}>
      {steps.map((step, index) => {
        const status = getStepStatus(index);
        const isLast = index === steps.length - 1;

        return (
          <React.Fragment key={step.id}>
            <div style={styles.horizontalStep}>
              <div
                style={{
                  ...styles.stepCircleSmall,
                  ...(status === 'complete' ? styles.stepComplete : {}),
                  ...(status === 'current' ? styles.stepCurrent : {}),
                  ...(status === 'pending' ? styles.stepPending : {}),
                }}
              >
                {status === 'complete' ? '✓' : step.icon || (index + 1)}
              </div>
              <span
                style={{
                  ...styles.stepLabelSmall,
                  ...(status === 'current' ? styles.stepLabelActive : {}),
                  ...(status === 'pending' ? styles.stepLabelPending : {}),
                }}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div
                style={{
                  ...styles.connectorSmall,
                  ...(status === 'complete' ? styles.connectorComplete : {}),
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  // Main Container
  container: {
    padding: '1rem',
    backgroundColor: '#f8f9fa',
    borderRadius: '12px',
    marginBottom: '1.5rem',
    border: '1px solid #e5e5e5',
  },

  // Flow Label
  flowLabel: {
    fontSize: '0.7rem',
    fontWeight: 600,
    letterSpacing: '0.05em',
    color: '#6b7280',
    marginBottom: '0.75rem',
    textTransform: 'uppercase',
  },

  // Phases Container
  phasesContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },

  // Individual Phase
  phaseItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    flex: '0 0 auto',
  },

  // Phase Circle
  phaseCircle: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.875rem',
    fontWeight: 600,
    transition: 'all 0.2s ease',
  },
  phaseComplete: {
    backgroundColor: '#22c55e',
    color: '#fff',
  },
  phaseCurrent: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
    boxShadow: '0 0 0 3px rgba(26, 26, 26, 0.2)',
  },
  phasePending: {
    backgroundColor: '#e5e5e5',
    color: '#9ca3af',
  },

  // Phase Label
  phaseLabel: {
    fontSize: '0.75rem',
    fontWeight: 500,
    color: '#374151',
    textAlign: 'center',
    maxWidth: '80px',
  },
  phaseLabelActive: {
    fontWeight: 600,
    color: '#1a1a1a',
  },
  phaseLabelPending: {
    color: '#9ca3af',
  },

  // Connector Line
  connector: {
    flex: 1,
    height: '2px',
    backgroundColor: '#e5e5e5',
    marginBottom: '1.5rem', // Align with circles
  },
  connectorComplete: {
    backgroundColor: '#22c55e',
  },

  // Step Detail
  stepDetail: {
    marginTop: '0.75rem',
    paddingTop: '0.75rem',
    borderTop: '1px solid #e5e5e5',
    textAlign: 'center',
  },
  stepText: {
    fontSize: '0.8rem',
    color: '#6b7280',
  },
  stepName: {
    color: '#374151',
    fontWeight: 500,
  },

  // Horizontal Steps (for StepIndicator)
  horizontalSteps: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  horizontalStep: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.25rem',
  },

  // Vertical Steps
  verticalSteps: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  verticalStep: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },

  // Small Step Circle
  stepCircleSmall: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.75rem',
    fontWeight: 600,
  },
  stepComplete: {
    backgroundColor: '#22c55e',
    color: '#fff',
  },
  stepCurrent: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
  },
  stepPending: {
    backgroundColor: '#e5e5e5',
    color: '#9ca3af',
  },

  // Small Step Label
  stepLabelSmall: {
    fontSize: '0.75rem',
    color: '#374151',
  },
  stepLabelActive: {
    fontWeight: 600,
    color: '#1a1a1a',
  },
  stepLabelPending: {
    color: '#9ca3af',
  },

  // Small Connector
  connectorSmall: {
    width: '20px',
    height: '2px',
    backgroundColor: '#e5e5e5',
    marginBottom: '1rem', // Align with circles
  },
};

export default FlowBreadcrumb;
