import { useEffect, useState } from 'react';

interface NumberCounterProps {
  value: number;
  decimals?: number;
}

export function NumberCounter({ value, decimals = 0 }: NumberCounterProps) {
  const [currentValue, setCurrentValue] = useState(value);

  useEffect(() => {
    // A brutalist, jumpy counter
    let startTime: number;
    const duration = 200; // fast 200ms
    const startValue = currentValue;
    const diff = value - startValue;

    if (diff === 0) return;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      
      // linear progression for mechanical feel
      setCurrentValue(startValue + diff * progress);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  return <span>{currentValue.toFixed(decimals)}</span>;
}
