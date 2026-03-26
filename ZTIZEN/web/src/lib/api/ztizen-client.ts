/**
 * ZTIZEN Service API Client
 * Centralized client for all ZTIZEN backend API calls
 */

import axios, { AxiosInstance, AxiosError } from 'axios'
import { ENV } from '@/lib/environment'
import type {
  EnrollInitiatePayload,
  EnrollCompletePayload,
  VerifyInitiatePayload,
  VerifyPinOnlyPayload,
  VerifyRollNoncePayload,
  VerifyRollNonceDualPayload,
  VerificationCompletePayload,
  VerificationUpdateTxHashPayload,
  ApiResponse,
  Credential,
  EnrollmentInfo,
  VerificationRequest,
} from './types'

export class ZtizenClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: ENV.ZTIZEN_SERVICE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 seconds
    })

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        console.error('ZTIZEN API Error:', error.message)
        throw error
      }
    )
  }

  // ============================================================================
  // Credential Management
  // ============================================================================

  /**
   * Get credential by ID
   */
  async getCredential(credentialId: string): Promise<ApiResponse<{ credential: Credential }>> {
    const { data } = await this.client.get(`/api/credentials/${credentialId}`)
    return data
  }

  /**
   * Get all credentials for a user
   */
  async getUserCredentials(userId: string): Promise<ApiResponse<{ credentials: Credential[] }>> {
    const { data } = await this.client.get(`/api/credentials/user/${userId}`)
    return data
  }

  /**
   * Get verification history for a credential
   */
  async getVerificationHistory(credentialId: string, limit = 10): Promise<ApiResponse<{ verifications: any[] }>> {
    const { data } = await this.client.get(`/api/verification/history/${credentialId}`, {
      params: { limit },
    })
    return data
  }

  /**
   * Get enrollment info by credential ID
   */
  async getEnrollment(credentialId: string): Promise<EnrollmentInfo> {
    const { data } = await this.client.get(`/api/enrollment/${credentialId}`)
    return data
  }

  // ============================================================================
  // Enrollment
  // ============================================================================

  /**
   * Initiate enrollment process
   */
  async enrollInitiate(payload: EnrollInitiatePayload): Promise<ApiResponse> {
    const { data } = await this.client.post('/api/enroll/initiate', payload)
    return data
  }

  /**
   * Complete enrollment with biometric template
   */
  async enrollComplete(payload: EnrollCompletePayload): Promise<ApiResponse> {
    const { data } = await this.client.post('/api/enrollment/complete', payload)
    return data
  }

  // ============================================================================
  // Verification
  // ============================================================================

  /**
   * Initiate verification process
   */
  async verifyInitiate(payload: VerifyInitiatePayload): Promise<ApiResponse> {
    const { data } = await this.client.post('/api/verify/initiate', payload)
    return data
  }

  /**
   * Verify with PIN only (no biometric)
   */
  async verifyPinOnly(payload: VerifyPinOnlyPayload): Promise<ApiResponse> {
    const { data } = await this.client.post('/api/verify/pin-only', payload)
    return data
  }

  /**
   * Roll nonce after successful verification
   */
  async verifyRollNonce(payload: VerifyRollNoncePayload): Promise<ApiResponse> {
    const { data } = await this.client.post('/api/verify/roll-nonce', payload)
    return data
  }

  /**
   * Roll nonce with dual templates (gaussian + quantization)
   */
  async verifyRollNonceDual(payload: VerifyRollNonceDualPayload): Promise<ApiResponse> {
    const { data } = await this.client.post('/api/verify/roll-nonce-dual', payload)
    return data
  }

  /**
   * Get verification request by ID
   */
  async getVerificationRequest(requestId: string): Promise<ApiResponse<{ request: VerificationRequest }>> {
    const { data } = await this.client.get(`/api/verification/request/${requestId}`)
    return data
  }

  /**
   * Complete verification transaction
   */
  async verificationComplete(payload: VerificationCompletePayload): Promise<ApiResponse<{ tx_id: string }>> {
    const { data } = await this.client.post('/api/verification/complete', payload)
    return data
  }

  /**
   * Update verification transaction with blockchain tx hash
   */
  async verificationUpdateTxHash(payload: VerificationUpdateTxHashPayload): Promise<ApiResponse> {
    const { data } = await this.client.post('/api/verification/update-tx-hash', payload)
    return data
  }

  // ============================================================================
  // Credential Lifecycle
  // ============================================================================

  /**
   * Upgrade credential version (revoke & require re-enrollment)
   *
   * This is the Cancelable Biometric revocation mechanism:
   *   1. Increment version number
   *   2. Reset nonce to 0
   *   3. Clear auth_commit (requires re-enrollment)
   *   4. Set status to 'pending'
   *
   * Use cases:
   *   - Lost/stolen device
   *   - Compromised credentials
   *   - Periodic security rotation
   *
   * @param credentialId - The credential to upgrade
   * @param reason - Optional reason for audit trail
   */
  async upgradeVersion(
    credentialId: string,
    reason?: 'lost_device' | 'compromised' | 'rotation' | 'manual_revocation' | string
  ): Promise<ApiResponse<{
    credential: {
      credential_id: string
      version: number
      status: string
      nonce: string
    }
    previous_version: number
    revocation_reason: string
  }>> {
    const { data } = await this.client.patch(
      `/api/credentials/${credentialId}/upgrade-version`,
      { reason }
    )
    return data
  }

  /**
   * Deactivate a credential (soft revoke)
   */
  async deactivateCredential(credentialId: string): Promise<ApiResponse> {
    const { data } = await this.client.patch(`/api/credentials/${credentialId}/deactivate`)
    return data
  }

  /**
   * Reactivate a deactivated credential
   */
  async reactivateCredential(credentialId: string): Promise<ApiResponse> {
    const { data } = await this.client.patch(`/api/credentials/${credentialId}/reactivate`)
    return data
  }

  // ============================================================================
  // Health Check
  // ============================================================================

  /**
   * Health check
   */
  async health(): Promise<{ status: string }> {
    const { data } = await this.client.get('/health')
    return data
  }
}

// Export singleton instance
export const ztizenClient = new ZtizenClient()
