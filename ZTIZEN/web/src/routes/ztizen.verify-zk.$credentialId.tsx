/**
 * ZTIZEN Verification with ZK Proof Comparison
 * Route: /ztizen/verify-zk/:credentialId
 *
 * Dual Verification Flow:
 * 1. Traditional off-chain comparison (89.8% threshold)
 * 2. ZK proof generation and verification (85.2% threshold)
 *
 * Shows both results side-by-side for comparison
 */

import { createFileRoute } from '@tanstack/react-router';
import { ZTIZENVerifyWithComparisonZK } from '@/pages/ZTIZENVerifyWithComparisonZK';

export const Route = createFileRoute('/ztizen/verify-zk/$credentialId')({
  component: ZTIZENVerifyZK,
});

function ZTIZENVerifyZK() {
  const { credentialId } = Route.useParams();
  const searchParams = Route.useSearch() as { service_name?: string; return_url?: string };

  const serviceName = searchParams.service_name || '';
  const returnUrl = searchParams.return_url || '/ztizen/me';
  console.log("with zk ready ")
  return (
    <ZTIZENVerifyWithComparisonZK
      credentialId={credentialId}
      serviceName={serviceName}
      returnUrl={returnUrl}
    />
  );
}
