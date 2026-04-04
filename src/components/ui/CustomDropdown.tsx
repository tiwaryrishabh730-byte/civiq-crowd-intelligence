import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface CustomDropdownProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function CustomDropdown({ options, value, onChange, placeholder = '— SELECT —', className = '' }: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative w-full z-50 ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between text-white text-[13px] px-4 min-h-[48px] font-mono focus:outline-none rounded-none appearance-none active:scale-95 transition-all bg-black/40 backdrop-blur-md border-[0.5px] border-white/10 will-change-backdrop-filter hover:bg-black/60"
      >
        <span className="truncate tracking-[0.05em] text-[#39FF14] neon-text">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown size={18} className={`text-[#39FF14] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className="absolute z-[60] w-full top-full mt-[2px] bg-black/80 backdrop-blur-lg border-[0.5px] border-white/10 max-h-[40vh] overflow-y-auto rounded-none shadow-2xl"
        >
          <button
            type="button"
            onClick={() => {
              onChange('');
              setIsOpen(false);
            }}
            className="w-full text-left px-4 min-h-[48px] text-[13px] font-mono transition-colors duration-200 text-[#9AA0A6] hover:bg-[#39FF14]/10 hover:text-[#39FF14] tracking-[0.05em] rounded-none border-b-[0.5px] border-white/10 appearance-none bg-transparent"
          >
            — CLEAR / SELECT —
          </button>
          
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 min-h-[48px] text-[13px] font-mono transition-colors duration-200 tracking-[0.05em] rounded-none border-b-[0.5px] border-white/10 last:border-none appearance-none active:bg-[#39FF14]/20 ${
                value === opt.value ? 'bg-[#39FF14]/20 text-[#39FF14] neon-text' : 'text-[#9AA0A6] hover:bg-[#39FF14]/10 hover:text-[#39FF14] bg-transparent'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
