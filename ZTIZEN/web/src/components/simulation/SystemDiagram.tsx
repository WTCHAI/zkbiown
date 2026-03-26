/**
 * SystemDiagram Component
 *
 * Main SVG-based system architecture diagram showing:
 * 1. Architecture Layer: Browser, Product API, ZTIZEN API, Databases
 * 2. Data Flow: Animated paths showing data movement
 * 3. Real-time Animation: Highlights based on current step
 *
 * Architecture:
 * ┌─────────┐    ┌─────────┐    ┌─────────┐
 * │ Browser │───▶│ Product │───▶│ ZTIZEN  │
 * │(Frontend)│   │   API   │    │   API   │
 * └─────────┘    └────┬────┘    └────┬────┘
 *                     │              │
 *                ┌────▼────┐   ┌────▼────┐
 *                │Product  │   │ ZTIZEN  │
 *                │   DB    │   │   DB    │
 *                └─────────┘   └─────────┘
 */

import React from 'react';
import { ServiceNode, ServiceStatus } from './ServiceNode';
import { DataFlowPath, PathStatus } from './DataFlowPath';
import { DataPipeline } from './DataPipeline';
import { useSimulationStore, FlowStep, FlowType, PipelineStage } from '@/stores/useSimulationStore';

// Service positions in the SVG coordinate system
const SERVICES = {
  browser: { id: 'browser', name: 'Browser', icon: '🌐', x: 50, y: 45, color: '#3b82f6', subtitle: ':5501' },
  product: { id: 'product', name: 'Product API', icon: '🏪', x: 155, y: 45, color: '#f59e0b', subtitle: ':5503' },
  ztizen: { id: 'ztizen', name: 'ZTIZEN API', icon: '🛡️', x: 260, y: 45, color: '#8b5cf6', subtitle: ':5502' },
  productDb: { id: 'productDb', name: 'Product DB', icon: '🗄️', x: 155, y: 115, color: '#6b7280', subtitle: ':5505' },
  ztizenDb: { id: 'ztizenDb', name: 'ZTIZEN DB', icon: '🔐', x: 260, y: 115, color: '#6b7280', subtitle: ':5504' },
};

// Connection paths between services
const PATHS = {
  browserToProduct: { id: 'bp', from: { x: 90, y: 45 }, to: { x: 115, y: 45 } },
  productToZtizen: { id: 'pz', from: { x: 195, y: 45 }, to: { x: 220, y: 45 } },
  productToProductDb: { id: 'ppd', from: { x: 155, y: 75 }, to: { x: 155, y: 85 } },
  ztizenToZtizenDb: { id: 'zzd', from: { x: 260, y: 75 }, to: { x: 260, y: 85 } },
  browserToZtizen: { id: 'bz', from: { x: 90, y: 35 }, to: { x: 220, y: 35 }, curved: true },
};

// Step to diagram mapping - which services and paths are active for each step
type DiagramMapping = {
  services: string[];
  paths: string[];
  pipeline: PipelineStage;
  dataLabel?: string;
};

const STEP_DIAGRAM_MAP: Record<FlowStep, DiagramMapping> = {
  // Enrollment steps
  pin: { services: ['browser'], paths: [], pipeline: 'input' },
  pin_confirm: { services: ['browser'], paths: [], pipeline: 'input' },
  password: { services: ['browser'], paths: [], pipeline: 'input' },
  signature: { services: ['browser', 'product'], paths: ['browserToProduct'], pipeline: 'input', dataLabel: 'userKey' },
  credential_create: { services: ['product', 'ztizen', 'productDb', 'ztizenDb'], paths: ['productToZtizen', 'productToProductDb', 'ztizenToZtizenDb'], pipeline: 'keys', dataLabel: 'credential' },
  biometric: { services: ['browser'], paths: [], pipeline: 'raw' },
  template: { services: ['browser'], paths: [], pipeline: 'template' },
  commit: { services: ['browser'], paths: [], pipeline: 'commit' },
  store: { services: ['browser', 'ztizen', 'ztizenDb'], paths: ['browserToZtizen', 'ztizenToZtizenDb'], pipeline: 'store', dataLabel: 'template' },
  complete: { services: ['browser', 'product', 'ztizen'], paths: [], pipeline: 'complete' },

  // Verification steps
  compare: { services: ['browser', 'ztizen', 'ztizenDb'], paths: ['browserToZtizen', 'ztizenToZtizenDb'], pipeline: 'compare', dataLabel: 'template' },
  result: { services: ['ztizen', 'product', 'productDb'], paths: ['productToZtizen', 'productToProductDb'], pipeline: 'result', dataLabel: 'result' },
};

interface SystemDiagramProps {
  flowType?: FlowType;
}

