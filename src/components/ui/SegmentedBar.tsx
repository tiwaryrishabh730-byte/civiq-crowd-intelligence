export function SegmentedBar({ percent, color }: { percent: number; color: string }) {
  const activeBlocks = Math.round((percent / 100) * 10);

  return (
    <div className="flex items-center gap-[1px] h-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="w-[6px] h-full transition-colors duration-200"
          style={{ backgroundColor: i < activeBlocks ? color : '#202124' }}
        />
      ))}
    </div>
  );
}
