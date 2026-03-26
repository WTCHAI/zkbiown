/**
 * StepNode Component
 *
 * Individual step in the flow diagram with status indicator
 * Status: complete (checkmark), active (filled dot), pending (empty circle)
 */

import React from 'react';

export type StepStatus = 'complete' | 'active' | 'pending';

interface StepNodeProps {
  label: string;
  description?: string;
  status: StepStatus;
  isLast?: boolean;
}

export function StepNode({ label, description, status, isLast = false }: StepNodeProps) {
  const getStatusIcon = () => {
    switch (status) {
      case 'complete':
        return (
          <div style={styles.iconComplete}>
            <span style={styles.checkmark}>✓</span>
          </div>
        );
      case 'active':
        return (
          <div style={styles.iconActive}>
            <div style={styles.activeDot} />
          </div>
        );
      case 'pending':
      default:
        return <div style={styles.iconPending} />;
    }
  };

  const getTextStyle = (): React.CSSProperties => {
    switch (status) {
      case 'complete':
        return { color: '#22c55e', fontWeight: 500 };
      case 'active':
        return { color: '#1a1a1a', fontWeight: 600 };
      case 'pending':
      default:
        return { color: '#999', fontWeight: 400 };
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.stepRow}>
        {getStatusIcon()}
        <div style={styles.labelContainer}>
          <span style={{ ...styles.label, ...getTextStyle() }}>{label}</span>
          {description && status === 'active' && (
            <span style={styles.description}>{description}</span>
          )}
        </div>
      </div>
      {!isLast && <div style={styles.connector} />}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  stepRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  iconComplete: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: '#22c55e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkmark: {
    color: '#fff',
    fontSize: '14px',
    fontWeight: 'bold',
  },
  iconActive: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: '#1a1a1a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: '0 0 0 4px rgba(26, 26, 26, 0.15)',
  },
  activeDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#fff',
  },
  iconPending: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    border: '2px solid #ddd',
    backgroundColor: '#fff',
    flexShrink: 0,
  },
  labelContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  label: {
    fontSize: '0.9rem',
    lineHeight: 1.2,
  },
  description: {
    fontSize: '0.75rem',
    color: '#666',
    lineHeight: 1.3,
  },
  connector: {
    width: '2px',
    height: '16px',
    backgroundColor: '#e5e5e5',
    marginLeft: '11px',
  },
};

export default StepNode;
