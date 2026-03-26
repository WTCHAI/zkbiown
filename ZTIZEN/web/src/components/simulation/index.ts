/**
 * Simulation Panel Components
 *
 * Step-by-step flow visualization for the 3-party
 * trustless biometric authentication system
 *
 * Components:
 * - SimulationPanel: Main drawer with FAB button
 * - FlowDiagram: Combined view (Architecture + Steps)
 * - SystemDiagram: SVG-based architecture visualization
 * - ServiceNode: Individual service box in diagram
 * - DataFlowPath: Animated connection lines
 * - DataPipeline: Data transformation visualization
 * - StepNode: Individual step in linear list
 * - DemoNavigation: Demo guidance tab
 */

export { SimulationPanel } from './SimulationPanel';
export { FlowDiagram } from './FlowDiagram';
export { SystemDiagram } from './SystemDiagram';
export { ServiceNode } from './ServiceNode';
export { DataFlowPath } from './DataFlowPath';
export { DataPipeline } from './DataPipeline';
export { StepNode } from './StepNode';
export { DemoNavigation } from './DemoNavigation';

// Re-export types
export type { ServiceStatus, ServiceNodeProps } from './ServiceNode';
export type { PathStatus, DataFlowPathProps } from './DataFlowPath';
export type { DataPipelineProps } from './DataPipeline';
export type { StepStatus } from './StepNode';
// PipelineStage is exported from useSimulationStore