export function SystemDiagram({ flowType: propFlowType }: SystemDiagramProps) {
  const { flowType: storeFlowType, currentStep, completedSteps } = useSimulationStore();
  const flowType = propFlowType || storeFlowType;

  // Get current mapping
  const currentMapping = currentStep ? STEP_DIAGRAM_MAP[currentStep] : null;

  // Calculate service status
  const getServiceStatus = (serviceId: string): ServiceStatus => {
    if (!currentMapping) return 'idle';

    // Check if service was used in completed steps
    const wasUsedInCompletedStep = completedSteps.some(step => {
      const mapping = STEP_DIAGRAM_MAP[step as FlowStep];
      return mapping?.services.includes(serviceId);
    });

    if (currentMapping.services.includes(serviceId)) {
      return 'active';
    }

    if (wasUsedInCompletedStep) {
      return 'complete';
    }

    return 'idle';
  };

  // Calculate path status
  const getPathStatus = (pathId: string): PathStatus => {
    if (!currentMapping) return 'idle';

    // Check if path was used in completed steps
    const wasUsedInCompletedStep = completedSteps.some(step => {
      const mapping = STEP_DIAGRAM_MAP[step as FlowStep];
      return mapping?.paths.includes(pathId);
    });

    if (currentMapping.paths.includes(pathId)) {
      return 'active';
    }

    if (wasUsedInCompletedStep) {
      return 'complete';
    }

    return 'idle';
  };

  // Get data label for active path
  const getPathLabel = (pathId: string): string | undefined => {
    if (!currentMapping || !currentMapping.paths.includes(pathId)) {
      return undefined;
    }
    return currentMapping.dataLabel;
  };

  if (flowType === 'idle') {
    return (
      <div style={styles.idleContainer}>
        <div style={styles.idleIcon}>🏗️</div>
        <div style={styles.idleTitle}>System Architecture</div>
        <div style={styles.idleSubtitle}>
          Start enrollment or verification to see the data flow through the system
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Flow Header */}
      <div style={styles.header}>
        <span style={styles.flowType}>
          {flowType === 'enrollment' ? '📝 ENROLLMENT' : '🔐 VERIFICATION'}
        </span>
        {currentStep && (
          <span style={styles.currentStep}>
            Step: {currentStep.replace('_', ' ')}
          </span>
        )}
      </div>

      {/* SVG Diagram */}
      <div style={styles.diagramContainer}>
        <svg
          viewBox="0 0 310 145"
          style={styles.svg}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Connection paths (render first, behind nodes) */}
          <g>
            {/* Browser → Product */}
            <DataFlowPath
              id="bp"
              from={PATHS.browserToProduct.from}
              to={PATHS.browserToProduct.to}
              status={getPathStatus('browserToProduct')}
              label={getPathLabel('browserToProduct')}
            />

            {/* Product → ZTIZEN */}
            <DataFlowPath
              id="pz"
              from={PATHS.productToZtizen.from}
              to={PATHS.productToZtizen.to}
              status={getPathStatus('productToZtizen')}
              label={getPathLabel('productToZtizen')}
            />

            {/* Product → Product DB */}
            <DataFlowPath
              id="ppd"
              from={PATHS.productToProductDb.from}
              to={PATHS.productToProductDb.to}
              status={getPathStatus('productToProductDb')}
            />

            {/* ZTIZEN → ZTIZEN DB */}
            <DataFlowPath
              id="zzd"
              from={PATHS.ztizenToZtizenDb.from}
              to={PATHS.ztizenToZtizenDb.to}
              status={getPathStatus('ztizenToZtizenDb')}
            />

            {/* Browser → ZTIZEN (direct path for biometric store) */}
            <DataFlowPath
              id="bz"
              from={PATHS.browserToZtizen.from}
              to={PATHS.browserToZtizen.to}
              status={getPathStatus('browserToZtizen')}
              label={getPathLabel('browserToZtizen')}
              curved
              direction="horizontal"
            />
          </g>

          {/* Service nodes */}
          <g>
            <ServiceNode
              {...SERVICES.browser}
              status={getServiceStatus('browser')}
            />
            <ServiceNode
              {...SERVICES.product}
              status={getServiceStatus('product')}
            />
            <ServiceNode
              {...SERVICES.ztizen}
              status={getServiceStatus('ztizen')}
            />
            <ServiceNode
              {...SERVICES.productDb}
              status={getServiceStatus('productDb')}
            />
            <ServiceNode
              {...SERVICES.ztizenDb}
              status={getServiceStatus('ztizenDb')}
            />
          </g>
        </svg>
      </div>

      {/* Legend */}
      <div style={styles.legend}>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendDot, backgroundColor: '#22c55e' }} />
          <span>Active</span>
        </div>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendDot, backgroundColor: '#86efac' }} />
          <span>Complete</span>
        </div>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendDot, backgroundColor: '#e5e5e5' }} />
          <span>Idle</span>
        </div>
      </div>

      {/* Data Pipeline */}
      <DataPipeline
        currentStage={currentMapping?.pipeline || 'idle'}
        flowType={flowType}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #e5e5e5',
  },
  flowType: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#1a1a1a',
    letterSpacing: '0.5px',
  },
  currentStep: {
    fontSize: '0.75rem',
    color: '#22c55e',
    fontWeight: 500,
    textTransform: 'capitalize',
  },
  diagramContainer: {
    padding: '1rem',
    backgroundColor: '#fff',
  },
  svg: {
    width: '100%',
    height: 'auto',
    maxHeight: '200px',
  },
  legend: {
    display: 'flex',
    gap: '1rem',
    padding: '0.5rem 1rem',
    justifyContent: 'center',
    borderTop: '1px solid #f0f0f0',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    fontSize: '0.7rem',
    color: '#666',
  },
  legendDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
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

export default SystemDiagram;
