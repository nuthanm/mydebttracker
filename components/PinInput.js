'use client';

import { useEffect, useRef } from 'react';

export default function PinInput({ value, onChange, autoFocus = false }) {
  const refs = useRef([]);

  useEffect(() => {
    if (autoFocus && refs.current[0]) refs.current[0].focus();
  }, [autoFocus]);

  const handleChange = (idx, raw) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    const arr = (value || '').split('');
    arr[idx] = digit;
    const next = arr.join('').slice(0, 6);
    onChange(next);
    if (digit && idx < 5) refs.current[idx + 1]?.focus();
  };

  const handleKey = (idx, e) => {
    if (e.key === 'Backspace' && !value[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const text = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (text) {
      e.preventDefault();
      onChange(text);
      const lastIdx = Math.min(text.length, 5);
      refs.current[lastIdx]?.focus();
    }
  };

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          className={`w-10 h-12 text-center text-lg font-medium rounded-lg border bg-paper-card transition ${value[i] ? 'border-mint-600 bg-mint-50 text-mint-700' : 'border-edge'}`}
        />
      ))}
    </div>
  );
}
