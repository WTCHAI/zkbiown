/**
 * API Configuration
 * Centralized API URLs for ZTIZEN and Product services
 */

export const API_CONFIG = {
  // Defaults match .env.example configuration
  ZTIZEN_API_URL: import.meta.env.VITE_ZTIZEN_SERVICE_URL || 'http://localhost:5502',
  PRODUCT_API_URL: import.meta.env.VITE_PRODUCT_API_URL || 'http://localhost:5503',
} as const;

export const API_ENDPOINTS = {
  // ZTIZEN Service endpoints
  ztizen: {
    credentials: (credentialId: string) => `${API_CONFIG.ZTIZEN_API_URL}/api/credentials/${credentialId}`,
    enrollment: (credentialId: string) => `${API_CONFIG.ZTIZEN_API_URL}/api/enrollment/${credentialId}`,
    enrollmentComplete: () => `${API_CONFIG.ZTIZEN_API_URL}/api/enrollment/complete`,
    enrollmentInitiate: () => `${API_CONFIG.ZTIZEN_API_URL}/api/enroll/initiate`,
    verifyInitiate: () => `${API_CONFIG.ZTIZEN_API_URL}/api/verify/initiate`,
    verifyPinOnly: () => `${API_CONFIG.ZTIZEN_API_URL}/api/verify/pin-only`,
    verifyRollNonce: () => `${API_CONFIG.ZTIZEN_API_URL}/api/verify/roll-nonce`,
    verifyRollNonceDual: () => `${API_CONFIG.ZTIZEN_API_URL}/api/verify/roll-nonce-dual`,
    verificationRequest: (requestId: string) => `${API_CONFIG.ZTIZEN_API_URL}/api/verification/request/${requestId}`,
    verificationComplete: () => `${API_CONFIG.ZTIZEN_API_URL}/api/verification/complete`,
    verificationUpdateTxHash: () => `${API_CONFIG.ZTIZEN_API_URL}/api/verification/update-tx-hash`,
  },

  // Product Service endpoints
  product: {
    products: () => `${API_CONFIG.PRODUCT_API_URL}/api/products`,
    keysPartial: (productId: string, serviceId: string) =>
      `${API_CONFIG.PRODUCT_API_URL}/api/keys/partial/${productId}?serviceId=${serviceId}`,
    keysCredential: (credentialId: string) => `${API_CONFIG.PRODUCT_API_URL}/api/keys/credential/${credentialId}`,
    enrollmentStatus: (credentialId: string) => `${API_CONFIG.PRODUCT_API_URL}/api/enrollment/status/${credentialId}`,
    enrollmentSync: (credentialId: string) => `${API_CONFIG.PRODUCT_API_URL}/api/enrollment/sync/${credentialId}`,
    enrollmentList: (userId: string, productId: string, serviceName?: string) =>
      `${API_CONFIG.PRODUCT_API_URL}/api/enrollment/list?user_id=${userId}&product_id=${productId}${serviceName ? `&service_name=${serviceName}` : ''}`,
    enrollmentInitiate: () => `${API_CONFIG.PRODUCT_API_URL}/api/enrollment/initiate`,
    verifyRequest: () => `${API_CONFIG.PRODUCT_API_URL}/api/verify/request`,
    verifyRequests: (userId: string, status: string, limit: number) =>
      `${API_CONFIG.PRODUCT_API_URL}/api/verify/requests?user_id=${userId}&status=${status}&limit=${limit}`,
  },

  // LINE OAuth endpoints
  line: {
    login: (returnUrl?: string) =>
      `${API_CONFIG.PRODUCT_API_URL}/api/line/login${returnUrl ? `?return_url=${encodeURIComponent(returnUrl)}` : ''}`,
    setEmail: () => `${API_CONFIG.PRODUCT_API_URL}/api/line/set-email`,
    me: (userId: string, sessionToken: string) =>
      `${API_CONFIG.PRODUCT_API_URL}/api/line/me?user_id=${userId}&session_token=${sessionToken}`,
    checkCredential: () => `${API_CONFIG.PRODUCT_API_URL}/api/line/check-credential`,
  },
} as const;
