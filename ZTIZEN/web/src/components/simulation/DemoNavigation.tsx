/**
 * DemoNavigation Component
 *
 * Shows overall demo flow progress and navigation guidance
 * Displayed in the SimulationPanel drawer
 */

import React from 'react';
import { useNavigate, useLocation } from '@tanstack/react-router';
import {
  useDemoNavigationStore,
  DEMO_STEPS,
  type DemoStep,
} from '@/stores/useDemoNavigationStore';

export function DemoNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    currentStep,
    completedSteps,
    lastCredentialId,
    setCurrentStep,
    completeStep,
    getProgress,
    resetDemo,
  } = useDemoNavigationStore();

  const handleNavigate = (route: string, step: DemoStep) => {
    // Handle dynamic routes
    let targetRoute = route;

    // If route needs credential ID
    if (step === 'enroll_complete' && lastCredentialId) {
      targetRoute = `/ztizen/register/${lastCredentialId}`;
    } else if (step === 'verify_complete' && lastCredentialId) {
      targetRoute = `/ztizen/verify/${lastCredentialId}`;
    }

    if (targetRoute) {
      navigate({ to: targetRoute });
    }
  };

  const progress = getProgress();

  return (
    <div style={styles.container}>
      {/* Progress Bar */}
      <div style={styles.progressSection}>
        <div style={styles.progressLabel}>
          <span>Demo Progress</span>
          <span style={styles.progressPercent}>{progress}%</span>
        </div>
        <div style={styles.progressBar}>
          <div
            style={{
              ...styles.progressFill,
              width: `${progress}%`,
            }}
          />
        </div>
      </div>

      {/* Steps List */}
      <div style={styles.stepsList}>
        {DEMO_STEPS.map((step, index) => {
          const isComplete = completedSteps.includes(step.id);
          const isCurrent = currentStep === step.id;
          const isPending = !isComplete && !isCurrent;

          // Determine if step is clickable
          const isClickable =
            step.route &&
            (isComplete || isCurrent || index <= DEMO_STEPS.findIndex(s => s.id === currentStep) + 1);

          return (
            <div
              key={step.id}
              style={{
                ...styles.stepItem,
                ...(isCurrent ? styles.stepItemCurrent : {}),
                ...(isComplete ? styles.stepItemComplete : {}),
                ...(isClickable ? styles.stepItemClickable : {}),
              }}
              onClick={() => isClickable && handleNavigate(step.route, step.id)}
            >
              {/* Step Number/Icon */}
              <div
                style={{
                  ...styles.stepIcon,
                  ...(isComplete ? styles.stepIconComplete : {}),
                  ...(isCurrent ? styles.stepIconCurrent : {}),
                }}
              >
                {isComplete ? '✓' : index + 1}
              </div>

              {/* Step Content */}
              <div style={styles.stepContent}>
                <div
                  style={{
                    ...styles.stepLabel,
                    ...(isCurrent ? styles.stepLabelCurrent : {}),
                    ...(isPending ? styles.stepLabelPending : {}),
                  }}
                >
                  {step.label}
                </div>
                <div style={styles.stepDescription}>{step.description}</div>
              </div>

              {/* Arrow for current/actionable */}
              {(isCurrent || (isClickable && !isComplete)) && step.route && (
                <div style={styles.stepArrow}>→</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Current Step Highlight */}
      <div style={styles.currentStepCard}>
        <div style={styles.currentStepHeader}>📍 Current Step</div>
        <div style={styles.currentStepLabel}>
          {DEMO_STEPS.find(s => s.id === currentStep)?.label}
        </div>
        <div style={styles.currentStepDesc}>
          {DEMO_STEPS.find(s => s.id === currentStep)?.description}
        </div>
        {DEMO_STEPS.find(s => s.id === currentStep)?.route && (
          <button
            onClick={() => {
              const step = DEMO_STEPS.find(s => s.id === currentStep);
              if (step) handleNavigate(step.route, step.id);
            }}
            style={styles.goButton}
          >
            {DEMO_STEPS.find(s => s.id === currentStep)?.action || 'Go'} →
          </button>
        )}
      </div>

      {/* Reset Button */}
      <button onClick={resetDemo} style={styles.resetButton}>
        🔄 Reset Demo
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '1rem',
    borderTop: '1px solid #e5e5e5',
    marginTop: '0.5rem',
  },

  // Progress Bar
  progressSection: {
    marginBottom: '1rem',
  },
  progressLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: '#666',
    marginBottom: '0.5rem',
  },
  progressPercent: {
    fontWeight: 600,
    color: '#1a1a1a',
  },
  progressBar: {
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

  // Steps List
  stepsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    marginBottom: '1rem',
  },
  stepItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.5rem',
    borderRadius: '8px',
    transition: 'background-color 0.2s',
  },
  stepItemCurrent: {
    backgroundColor: '#f0f9ff',
  },
  stepItemComplete: {
    opacity: 0.7,
  },
  stepItemClickable: {
    cursor: 'pointer',
  },
  stepIcon: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    border: '2px solid #ccc',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.7rem',
    fontWeight: 600,
    color: '#999',
    backgroundColor: '#fff',
    flexShrink: 0,
  },
  stepIconComplete: {
    backgroundColor: '#22c55e',
    borderColor: '#22c55e',
    color: '#fff',
  },
  stepIconCurrent: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
    color: '#fff',
  },
  stepContent: {
    flex: 1,
    minWidth: 0,
  },
  stepLabel: {
    fontSize: '0.85rem',
    fontWeight: 500,
    color: '#1a1a1a',
    lineHeight: 1.2,
  },
  stepLabelCurrent: {
    fontWeight: 600,
  },
  stepLabelPending: {
    color: '#999',
  },
  stepDescription: {
    fontSize: '0.7rem',
    color: '#666',
    marginTop: '0.1rem',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  stepArrow: {
    fontSize: '1rem',
    color: '#1a1a1a',
    fontWeight: 600,
  },

  // Current Step Card
  currentStepCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    padding: '0.75rem',
    marginBottom: '0.75rem',
  },
  currentStepHeader: {
    fontSize: '0.7rem',
    fontWeight: 600,
    color: '#666',
    marginBottom: '0.25rem',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  currentStepLabel: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#1a1a1a',
    marginBottom: '0.25rem',
  },
  currentStepDesc: {
    fontSize: '0.8rem',
    color: '#666',
    marginBottom: '0.5rem',
  },
  goButton: {
    width: '100%',
    padding: '0.5rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    backgroundColor: '#1a1a1a',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },

  // Reset Button
  resetButton: {
    width: '100%',
    padding: '0.5rem',
    fontSize: '0.8rem',
    fontWeight: 500,
    color: '#666',
    backgroundColor: 'transparent',
    border: '1px solid #e5e5e5',
    borderRadius: '6px',
    cursor: 'pointer',
  },
};
