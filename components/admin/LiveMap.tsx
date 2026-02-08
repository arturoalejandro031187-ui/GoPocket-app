'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { UserIP } from '@/lib/security/types';

// Dynamic imports for Leaflet components to avoid SSR issues
// Note: We cast the component to any to avoid TypeScript issues with dynamic imports and React Leaflet
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false }) as any;
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false }) as any;
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false }) as any;
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false }) as any;
// Cluster component
const MarkerClusterGroup = dynamic(() => import('react-leaflet-cluster'), { ssr: false }) as any;

interface LiveMapProps {
  ips: UserIP[];
}

export default function LiveMap({ ips }: LiveMapProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Fix for Leaflet default icon not showing
    const fixLeafletIcon = async () => {
      try {
        const L = (await import('leaflet')).default;
        // @ts-ignore
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        });
      } catch (e) {
        console.error('Leaflet icon fix failed', e);
      }
    };
    
    fixLeafletIcon();
    setMounted(true);
  }, []);

  if (!mounted) return <div className="h-96 w-full animate-pulse bg-gray-100 rounded-xl flex items-center justify-center text-gray-400">Cargando mapa...</div>;

  // Filter IPs with valid coordinates
  const validIps = ips.filter(ip => ip.latitude && ip.longitude);
  // Default center: Xalapa, Veracruz (requested by user)
  const center: [number, number] = [19.5438, -96.9102];

  return (
    <div className="h-96 w-full overflow-hidden rounded-xl border border-gray-200 shadow-sm relative z-0">
      <MapContainer center={center} zoom={5} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {validIps.map((ip) => (
          <Marker key={ip.id} position={[ip.latitude!, ip.longitude!]}>
            <Popup>
              <div className="text-xs font-sans">
                <strong className="block text-sm mb-1">{ip.city || 'Desconocido'}, {ip.country}</strong>
                <span className="block text-gray-600">IP: {ip.ip_address}</span>
                <span className="block text-gray-600">ISP: {ip.isp}</span>
                <span className="block text-gray-500 text-[10px] mt-1">{new Date(ip.detected_at).toLocaleString()}</span>
                <a href={`/admin/usuarios?q=${ip.user_id}`} target="_blank" className="block mt-2 text-blue-600 hover:underline">Ver Usuario</a>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
