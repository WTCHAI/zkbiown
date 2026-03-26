/**
 * User Identities Store
 *
 * Manages user identity lifecycle including version tracking and revocation
 *
 * Version Semantics:
 * - Version starts at 1 during enrollment
 * - Increment version to revoke all previous templates
 * - Each version generates completely different Gaussian projection matrix
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Identity {
  credential_id: string;
  user_id: string;
  product_id: string;
  product_name: string;
  service_name: string;
  version: number;
  enrolled_at: string;
  last_verified_at?: string;
  status: 'pending' | 'enrolled' | 'revoked';
}

interface IdentitiesState {
  identities: Map<string, Identity>;

  // Actions
  addIdentity: (identity: Identity) => void;
  getIdentity: (credential_id: string) => Identity | undefined;
  updateVersion: (credential_id: string, newVersion: number) => void;
  revokeIdentity: (credential_id: string) => void;
  updateLastVerified: (credential_id: string) => void;
  clearIdentities: () => void;
}

export const useIdentitiesStore = create<IdentitiesState>()(
  persist(
    (set, get) => ({
      identities: new Map(),

      addIdentity: (identity: Identity) => {
        set((state) => {
          const newIdentities = new Map(state.identities);
          newIdentities.set(identity.credential_id, {
            ...identity,
            version: identity.version || 1, // Default version to 1
          });
          return { identities: newIdentities };
        });
      },

      getIdentity: (credential_id: string) => {
        return get().identities.get(credential_id);
      },

      updateVersion: (credential_id: string, newVersion: number) => {
        set((state) => {
          const newIdentities = new Map(state.identities);
          const identity = newIdentities.get(credential_id);

          if (identity) {
            newIdentities.set(credential_id, {
              ...identity,
              version: newVersion,
            });
          }

          return { identities: newIdentities };
        });
      },

      revokeIdentity: (credential_id: string) => {
        set((state) => {
          const newIdentities = new Map(state.identities);
          const identity = newIdentities.get(credential_id);

          if (identity) {
            newIdentities.set(credential_id, {
              ...identity,
              status: 'revoked',
            });
          }

          return { identities: newIdentities };
        });
      },

      updateLastVerified: (credential_id: string) => {
        set((state) => {
          const newIdentities = new Map(state.identities);
          const identity = newIdentities.get(credential_id);

          if (identity) {
            newIdentities.set(credential_id, {
              ...identity,
              last_verified_at: new Date().toISOString(),
            });
          }

          return { identities: newIdentities };
        });
      },

      clearIdentities: () => {
        set({ identities: new Map() });
      },
    }),
    {
      name: 'ztizen-identities-storage',
      // Custom storage with Map serialization support
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const data = JSON.parse(str);
          return {
            state: {
              identities: new Map(data.state.identities || []),
            },
          };
        },
        setItem: (name, value) => {
          const serialized = JSON.stringify({
            state: {
              identities: Array.from(value.state.identities.entries()),
            },
          });
          localStorage.setItem(name, serialized);
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      },
    }
  )
);
