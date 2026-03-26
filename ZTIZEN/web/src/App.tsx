/**
 * ZTIZEN Main App with TanStack Router
 * Professional biometric authentication - File-based routing
 */

import { RouterProvider, createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

// Eager load face-api.js models at app startup (import triggers loading)
import '@/hooks/useFaceApi';

// Metrics panel for performance measurement
import { MetricsPanel } from '@/components/MetricsPanel';

// Create router instance with auto-generated route tree
const router = createRouter({ routeTree });

// Register router for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

function App() {
  return (
    <>
      <RouterProvider router={router} />
      <MetricsPanel />
    </>
  );
}

export default App;
