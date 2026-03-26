/**
 * Algorithm Selector Component
 *
 * Shows the selected cancelable biometric algorithm (gaussian-sparse only).
 * This component now only displays the single supported algorithm.
 *
 * Features:
 * - Shows Sparse Gaussian (Achlioptas/Chellappa) algorithm
 * - Academic paper citations
 * - Security and performance information
 */

import { useState } from 'react';
import { useAlgorithmStore } from '@/stores/useAlgorithmStore';
import {
  ALGORITHM_PAPERS,
  type AlgorithmType,
  type PaperReference,
} from '@/lib/CancelableBiometric';

interface AlgorithmOption {
  value: AlgorithmType;
  name: string;
  description: string;
  templateSize: string;
  security: string;
  securityLevel: 'computational' | 'information-theoretic';
  performance: string;
  recommended?: boolean;
  warning?: string;
  papers: PaperReference[];
}

const ALGORITHM_OPTIONS: AlgorithmOption[] = [
  {
    value: 'gaussian-sparse',
    name: 'Sparse Gaussian (Achlioptas/Chellappa)',
    description: '2/3 sparse projection matrix - IEEE TPAMI 2011 verified implementation',
    templateSize: '256 bits (browser ZK)',
    security: 'JL Lemma + RIP guarantees',
    securityLevel: 'computational',
    performance: 'Fastest (3× speedup via 66% sparse matrix)',
    recommended: true,
    papers: ALGORITHM_PAPERS['gaussian-sparse'],
  },
];

interface AlgorithmSelectorProps {
  showAllOptions?: boolean; // Kept for API compatibility, but only one option exists
  compact?: boolean; // Compact view for smaller spaces
}

export function AlgorithmSelector({
  showAllOptions = true,
  compact = false,
}: AlgorithmSelectorProps) {
  const { selectedAlgorithm, setAlgorithm } = useAlgorithmStore();
  const [expandedPapers, setExpandedPapers] = useState<string | null>(null);

  const options = ALGORITHM_OPTIONS;

  const togglePapers = (value: string) => {
    setExpandedPapers(expandedPapers === value ? null : value);
  };

  return (
    <div className="algorithm-selector space-y-6 p-6 bg-white rounded-lg shadow-lg">
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          Biometric Algorithm
        </h3>
        <p className="text-sm text-gray-600">
          Using Sparse Gaussian Random Projection (Achlioptas/Chellappa method)
          for template generation. This algorithm is backed by peer-reviewed
          research (IEEE TPAMI 2011).
        </p>
      </div>

      {/* Security Level Legend */}
      <div className="flex gap-4 text-xs">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-blue-500"></span>
          <span className="text-gray-600">Computational security (JL Lemma)</span>
        </div>
      </div>

      <div className="space-y-4">
        {options.map((option) => (
          <div
            key={option.value}
            className="relative border-2 rounded-lg border-blue-500 bg-blue-50"
          >
            <label className="flex flex-col p-4 cursor-pointer">
              <div className="flex items-start">
                <input
                  type="radio"
                  name="algorithm"
                  value={option.value}
                  checked={true}
                  readOnly
                  className="mt-1 mr-3 h-4 w-4 text-blue-600"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {/* Security Level Indicator */}
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                    <span className="font-semibold text-gray-900">
                      {option.name}
                    </span>
                    {option.recommended && (
                      <span className="px-2 py-0.5 text-xs font-medium text-green-700 bg-green-100 rounded">
                        Active
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-gray-600 mb-3">{option.description}</p>

                  {/* Metrics Grid */}
                  <div
                    className={`grid ${compact ? 'grid-cols-2' : 'grid-cols-3'} gap-3 text-xs`}
                  >
                    <div>
                      <span className="font-medium text-gray-700">Template:</span>
                      <div className="text-gray-600">{option.templateSize}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Security:</span>
                      <div className="text-gray-600">{option.security}</div>
                    </div>
                    {!compact && (
                      <div>
                        <span className="font-medium text-gray-700">
                          Performance:
                        </span>
                        <div className="text-gray-600">{option.performance}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </label>

            {/* Paper References Toggle */}
            <div className="border-t border-gray-200">
              <button
                type="button"
                onClick={() => togglePapers(option.value)}
                className="w-full px-4 py-2 text-xs text-left text-gray-500 hover:text-gray-700 hover:bg-gray-50 flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                    />
                  </svg>
                  Based on {option.papers.length} paper{option.papers.length > 1 ? 's' : ''}
                </span>
                <svg
                  className={`w-4 h-4 transform transition-transform ${
                    expandedPapers === option.value ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Expanded Paper References */}
              {expandedPapers === option.value && (
                <div className="px-4 pb-4 space-y-3">
                  {option.papers.map((paper, idx) => (
                    <div
                      key={idx}
                      className="text-xs bg-gray-50 p-3 rounded-lg border border-gray-100"
                    >
                      <div className="font-medium text-gray-900 mb-1">
                        {paper.authors} ({paper.year})
                      </div>
                      <div className="italic text-gray-700 mb-1">
                        "{paper.title}"
                      </div>
                      <div className="text-blue-600 text-xs mb-1">
                        {paper.institution}
                      </div>
                      {paper.doi && (
                        <div className="text-gray-400 text-xs">
                          DOI:{' '}
                          <a
                            href={`https://doi.org/${paper.doi}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline"
                          >
                            {paper.doi}
                          </a>
                        </div>
                      )}
                      <div className="mt-2 text-gray-600 bg-white p-2 rounded border border-gray-100">
                        <span className="font-medium">Key Property:</span>{' '}
                        {paper.keyProperty}
                      </div>
                    </div>
                  ))}

                  {/* Hybrid indicator for combined algorithms */}
                  {option.papers.length > 1 && (
                    <div className="text-xs text-purple-600 bg-purple-50 p-2 rounded flex items-center gap-2">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span>
                        <strong>Hybrid Algorithm:</strong> Combines techniques from{' '}
                        {option.papers.length} research papers
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Algorithm Details Panel */}
      <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          Algorithm Details
        </h4>
        <div className="text-sm text-blue-800 space-y-1">
          <p>
            <strong>How it works:</strong> Uses Achlioptas/Chellappa sparse matrix
            Φ[i,j] = {'{'}+√(3/m): 1/6, 0: 2/3, -√(3/m): 1/6{'}'} as per IEEE TPAMI 2011.
          </p>
          <p>
            <strong>Mathematical Basis:</strong> Satisfies Johnson-Lindenstrauss lemma
            and Restricted Isometry Property (RIP). 66% zeros give 3× speedup with
            identical security guarantees.
          </p>
          <p>
            <strong>Verified:</strong> Implementation matches Chellappa paper exactly
            (scale factor √(3/m), exact probability distribution).
          </p>
          <p>
            <strong>Best for:</strong> Demo and production - fastest computation with
            proven security from IEEE's top computer vision journal.
          </p>
        </div>
      </div>

      {/* Academic Note */}
      <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
        <strong>Academic Note:</strong> This implementation uses the Sparse Random
        Projection algorithm from "Database-friendly random projections" (Achlioptas, 2003)
        and its application to biometrics in "Secure and Robust Iris Recognition Using
        Random Projections" (Pillai, Patel, Chellappa, Ratha - IEEE TPAMI 2011).
      </div>
    </div>
  );
}
