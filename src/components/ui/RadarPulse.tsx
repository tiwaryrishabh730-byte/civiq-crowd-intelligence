export function RadarPulse({ color = '#00FF41', isActive = true }: { color?: string, isActive?: boolean }) {
  return (
    <div className="relative flex h-2 w-2 items-center justify-center">
      <div
        className="h-2 w-2"
        style={{
          backgroundColor: color,
          opacity: isActive ? 1 : 0,
          animation: isActive ? "hardware-led 1s steps(2, start) infinite" : "none"
        }}
      />
      <style>{`
        @keyframes hardware-led {
          0% { opacity: 1; }
          50% { opacity: 0; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
