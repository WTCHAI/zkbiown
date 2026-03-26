/**
 * Centralized API Client Exports
 *
 * Usage:
 * ```typescript
 * import { ZTIZEN_CLIENT, PRODUCT_CLIENT } from '@/lib/api'
 *
 * // Fetch products
 * const products = await PRODUCT_CLIENT.getProducts()
 *
 * // Enroll user
 * const result = await ZTIZEN_CLIENT.enrollComplete(payload)
 * ```
 */

export { ztizenClient as ZTIZEN_CLIENT } from './ztizen-client'
export { productClient as PRODUCT_CLIENT } from './product-client'

// Export types for convenience
export type * from './types'
