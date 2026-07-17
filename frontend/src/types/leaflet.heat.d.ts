// Type shim for the `leaflet.heat` plugin, which ships no bundled types.
// It augments Leaflet with `L.heatLayer(...)` at runtime; declare that here so
// the heatmap layer in MapExplorer is fully typed.
import 'leaflet';

declare module 'leaflet' {
  interface HeatLayerOptions {
    minOpacity?: number;
    maxZoom?: number;
    max?: number;
    radius?: number;
    blur?: number;
    gradient?: Record<number, string>;
  }

  // A heat point is [lat, lng, intensity?].
  type HeatLatLngTuple = [number, number, number?];

  interface HeatLayer extends Layer {
    setLatLngs(latlngs: HeatLatLngTuple[]): this;
    addLatLng(latlng: HeatLatLngTuple): this;
    setOptions(options: HeatLayerOptions): this;
    redraw(): this;
  }

  function heatLayer(latlngs: HeatLatLngTuple[], options?: HeatLayerOptions): HeatLayer;
}

// Allow the bare side-effect import `import 'leaflet.heat';`.
declare module 'leaflet.heat';
