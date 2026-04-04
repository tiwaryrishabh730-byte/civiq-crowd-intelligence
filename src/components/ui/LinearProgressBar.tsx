export function LinearProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="w-full h-1.5 bg-black/40 border border-white/10 rounded-none overflow-hidden flex mt-1 backdrop-blur-sm">
      <div 
        className="h-full transition-all duration-300 ease-out" 
        style={{ width: `${percent}%`, backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
      />
    </div>
  );
}
