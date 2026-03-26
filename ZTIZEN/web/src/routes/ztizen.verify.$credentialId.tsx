/**
 * ZTIZEN Verification Page - With Credential ID
 * Route: /ztizen/verify/:credentialId
 *
 * This route simply uses the shared ZTIZENVerify component from pages.
 * The component handles credentialId via useParams.
 */

import { createFileRoute } from '@tanstack/react-router';
import { ZTIZENVerify } from '@/pages/ZTIZENVerify';

export const Route = createFileRoute('/ztizen/verify/$credentialId')({
  component: ZTIZENVerify,
});
