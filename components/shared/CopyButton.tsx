'use client';

import { useState, useEffect, useRef } from 'react';
import { Copy, Check } from 'lucide-react';
import { Tooltip } from './Tooltip';

export function CopyButton({
  value,
  label = 'Copy to clipboard',
  className = '',
  size = 'sm',
}: {
  value: string;
  label?: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error('Copy failed', e);
    }
  }

  const Icon = copied ? Check : Copy;
  const tooltip = copied ? 'Copied!' : label;
  const dim = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  const pad = size === 'md' ? 'p-2' : 'p-1.5';

  return (
    <Tooltip content={tooltip}>
      <button
        type="button"
        onClick={copy}
        aria-label={label}
        className={`inline-flex items-center justify-center rounded-md ${pad} text-zinc-400 transition hover:bg-white/10 hover:text-cyan-300 active:scale-95 ${copied ? 'text-emerald-300' : ''} ${className}`}
      >
        <Icon className={dim} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
