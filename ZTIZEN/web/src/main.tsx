import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ProofProvider } from './contexts/ProofProvider';

// ZTIZEN + Product Integration Flow
// - Product Site → ZTIZEN Enrollment → ZTIZEN Verification
// - React Router with proper navigation
// - Trust-focused professional design
// - Purple gradient for ZTIZEN pages
// - ProofProvider pre-initializes Noir circuit for fast ZK proof generation

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ProofProvider>
      <App />
    </ProofProvider>
  </React.StrictMode>,
);
