/**
 * useDebugData Hook
 *
 * Aggregates data from all 3 entities for the debug drawer:
 * 1. Product Service DB - via API calls
 * 2. ZTIZEN Service DB - via API calls
 * 3. Frontend/User - via Zustand stores (live subscription)
 *
 * Features:
 * - Manual refresh via refetch()
 * - Loading states for API calls
 * - Error handling
 */

import { useState, useCallback, useEffect } from 'react';
import { ztizenClient } from '@/lib/api/ztizen-client';
import { productClient } from '@/lib/api/product-client';
import { useEnrollmentStore } from '@/stores/useEnrollmentStore';
import { useVerificationStore } from '@/stores/useVerificationStore';

// Types for DB data
export interface ProductServiceData {
  credential_id: string | null;
  product_id: string | null;
  product_name: string | null;
  product_partial_key: string | null;
  service_name: string | null;
  service_type: string | null;
  user_id: string | null;
  status: string | null;
}

export interface ZtizenServiceData {
  credential_id: string | null;
  ztizen_partial_key: string | null;
  status: string | null;
  version: number | null;
  nonce: string | null;
  auth_commit_count: number | null;
  pin_hash: string | null;
  template_type: string | null;
  enrolled_at: string | null;
  verification_count: number | null;
}

export interface FrontendData {
  // Enrollment store
  enrollment: {
    credentialId: string | null;
    productId: string | null;
    serviceName: string | null;
    serviceType: string | null;
    userId: string | null;
    currentStep: string;
    pin: boolean; // Just indicates if set, not actual value
    password: boolean;
    signature: boolean;
    address: string | null;
    userKey: boolean;
    rawBiometric: boolean;
    selectedAlgorithm: string;
  };
  // Verification store
  verification: {
    currentStage: string;
    password: boolean;
    pin: boolean;
    signature: boolean;
    address: string | null;
    userKey: boolean;
    rawBiometric: boolean;
    verified: boolean;
    credentialId: string;
    matchRate: number;
    nextNonce: boolean;
    nextAuthCommit: boolean;
  };
}

export interface DebugData {
  product: ProductServiceData | null;
  ztizen: ZtizenServiceData | null;
  frontend: FrontendData;
  isLoading: boolean;
  error: string | null;
  lastFetched: Date | null;
}

export function useDebugData(credentialId: string | null) {
  // State for API data
  const [productData, setProductData] = useState<ProductServiceData | null>(null);
  const [ztizenData, setZtizenData] = useState<ZtizenServiceData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  // Zustand stores (live subscription)
  const enrollmentStore = useEnrollmentStore();
  const verificationStore = useVerificationStore();

  // Fetch data from both services
  const refetch = useCallback(async () => {
    if (!credentialId) {
      setError('No credential ID');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch from both services in parallel
      const [productResult, ztizenResult] = await Promise.allSettled([
        // Product Service - get credential keys
        productClient.getCredentialKeys(credentialId),
        // ZTIZEN Service - get credential details
        ztizenClient.getCredential(credentialId),
      ]);

      // Process Product Service result
      if (productResult.status === 'fulfilled') {
        const data = productResult.value;
        setProductData({
          credential_id: credentialId,
          product_id: (data as any).product_id || null,
          product_name: (data as any).product_name || null,
          product_partial_key: (data as any).partial_key || null,
          service_name: (data as any).service_name || null,
          service_type: (data as any).service_type || null,
          user_id: (data as any).user_id || null,
          status: (data as any).status || null,
        });
      } else {
        console.warn('Product Service fetch failed:', productResult.reason);
        // Set partial data with credential_id
        setProductData({
          credential_id: credentialId,
          product_id: null,
          product_name: null,
          product_partial_key: null,
          service_name: null,
          service_type: null,
          user_id: null,
          status: null,
        });
      }

      // Process ZTIZEN Service result
      if (ztizenResult.status === 'fulfilled') {
        const data = ztizenResult.value;
        const cred = (data as any).credential || data;
        setZtizenData({
          credential_id: cred.credential_id || credentialId,
          ztizen_partial_key: cred.ztizen_partial_key || null,
          status: cred.status || null,
          version: cred.version || null,
          nonce: cred.nonce || null,
          auth_commit_count: cred.auth_commit ?
            (Array.isArray(cred.auth_commit) ? cred.auth_commit.length :
              (cred.auth_commit.gaussian?.length || 0)) : null,
          pin_hash: cred.pin_hash ? '***' : null,
          template_type: cred.template_type || null,
          enrolled_at: cred.enrolled_at || null,
          verification_count: cred.verification_count || null,
        });
      } else {
        console.warn('ZTIZEN Service fetch failed:', ztizenResult.reason);
        setZtizenData({
          credential_id: credentialId,
          ztizen_partial_key: null,
          status: null,
          version: null,
          nonce: null,
          auth_commit_count: null,
          pin_hash: null,
          template_type: null,
          enrolled_at: null,
          verification_count: null,
        });
      }

      setLastFetched(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  }, [credentialId]);

  // Auto-fetch when credentialId changes
  useEffect(() => {
    if (credentialId) {
      refetch();
    }
  }, [credentialId, refetch]);

  // Build frontend data from stores
  const frontendData: FrontendData = {
    enrollment: {
      credentialId: enrollmentStore.credentialId,
      productId: enrollmentStore.productId,
      serviceName: enrollmentStore.serviceName,
      serviceType: enrollmentStore.serviceType,
      userId: enrollmentStore.userId,
      currentStep: enrollmentStore.currentStep,
      pin: !!enrollmentStore.pin,
      password: !!enrollmentStore.password,
      signature: !!enrollmentStore.signature,
      address: enrollmentStore.address,
      userKey: !!enrollmentStore.userKey,
      rawBiometric: !!enrollmentStore.rawBiometric,
      selectedAlgorithm: enrollmentStore.selectedAlgorithm,
    },
    verification: {
      currentStage: verificationStore.currentStage,
      password: !!verificationStore.password,
      pin: !!verificationStore.pin,
      signature: !!verificationStore.signature,
      address: verificationStore.address,
      userKey: !!verificationStore.userKey,
      rawBiometric: !!verificationStore.rawBiometric,
      verified: verificationStore.verified,
      credentialId: verificationStore.credentialId,
      matchRate: verificationStore.matchRate,
      nextNonce: !!verificationStore.nextNonce,
      nextAuthCommit: !!verificationStore.nextAuthCommit,
    },
  };

  return {
    product: productData,
    ztizen: ztizenData,
    frontend: frontendData,
    isLoading,
    error,
    lastFetched,
    refetch,
  };
}
