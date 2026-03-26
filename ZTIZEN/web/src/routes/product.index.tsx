import { createFileRoute } from '@tanstack/react-router';
import { ProductSite } from '@/pages/ProductSite';

export const Route = createFileRoute('/product/')({
  component: ProductSite,
});
