export function SkeletonLoader() {
  return (
    <div className="w-full min-h-[72px] bg-[#111111] border border-[#39FF14]/50 rounded-none relative overflow-hidden animate-pulse">
      {/* Skeleton Left: Grid ID */}
      <div className="absolute top-1/2 -translate-y-1/2 left-4 w-24 h-4 bg-[#202124]" />
      
      {/* Skeleton Center: Bar */}
      <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-28 h-3 bg-[#202124]" />
      
      {/* Skeleton Right: Status Indicator */}
      <div className="absolute top-1/2 -translate-y-1/2 right-4 flex items-center justify-end gap-2">
         <div className="w-12 h-3 bg-[#202124]" />
         <div className="w-2 h-2 bg-[#202124]" />
      </div>
    </div>
  );
}
