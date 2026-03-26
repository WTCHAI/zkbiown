/**
 * DataFlowPath Component
 *
 * Renders animated connection lines between services in the system diagram
 * Shows data flow direction with arrow markers and optional labels
 */

import React from 'react';

export type PathStatus = 'idle' | 'active' | 'complete';

export interface DataFlowPathProps {
  /** Unique identifier */
  id: string;
  /** Starting coordinates */
  from: { x: number; y: number };
  /** Ending coordinates */
  to: { x: number; y: number };
  /** Current status */
  status: PathStatus;
  /** Optional data label */
  label?: string;
  /** Use curved path instead of straight */
  curved?: boolean;
  /** Direction: horizontal or vertical flow */
  direction?: 'horizontal' | 'vertical';
}

export function DataFlowPath({
  id,
  from,
  to,
  status,
  label,
  curved = false,
  direction = 'horizontal',
}: DataFlowPathProps) {
  const getColors = () => {
    switch (status) {
      case 'active':
        return {
          stroke: '#22c55e',
          opacity: 1,
          strokeWidth: 2,
        };
      case 'complete':
        return {
          stroke: '#86efac',
          opacity: 0.8,
          strokeWidth: 1.5,
        };
      case 'idle':
      default:
        return {
          stroke: '#d1d5db',
          opacity: 0.5,
          strokeWidth: 1,
        };
    }
  };

  const colors = getColors();

  // Calculate path
  const getPath = () => {
    if (!curved) {
      return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    }

    // Curved path using quadratic bezier
    if (direction === 'horizontal') {
      const midX = (from.x + to.x) / 2;
      return `M ${from.x} ${from.y} Q ${midX} ${from.y}, ${midX} ${(from.y + to.y) / 2} Q ${midX} ${to.y}, ${to.x} ${to.y}`;
    } else {
      const midY = (from.y + to.y) / 2;
      return `M ${from.x} ${from.y} Q ${from.x} ${midY}, ${(from.x + to.x) / 2} ${midY} Q ${to.x} ${midY}, ${to.x} ${to.y}`;
    }
  };

  // Calculate label position
  const labelX = (from.x + to.x) / 2;
  const labelY = (from.y + to.y) / 2 - 8;

  // Calculate arrow angle
  const angle = Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI);

  return (
    <g>
      {/* Arrow marker definition */}
      <defs>
        <marker
          id={`arrow-${id}-${status}`}
          markerWidth={8}
          markerHeight={8}
          refX={6}
          refY={4}
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path
            d="M 0 0 L 8 4 L 0 8 Z"
            fill={colors.stroke}
            opacity={colors.opacity}
          />
        </marker>
      </defs>

      {/* Background path for better visibility */}
      {status === 'active' && (
        <path
          d={getPath()}
          fill="none"
          stroke={colors.stroke}
          strokeWidth={6}
          opacity={0.15}
          strokeLinecap="round"
        />
      )}

      {/* Main path */}
      <path
        d={getPath()}
        fill="none"
        stroke={colors.stroke}
        strokeWidth={colors.strokeWidth}
        opacity={colors.opacity}
        strokeLinecap="round"
        strokeDasharray={status === 'active' ? '6 4' : 'none'}
        markerEnd={`url(#arrow-${id}-${status})`}
        style={{
          transition: 'stroke 0.3s ease, opacity 0.3s ease',
          animation: status === 'active' ? 'flow-dash 0.8s linear infinite' : 'none',
        }}
      />

      {/* Label */}
      {label && status === 'active' && (
        <g transform={`translate(${labelX}, ${labelY})`}>
          <rect
            x={-label.length * 3 - 4}
            y={-8}
            width={label.length * 6 + 8}
            height={14}
            rx={3}
            fill="#22c55e"
            opacity={0.9}
          />
          <text
            x={0}
            y={0}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={8}
            fill="#fff"
            fontWeight={500}
            style={{ userSelect: 'none' }}
          >
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

// Inject CSS keyframes for flow animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes flow-dash {
    to {
      stroke-dashoffset: -20;
    }
  }
`;
if (!document.querySelector('style[data-flow-path]')) {
  styleSheet.setAttribute('data-flow-path', '');
  document.head.appendChild(styleSheet);
}

export default DataFlowPath;
