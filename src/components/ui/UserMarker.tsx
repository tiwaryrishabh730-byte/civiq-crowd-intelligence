import { useEffect, useState } from 'react';
import { useMap, Marker } from 'react-leaflet';
import L from 'leaflet';
import { useGeoLocation } from '@/hooks/useGeoLocation';

const sentinelIcon = L.divIcon({
  className: 'sentinel-crosshair-wrapper',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  html: '<div class="sentinel-crosshair"></div>'
});

export function UserMarker() {
  const { coordinates } = useGeoLocation();
  const map = useMap();
  const [hasInitialFly, setHasInitialFly] = useState(false);

  useEffect(() => {
    if (coordinates && !hasInitialFly) {
      map.flyTo([coordinates.lat, coordinates.lng], 16, { duration: 1.5, easeLinearity: 0.25 });
      setHasInitialFly(true);
    }
  }, [coordinates, map, hasInitialFly]);

  useEffect(() => {
    const handleLocateEvent = () => {
      if (coordinates) {
        map.flyTo([coordinates.lat, coordinates.lng], 16, { duration: 1.5, easeLinearity: 0.25 });
      }
    };
    
    document.addEventListener('map-locate-user', handleLocateEvent);
    return () => document.removeEventListener('map-locate-user', handleLocateEvent);
  }, [coordinates, map]);

  if (!coordinates) return null;

  return (
    <Marker position={[coordinates.lat, coordinates.lng]} icon={sentinelIcon} />
  );
}
