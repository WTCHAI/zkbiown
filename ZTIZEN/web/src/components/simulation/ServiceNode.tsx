/**
 * ServiceNode Component
 *
 * Renders a service box in the system architecture diagram
 * with visual states for idle, active, and complete
 */

import React from 'react';

export type ServiceStatus = 'idle' | 'active' | 'complete';

export interface ServiceNodeProps {
  /** Service identifier */
  id: string;
  /** Display name */
  name: string;
  /** Emoji or icon */
  icon: string;
  /** Position in SVG */
  x: number;
  y: number;
  /** Width of the node */
  width?: number;
  /** Height of the node */
  height?: number;
  /** Current status */
  status: ServiceStatus;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Color theme */
  color?: string;
}

export function ServiceNode({
  name,
  icon,
  x,
  y,
  width = 80,
  height = 60,
  status,
  subtitle,
  color = '#6b7280',
}: ServiceNodeProps) {
  const getColors = () => {
    switch (status) {
      case 'active':
        return {
          fill: color,
          stroke: color,
          textFill: '#fff',
          opacity: 1,
        };
      case 'complete':
        return {
          fill: '#dcfce7',
          stroke: '#22c55e',
          textFill: '#166534',
          opacity: 1,
        };
      case 'idle':
      default:
        return {
          fill: '#f5f5f5',
          stroke: '#e5e5e5',
          textFill: '#9ca3af',
          opacity: 0.7,
        };
    }
  };

  const colors = getColors();

  return (
    <g
      transform={`translate(${x - width / 2}, ${y - height / 2})`}
      style={{ transition: 'opacity 0.3s ease' }}
      opacity={colors.opacity}
    >
      {/* Background rectangle */}
      <rect
        width={width}
        height={height}
        rx={8}
        ry={8}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={status === 'active' ? 2.5 : 1.5}
        style={{
          transition: 'all 0.3s ease',
          filter: status === 'active' ? 'drop-shadow(0 0 8px rgba(34, 197, 94, 0.4))' : 'none',
        }}
      />

      {/* Pulsing ring for active state */}
      {status === 'active' && (
        <rect
          width={width}
          height={height}
          rx={8}
          ry={8}
          fill="none"
          stroke={color}
          strokeWidth={2}
          opacity={0.5}
          style={{
            animation: 'pulse-ring 2s ease-out infinite',
          }}
        />
      )}

      {/* Icon */}
      <text
        x={width / 2}
        y={height / 2 - (subtitle ? 6 : 2)}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={subtitle ? 16 : 20}
        style={{ userSelect: 'none' }}
      >
        {icon}
      </text>

      {/* Name */}
      <text
        x={width / 2}
        y={height / 2 + (subtitle ? 10 : 16)}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={8}
        fontWeight={status === 'active' ? 600 : 500}
        fill={colors.textFill}
        style={{ userSelect: 'none' }}
      >
        {name}
      </text>

      {/* Subtitle (port info) */}
      {subtitle && (
        <text
          x={width / 2}
          y={height / 2 + 22}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={6}
          fill={colors.textFill}
          opacity={0.7}
          style={{ userSelect: 'none' }}
        >
          {subtitle}
        </text>
      )}

      {/* Checkmark overlay for complete status */}
      {status === 'complete' && (
        <g transform={`translate(${width - 8}, -4)`}>
          <circle cx={0} cy={0} r={8} fill="#22c55e" />
          <text
            x={0}
            y={1}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={9}
            fill="#fff"
            fontWeight="bold"
          >
            ✓
          </text>
        </g>
      )}
    </g>
  );
}

// CSS keyframes need to be injected
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes pulse-ring {
    0% {
      transform: scale(1);
      opacity: 0.5;
    }
    50% {
      transform: scale(1.05);
      opacity: 0.2;
    }
    100% {
      transform: scale(1);
      opacity: 0.5;
    }
  }
`;
if (!document.querySelector('style[data-service-node]')) {
  styleSheet.setAttribute('data-service-node', '');
  document.head.appendChild(styleSheet);
}

export default ServiceNode;
