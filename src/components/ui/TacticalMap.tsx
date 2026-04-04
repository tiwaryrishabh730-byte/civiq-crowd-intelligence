import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useState } from 'react';
import { UserMarker } from '@/components/ui/UserMarker';

// Define the custom map icon safely outside react lifecycle
const customIcon = L.divIcon({
  className: 'custom-leaflet-marker',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  html: '<div class="neon-pulse"></div>'
});

export function TacticalMap({ center }: { center?: { lat: number; lng: number } }) {
  const mapCenter = center || { lat: 19.076, lng: 72.8777 };
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div className="w-full h-full bg-[#000000] border-[0.5px] border-[#202124] flex items-center justify-center text-[#9AA0A6] font-mono text-[11px] tracking-widest uppercase">INITIALIZING SAT-LINK...</div>;

  return (
    <div className="w-full h-full border-[0.5px] border-[#202124] relative bg-[#000000] z-0 pointer-events-auto">
      <MapContainer 
        center={[mapCenter.lat, mapCenter.lng]} 
        zoom={14} 
        style={{ width: '100%', height: '100%', background: '#000000' }} 
        zoomControl={false} 
        attributionControl={false}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        dragging={true}
        touchZoom={true}
        {...({ tap: false } as any)}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <Marker position={[mapCenter.lat, mapCenter.lng]} icon={customIcon} />
        <UserMarker />
      </MapContainer>
    </div>
  )
}
