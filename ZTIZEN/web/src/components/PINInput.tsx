/**
 * Mobile-style PIN Input Component
 *
 * Features:
 * - 6 individual digit boxes (like production mobile apps)
 * - Auto-focus next box on input
 * - Auto-focus previous box on backspace
 * - Numeric keyboard on mobile
 * - Paste support (e.g., paste "123456" fills all boxes)
 */

import { useRef, useEffect, KeyboardEvent } from 'react';

interface PINInputProps {
  value: string;
  onChange: (pin: string) => void;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
}

export function PINInput({
  value,
  onChange,
  length = 6,
  autoFocus = false,
  disabled = false
}: PINInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Initialize refs array
  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, length);
  }, [length]);

  // Auto-focus first input on mount
  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  // Convert value string to array of digits
  const digits = value.split('').slice(0, length);
  while (digits.length < length) {
    digits.push('');
  }

  const handleChange = (index: number, digit: string) => {
    // Only allow numeric input
    const numericValue = digit.replace(/\D/g, '');

    if (numericValue.length === 0) {
      // Handle deletion
      const newDigits = [...digits];
      newDigits[index] = '';
      onChange(newDigits.join(''));
      return;
    }

    // Handle single digit input
    if (numericValue.length === 1) {
      const newDigits = [...digits];
      newDigits[index] = numericValue;
      onChange(newDigits.join(''));

      // Auto-focus next input
      if (index < length - 1 && inputRefs.current[index + 1]) {
        inputRefs.current[index + 1]?.focus();
      }
      return;
    }

    // Handle paste (multiple digits)
    const pastedDigits = numericValue.split('').slice(0, length - index);
    const newDigits = [...digits];

    pastedDigits.forEach((d, i) => {
      if (index + i < length) {
        newDigits[index + i] = d;
      }
    });

    onChange(newDigits.join(''));

    // Focus last filled input or last input if all filled
    const nextEmptyIndex = newDigits.findIndex((d, i) => i >= index && d === '');
    const focusIndex = nextEmptyIndex === -1 ? length - 1 : Math.min(nextEmptyIndex, length - 1);

    if (inputRefs.current[focusIndex]) {
      setTimeout(() => {
        inputRefs.current[focusIndex]?.focus();
      }, 0);
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    // Handle backspace on empty input - move to previous
    if (e.key === 'Backspace' && digits[index] === '' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    }

    // Handle left arrow
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    }

    // Handle right arrow
    if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleFocus = (index: number) => {
    // Select all text on focus for easy replacement
    inputRefs.current[index]?.select();
  };

  return (
    <div style={styles.container}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => (inputRefs.current[index] = el)}
          type="text"
          inputMode="numeric"
          maxLength={length}
          value={digit}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onFocus={() => handleFocus(index)}
          disabled={disabled}
          style={{
            ...styles.input,
            ...(digit ? styles.inputFilled : {}),
            ...(disabled ? styles.inputDisabled : {}),
          }}
          aria-label={`PIN digit ${index + 1}`}
        />
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    gap: '0.5rem',
    justifyContent: 'center',
    marginBottom: '1rem',
  },
  input: {
    width: '3rem',
    height: '3.5rem',
    fontSize: '1.5rem',
    fontWeight: 600,
    textAlign: 'center',
    border: '2px solid #e5e5e5',
    borderRadius: '8px',
    outline: 'none',
    transition: 'all 0.2s ease',
    backgroundColor: '#fff',
    color: '#1a1a1a',
    caretColor: 'transparent',
  },
  inputFilled: {
    borderColor: '#1a1a1a',
    backgroundColor: '#f8f9fa',
  },
  inputDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
};
