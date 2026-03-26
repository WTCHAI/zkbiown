import { createRootRoute, Outlet, useLocation } from '@tanstack/react-router';
import PrivyProvider from '@/providers/PrivyProvider';
import { SimulationPanel } from '@/components/simulation';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <PrivyProvider>
      <Outlet />
      <SimulationPanel />
    </PrivyProvider>
  );
}
