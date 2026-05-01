import React, { useState, useEffect } from 'react';

export const AnimatedFlash = ({ value, className, type = 'text' }: { value: string | number | null | undefined, className?: string, type?: 'text' | 'price' }) => {
  const [prev, setPrev] = useState(value);
  const [highlight, setHighlight] = useState('');
  const [displayValue, setDisplayValue] = useState(value);

  const toNumeric = (v: unknown) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    const cleaned = v.replace(/[^0-9.+-]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  };

  useEffect(() => {
    if (value !== prev) {
      const currNum = toNumeric(value);
      const prevNum = toNumeric(prev);
      const isUp = currNum != null && prevNum != null && currNum > prevNum;
      const isDown = currNum != null && prevNum != null && currNum < prevNum;
      
      let colorClass = 'text-blue-600 dark:text-blue-400';
      if (type === 'price' && currNum != null && prevNum != null) {
         if (isUp) colorClass = 'text-green-600 dark:text-green-400';
         if (isDown) colorClass = 'text-red-600 dark:text-red-400';
      }

      setHighlight(`animate-pulse ${colorClass} font-bold scale-110 origin-center`);
      setDisplayValue(value);
      
      const timer = setTimeout(() => {
        setHighlight('');
        setPrev(value);
      }, 800);
      
      return () => clearTimeout(timer);
    }
  }, [value, prev, type]);

  return (
    <span className={`${className} ${highlight} inline-block transition-all duration-300`}>
      {displayValue ?? '-'}
    </span>
  );
};
