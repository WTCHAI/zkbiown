import { createFileRoute } from '@tanstack/react-router';
import { ZTIZENVerify } from '@/pages/ZTIZENVerify';

export const Route = createFileRoute('/ztizen/verify')({
  component: ZTIZENVerify,
});
