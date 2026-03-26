/**
 * Product Service API Client
 * Centralized client for all Product service API calls
 */

import axios, { AxiosInstance, AxiosError } from 'axios'
import { ENV } from '@/lib/environment'
import type {
  EnrollmentInitiatePayload,
  VerifyRequestPayload,
  ApiResponse,
  Product,
  ProductService,
  VerificationRequest,
} from './types'

export class ProductClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: ENV.PRODUCT_API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 seconds
    })

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        console.error('Product API Error:', error.message)
        throw error
      }
    )
  }

  // ============================================================================
  // Products
  // ============================================================================

  /**
   * Get all products
   */
  async getProducts(): Promise<ApiResponse<{ products: Product[] }>> {
    const { data } = await this.client.get('/api/products')
    return data
  }

  /**
   * Get product by ID
   */
  async getProduct(productId: string): Promise<ApiResponse<{ product: Product }>> {
    const { data } = await this.client.get(`/api/products/${productId}`)
    return data
  }

  // ============================================================================
  // Keys
  // ============================================================================

  /**
   * Get partial keys for a product and service
   */
  async getPartialKeys(
    productId: string,
    serviceId: string
  ): Promise<ApiResponse<{ partial_key: string }>> {
    const { data } = await this.client.get(`/api/keys/partial/${productId}`, {
      params: { serviceId },
    })
    return data
  }

  /**
   * Get credential keys
   */
  async getCredentialKeys(credentialId: string): Promise<ApiResponse<{ partial_key: string }>> {
    const { data } = await this.client.get(`/api/keys/credential/${credentialId}`)
    return data
  }

  // ============================================================================
  // Enrollment
  // ============================================================================

  /**
   * Get enrollment list for a user
   */
  async getEnrollmentList(
    userId: string,
    productId: string,
    serviceName?: string
  ): Promise<ApiResponse<{ credentials: any[]; count: number }>> {
    const params: Record<string, string> = {
      user_id: userId,
      product_id: productId,
    }
    if (serviceName) {
      params.service_name = serviceName
    }

    const { data } = await this.client.get('/api/enrollment/list', { params })
    return data
  }

  /**
   * Initiate enrollment
   */
  async enrollmentInitiate(payload: EnrollmentInitiatePayload): Promise<ApiResponse<{ credential_id: string }>> {
    const { data } = await this.client.post('/api/enrollment/initiate', payload)
    return data
  }

  // ============================================================================
  // Verification
  // ============================================================================

  /**
   * Create verification request
   */
  async verifyRequest(payload: VerifyRequestPayload): Promise<ApiResponse<{ request_id: string }>> {
    const { data } = await this.client.post('/api/verify/request', payload)
    return data
  }

  /**
   * Get verification requests for a user
   */
  async getVerifyRequests(
    userId: string,
    status: string = 'pending',
    limit: number = 10
  ): Promise<ApiResponse<{ requests: VerificationRequest[] }>> {
    const { data } = await this.client.get('/api/verify/requests', {
      params: { user_id: userId, status, limit },
    })
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
export const productClient = new ProductClient()
