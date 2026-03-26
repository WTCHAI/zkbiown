import { createFileRoute } from '@tanstack/react-router';
import { ProductServicePage } from '../pages/ProductServicePage';

export const Route = createFileRoute('/product/service/$serviceName')({
  component: () => {
    const { serviceName } = Route.useParams();

    // Capitalize first letter for display
    const formattedServiceName = serviceName.charAt(0).toUpperCase() + serviceName.slice(1);

    return (
      <ProductServicePage
        productId="demo-bank"
        serviceName={formattedServiceName}
      />
    );
  },
});
