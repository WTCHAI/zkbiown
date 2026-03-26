/**
 * DataPipeline Component
 *
 * Visualizes the biometric data transformation pipeline
 * Shows: Raw Image → 478 Landmarks → BioHash → Poseidon Commit → ZK Proof
 */

import React from 'react';
import { FlowType, PipelineStage } from '@/stores/useSimulationStore';

// Re-export PipelineStage for convenience
export type { PipelineStage } from '@/stores/useSimulationStore';

export interface DataPipelineProps {
  /** Current stage in the pipeline */
  currentStage: PipelineStage;
  /** Flow type determines which stages are shown */
  flowType: FlowType;
}

interface StageInfo {
  id: PipelineStage;
  icon: string;
  label: string;
  description: string;
}

const ENROLLMENT_STAGES: StageInfo[] = [
  { id: 'raw', icon: '📷', label: 'Raw', description: 'WebCam capture' },
  { id: 'landmarks', icon: '🎯', label: '478 Pts', description: 'MediaPipe' },
  { id: 'template', icon: '🔐', label: 'BioHash', description: 'Chellappa' },
  { id: 'commit', icon: '#️⃣', label: 'Commit', description: 'Poseidon' },
  { id: 'store', icon: '💾', label: 'Store', description: 'Database' },
];

const VERIFICATION_STAGES: StageInfo[] = [
  { id: 'raw', icon: '📷', label: 'Raw', description: 'WebCam capture' },
  { id: 'landmarks', icon: '🎯', label: '478 Pts', description: 'MediaPipe' },
  { id: 'template', icon: '🔐', label: 'BioHash', description: 'Chellappa' },
  { id: 'compare', icon: '⚖️', label: 'Compare', description: '204/256 match' },
  { id: 'proof', icon: '🛡️', label: 'ZK Proof', description: 'Noir circuit' },
];

export function DataPipeline({ currentStage, flowType }: DataPipelineProps) {
  if (flowType === 'idle') {
    return null;
  }

  const stages = flowType === 'enrollment' ? ENROLLMENT_STAGES : VERIFICATION_STAGES;

  const getStageStatus = (stageId: PipelineStage): 'idle' | 'active' | 'complete' => {
    const stageOrder = stages.map(s => s.id);
    const currentIndex = stageOrder.indexOf(currentStage);
    const stageIndex = stageOrder.indexOf(stageId);

    if (stageIndex === -1 || currentIndex === -1) {
      // For stages not in the biometric pipeline (input, keys, etc)
      if (currentStage === 'complete') return 'complete';
      return 'idle';
    }

    if (stageIndex < currentIndex) return 'complete';
    if (stageIndex === currentIndex) return 'active';
    return 'idle';
  };

  // Check if we're in the biometric processing phase
  const isBiometricPhase = ['raw', 'landmarks', 'template', 'commit', 'store', 'compare', 'proof', 'complete'].includes(currentStage);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Data Transformation</span>
        {!isBiometricPhase && (
          <span style={styles.subtitle}>Waiting for biometric capture...</span>
        )}
      </div>

      <div style={styles.pipeline}>
        {stages.map((stage, index) => {
          const status = getStageStatus(stage.id);
          const isLast = index === stages.length - 1;

          return (
            <React.Fragment key={stage.id}>
              {/* Stage Node */}
              <div
                style={{
                  ...styles.stage,
                  ...(status === 'active' ? styles.stageActive : {}),
                  ...(status === 'complete' ? styles.stageComplete : {}),
                  ...(status === 'idle' ? styles.stageIdle : {}),
                }}
              >
                <div
                  style={{
                    ...styles.stageIcon,
                    ...(status === 'active' ? styles.stageIconActive : {}),
                  }}
                >
                  {stage.icon}
                </div>
                <div style={styles.stageLabel}>
                  {stage.label}
                </div>
                {status === 'active' && (
                  <div style={styles.stageDescription}>
                    {stage.description}
                  </div>
                )}
              </div>

              {/* Arrow connector */}
              {!isLast && (
                <div
                  style={{
                    ...styles.arrow,
                    ...(status === 'complete' ? styles.arrowComplete : {}),
                    ...(status === 'active' ? styles.arrowActive : {}),
                  }}
                >
                  →
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Pipeline description */}
      {isBiometricPhase && (
        <div style={styles.description}>
          {flowType === 'enrollment'
            ? 'Generating cancelable biometric template with Poseidon commitment'
            : 'Verifying biometric match and generating ZK proof'
          }
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '0.75rem',
    backgroundColor: '#fafafa',
    borderTop: '1px solid #e5e5e5',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    marginBottom: '0.75rem',
  },
  title: {
    fontSize: '0.7rem',
    fontWeight: 600,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  subtitle: {
    fontSize: '0.7rem',
    color: '#999',
    fontStyle: 'italic',
  },
  pipeline: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.25rem',
    flexWrap: 'wrap',
  },
  stage: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    padding: '0.35rem',
    borderRadius: '6px',
    transition: 'all 0.3s ease',
    minWidth: '44px',
  },
  stageIdle: {
    opacity: 0.4,
  },
  stageActive: {
    backgroundColor: '#dcfce7',
    boxShadow: '0 0 0 2px rgba(34, 197, 94, 0.3)',
  },
  stageComplete: {
    opacity: 1,
  },
  stageIcon: {
    fontSize: '1.1rem',
    transition: 'transform 0.3s ease',
  },
  stageIconActive: {
    transform: 'scale(1.2)',
  },
  stageLabel: {
    fontSize: '0.6rem',
    fontWeight: 500,
    color: '#666',
    textAlign: 'center',
  },
  stageDescription: {
    fontSize: '0.55rem',
    color: '#22c55e',
    fontWeight: 500,
  },
  arrow: {
    color: '#d1d5db',
    fontSize: '0.75rem',
    fontWeight: 'bold',
    transition: 'color 0.3s ease',
  },
  arrowComplete: {
    color: '#86efac',
  },
  arrowActive: {
    color: '#22c55e',
  },
  description: {
    marginTop: '0.5rem',
    fontSize: '0.65rem',
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
};

export default DataPipeline;
