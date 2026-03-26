/**
 * Environment Configuration
 *
 * Loads and validates environment variables using Zod.
 * All environment variables are read from `import.meta.env` (Vite) and
 * exposed as a typed `ENV` object.
 */

import { z } from "zod"

/**
 * Minimal Environment Schema
 *
 * Based on your `.env` example, only the Privy App ID is required for the
 * demo. Keep the schema intentionally small to avoid startup failures when
 * other env vars are not present.
 */
const envSchema = z.object({
  // Privy Authentication (required)
  PRIVY_APP_ID: z.string().min(1, "VITE_PRIVY_APP_ID is required"),

  // Backend services required by the app
  ZTIZEN_SERVICE_URL: z.string().url().min(1, "VITE_ZTIZEN_SERVICE_URL is required"),
  PRODUCT_API_URL: z.string().url().min(1, "VITE_PRODUCT_API_URL is required"),
})

/**
 * Parse and validate environment variables
 */
const parseEnv = () => {
  const metaEnv = (import.meta as any).env

  const rawEnv = {
    PRIVY_APP_ID: metaEnv.VITE_PRIVY_APP_ID,
    ZTIZEN_SERVICE_URL: metaEnv.VITE_ZTIZEN_SERVICE_URL,
    PRODUCT_API_URL: metaEnv.VITE_PRODUCT_API_URL,
  }

  try {
    return envSchema.parse(rawEnv)
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Print friendly validation errors in development and fail fast in CI
      // and at startup so misconfiguration is obvious.
      // eslint-disable-next-line no-console
      console.error("❌ Environment validation failed:")
      // eslint-disable-next-line no-console
      console.error(error.issues)
      throw new Error(`Invalid environment variables: ${error.issues
        .map((e: { message: string }) => e.message)
        .join(", ")}`)
    }
    throw error
  }
}

/**
 * Validated and typed environment variables
 */
export const ENV = parseEnv()

/**
 * Helpers for runtime checks
 */
export const isDev = (import.meta as any).env?.DEV ?? false
export const isProd = (import.meta as any).env?.PROD ?? false

/**
 * Type-safe environment variables
 */
export type Environment = z.infer<typeof envSchema>
