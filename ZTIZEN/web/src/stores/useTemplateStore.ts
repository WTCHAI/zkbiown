/**
 * Template Store
 *
 * Stores generated biometric templates after enrollment:
 * - Gaussian Template: Binary template from Gaussian Random Projection algorithm
 *
 * These templates are kept client-side for local verification.
 * Only auth_commits (Poseidon hashes) are sent to the server.
 *
 * Flow:
 * 1. Scan page generates Gaussian template
 * 2. Store template here before sending commits to server
 * 3. Use template for local verification later
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TemplateData {
  credentialId: string;
  template: number[]; // Gaussian Random Projection template (128-bit binary)
  faceDescriptor: number[]; // Original face descriptor (128-dim from face-api.js)
  createdAt: number;
  metadata: {
    source: string; // 'face-api.js' or 'mediapipe'
    dimensions: number;
    algorithm: string;
  };
}

interface TemplateStore {
  // Templates indexed by credential_id
  templates: Record<string, TemplateData>;

  // Actions
  storeTemplates: (
    credentialId: string,
    template: number[],
    faceDescriptor: number[],
    metadata: {
      source: string;
      dimensions: number;
      algorithm: string;
    }
  ) => void;

  getTemplates: (credentialId: string) => TemplateData | null;

  clearTemplates: (credentialId: string) => void;

  clearAllTemplates: () => void;

  hasTemplates: (credentialId: string) => boolean;
}

export const useTemplateStore = create<TemplateStore>()(
  persist(
    (set, get) => ({
      templates: {},

      // Store template for a credential
      storeTemplates: (credentialId, template, faceDescriptor, metadata) => {
        console.log('💾 Storing template for credential:', credentialId);
        console.log('  - Template length:', template.length);
        console.log('  - Face descriptor dimensions:', faceDescriptor.length);
        console.log('  - Algorithm:', metadata.algorithm);

        set((state) => ({
          templates: {
            ...state.templates,
            [credentialId]: {
              credentialId,
              template,
              faceDescriptor,
              createdAt: Date.now(),
              metadata,
            },
          },
        }));

        console.log('✅ Template stored successfully');
      },

      // Get templates for a credential
      getTemplates: (credentialId) => {
        const template = get().templates[credentialId];
        if (template) {
          console.log('📖 Retrieved templates for credential:', credentialId);
          return template;
        }
        console.log('❌ No templates found for credential:', credentialId);
        return null;
      },

      // Clear templates for a specific credential
      clearTemplates: (credentialId) => {
        console.log('🗑️ Clearing templates for credential:', credentialId);
        set((state) => {
          const { [credentialId]: _, ...rest } = state.templates;
          return { templates: rest };
        });
      },

      // Clear all templates
      clearAllTemplates: () => {
        console.log('🗑️ Clearing all templates');
        set({ templates: {} });
      },

      // Check if templates exist for a credential
      hasTemplates: (credentialId) => {
        return !!get().templates[credentialId];
      },
    }),
    {
      name: 'ztizen-template-storage', // LocalStorage key
      version: 1,
    }
  )
);
