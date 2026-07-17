/**
 * MapContainer — Leaflet base map wrapper.
 *
 * Defaults to a REAL satellite basemap (Esri World Imagery — free, no API key)
 * with a place-name/reference labels overlay, so the map shows genuine imagery
 * of the ocean and coastline. Pass basemap="street" for the OpenStreetMap view.
 */
import { type ReactNode } from 'react';
import { MapContainer as LeafletMapContainer, TileLayer } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import { cn } from '@/lib/utils';

// Leaflet CSS is loaded globally in index.html

export interface MapContainerProps {
  center?: LatLngExpression;
  zoom?: number;
  /** 'satellite' (Esri World Imagery, default) or 'street' (OpenStreetMap). */
  basemap?: 'satellite' | 'street';
  /** Additional Leaflet layers / overlays */
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

// Default view: Indian Ocean centred
const DEFAULT_CENTER: LatLngExpression = [14.5, 80.0];
const DEFAULT_ZOOM = 5;

const ESRI_IMAGERY =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_LABELS =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

export function MapContainer({
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  basemap = 'satellite',
  children,
  className,
  style,
}: MapContainerProps) {
  return (
    <div className={cn('relative w-full h-full rounded-[inherit] overflow-hidden', className)} style={style}>
      <LeafletMapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom
        style={{ width: '100%', height: '100%' }}
        // Prevent leaflet attributing class conflicts with Tailwind
        className="z-0"
      >
        {basemap === 'satellite' ? (
          <>
            {/* Real Sentinel/aerial composite imagery — free, no token required */}
            <TileLayer
              attribution='Imagery &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics'
              url={ESRI_IMAGERY}
              maxZoom={19}
            />
            {/* Transparent place-name + boundary labels on top of the imagery */}
            <TileLayer url={ESRI_LABELS} maxZoom={19} />
          </>
        ) : (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        )}
        {children}
      </LeafletMapContainer>
    </div>
  );
}
