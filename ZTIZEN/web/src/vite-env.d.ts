/// <reference types="vite/client" />

declare module '*.json' {
  const value: any;
  export default value;
}

declare module 'snarkjs' {
  export interface Groth16Proof {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  }
  export type PublicSignals = string[];
  export const groth16: {
    fullProve(input: object, wasmFile: Uint8Array | string, zkeyFile: Uint8Array | string): Promise<{ proof: Groth16Proof; publicSignals: PublicSignals }>;
    verify(vKey: unknown, publicSignals: PublicSignals, proof: Groth16Proof): Promise<boolean>;
    exportSolidityCallData(proof: Groth16Proof, publicSignals: PublicSignals): Promise<string>;
  };
}
