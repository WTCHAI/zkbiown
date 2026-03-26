/**
 * API Request/Response Types
 * Type definitions for all API calls
 */

// ============================================================================
// ZTIZEN Service Types
// ============================================================================

export interface EnrollInitiatePayload {
  product_id: string
  service_id: string
  user_id: string
  pin_hash: string
}

export interface EnrollCompletePayload {
  userId: string
  credentialId: string
  productId: string
  userPin: string
  productPartialKey: string
  ztizenPartialKey: string
  nonce?: string     // BigInt string for Poseidon hash - REQUIRED for verification
  version?: number   // Template version number
  algorithmConfig: {
    selectedAlgorithm: string
    enrolledAt: string
    templateSizes: Record<string, number>
    params: Record<string, any>
  }
  authCommitGaussian?: string[]
  authCommitQuantization?: string[]
  authCommitHybrid?: string[]
}

export interface VerifyInitiatePayload {
  credential_id: string
  pin_hash: string
}

export interface VerifyPinOnlyPayload {
  credential_id: string
  pin_hash: string
}

export interface VerifyRollNoncePayload {
  credential_id: string
  nonce_current: string
  nonce_next: string
  auth_commit_gaussian_next: string[]
  auth_commit_quantization_next: string[]
}

export interface VerifyRollNonceDualPayload {
  credential_id: string
  nonce_current: string
  nonce_next: string
  auth_commit_gaussian_next: string[]
  auth_commit_quantization_next: string[]
}

export interface VerificationCompletePayload {
  request_id: string
  credential_id: string
  service_id: string
  user_id: string
  verified: boolean
  match_rate_gaussian?: number
  match_rate_quantization?: number
  hamming_distance_gaussian?: number
  hamming_distance_quantization?: number
  nonce_before: string
  nonce_after: string
  metadata?: Record<string, any>
}

export interface VerificationUpdateTxHashPayload {
  tx_id: string
  blockchain_tx_hash: string
}

// ============================================================================
// Product Service Types
// ============================================================================

export interface EnrollmentInitiatePayload {
  product_id: string
  service_id: string
  user_id: string
  pin_hash: string
}

export interface VerifyRequestPayload {
  product_id: string
  service_id: string
  service_name: string
  user_id: string
  credential_id: string
  return_url?: string
  callback_url?: string
  expires_in?: number
  details?: Record<string, any>
}

// ============================================================================
// Response Types
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean
  message?: string
  data?: T
  [key: string]: any
}

export interface Credential {
  credential_id: string
  product_id: string
  product_name: string
  service_id: string
  service_name: string
  service_type: string
  user_id: string
  status: string
  version: number
  auth_commit: string[]  // Poseidon commitment array (128 elements)
  auth_commit_gaussian?: string[]  // Legacy field for backward compatibility
  auth_commit_quantization?: string[]  // Legacy field for backward compatibility
  auth_commit_hybrid?: string[]
  nonce: string
  created_at: string
  updated_at: string
  ztizen_partial_key?: string  // ZTIZEN's portion of the composite key
  // Metadata containing algorithmConfig for verification
  metadata?: {
    algorithmConfig?: {
      selectedAlgorithm: string
      enrolledAt: string
      templateSizes: Record<string, number>
      params?: Record<string, any>
    }
  }
  // Legacy field - deprecated, use metadata.algorithmConfig instead
  algorithm_config?: {
    selectedAlgorithm: string
    enrolledAt: string
    templateSizes: {
      raw: number
      cancelable: number
    }
    params?: Record<string, any>
  }
}

export interface EnrollmentInfo {
  credential: {
    credential_id: string
    product_partial_key: string
    ztizen_partial_key: string
    status: string
    version?: number  // Template version number (defaults to 1 in DB)
  }
  success: boolean
}

export interface VerificationRequest {
  id: string
  product_id: string
  service_id: string
  user_id: string
  credential_id?: string
  status: string
  created_at: string
  metadata?: Record<string, any>
}

export interface Product {
  id: string
  product_id: string
  product_name: string
  is_active: boolean
  created_at: string
}

export interface ProductService {
  id: string
  product_id: string
  service_id: string
  service_name: string
  service_type: string
  is_active: boolean
}
