import { usePrivy, useWallets } from '@privy-io/react-auth'

/**
 * Hook: useCreateCreateSignature
 *
 * Signs a message (containing the provided password) with the user's wallet
 * (MetaMask / injected provider) and returns the signature and the exact
 * signed message. This is a thin wrapper around the injected provider's
 * `personal_sign` call.
 *
 * WARNING: Signing a raw password and treating the signature as a secret is
 * usually a bad idea (see security notes below). Prefer signing a server
 * challenge (nonce) and deriving any secret material server-side.
 */
export function useCreateCreateSignature() {
  const { user } = usePrivy()
  const { wallets } = useWallets()

  /**
   * Sign the provided password (or any string) with the user's wallet.
   * Returns { signature, message, address }.
   */
  const sign = async (password: string) => {
    if (!password || typeof password !== 'string') {
      throw new Error('password (string) is required')
    }

    const address = wallets?.[0]?.address || (user as any)?.wallet?.address
    if (!address) throw new Error('No connected wallet address found')

    const provider = (window as any)?.ethereum
    if (!provider || !provider.request) {
      throw new Error('No injected Ethereum provider found (MetaMask)')
    }

    // Create a structured message to avoid ambiguity and to prevent signing
    // raw user data directly. Including a domain/purpose and timestamp is
    // recommended so signatures are not re-usable forever.
    const messageObj = {
      domain: 'ZTIZEN: secret-signature',
      purpose: 'derive-client-secret',
      // NOTE: signing the password directly is not recommended; we include
      // it here because the user requested it. Prefer a server nonce.
      password,
      ts: Date.now(),
    }

    const message = JSON.stringify(messageObj)

    // personal_sign parameters: [message, address]
    // Some providers expect the address first then the message. Metamask
    // supports ['0x..address', 'message'] for eth_sign and [message, address]
    // for personal_sign; personal_sign with [message, address] is widely used.
    const signature = await provider.request({
      method: 'personal_sign',
      params: [message, address],
    })

    return { signature, message, address }
  }

  return { sign }
}

export default useCreateCreateSignature

/*
Security notes (short):
- A signature proves that the holder of the private key signed the exact
  `message` string. If an attacker has the signature and the signer's public
  key (or address), they can verify candidate messages offline. That means
  if the message contains a low-entropy secret (like a password), the
  attacker can brute-force guesses and check which one matches the signature.

- Therefore: DO NOT treat a signature as a secret by itself. Do not publish
  signatures containing raw passwords. Instead:
  - Sign a server-provided random nonce (challenge). The server verifies the
    signature and issues a short-lived token or derives a secret on the server.
  - If you must derive client-side secrets from a signature, use a high-entropy
    input (not user password) and then run the signature through a KDF (HKDF)
    together with a server nonce that the attacker cannot guess.

- Public knowledge of the signature + public key does NOT reveal the private
  key or plaintext message by itself, but it enables verification and offline
  brute-force attacks on the plaintext when the plaintext is low entropy.
*/
