/**
 * LINE Login Button Component
 *
 * Initiates LINE OAuth flow by redirecting to the backend
 * LINE login endpoint.
 */

import React from 'react';

interface LineLoginButtonProps {
  returnUrl?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  className?: string;
}

export function LineLoginButton({
  returnUrl,
  disabled = false,
  fullWidth = false,
  className
}: LineLoginButtonProps) {
  const handleClick = () => {
    // Build login URL with return_url param
    const loginUrl = new URL('/api/line/login', window.location.origin);

    // Use current path as return URL if not specified
    const returnPath = returnUrl || window.location.pathname + window.location.search;
    loginUrl.searchParams.set('return_url', returnPath);

    // Redirect to LINE OAuth
    window.location.href = loginUrl.toString();
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={className}
      style={{
        ...styles.button,
        width: fullWidth ? '100%' : 'auto',
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer'
      }}
    >
      <svg
        viewBox="0 0 24 24"
        style={styles.icon}
        fill="currentColor"
      >
        {/* LINE Logo */}
        <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
      </svg>
      <span>Login with LINE</span>
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    padding: '0.875rem 1.5rem',
    fontSize: '1rem',
    fontWeight: 600,
    backgroundColor: '#06C755',  // LINE official green
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    transition: 'all 0.2s ease',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  icon: {
    width: '24px',
    height: '24px'
  }
};

export default LineLoginButton;
