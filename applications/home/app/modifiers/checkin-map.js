import { modifier } from 'ember-modifier';
import mapboxgl from 'mapbox-gl';

const MAPBOX_TOKEN = window.ENV?.MAPBOX_TOKEN ?? '';

/**
 * `checkin-map` modifier
 *
 * Renders a small, non-interactive Mapbox map centred on a single captured
 * check-in point. The marker is fixed — the user cannot move or dismiss it.
 *
 * Usage in HBS:
 *   <div {{checkin-map this.checkinLatitude this.checkinLongitude}}></div>
 *
 * Positional args:
 *   [0] lat  {number|null}
 *   [1] lng  {number|null}
 */
export default modifier((element, [lat, lng]) => {
  if (!lat || !lng) return;

  mapboxgl.accessToken = MAPBOX_TOKEN;

  const map = new mapboxgl.Map({
    container: element,
    style: 'mapbox://styles/mapbox/light-v11',
    center: [lng, lat],
    zoom: 15,
    // Disable all interaction — this is a read-only location preview
    interactive: false,
  });

  // A simple pulsing dot to mark the exact captured position
  const el = document.createElement('div');
  el.style.cssText = `
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #3B82F6;
    border: 3px solid #fff;
    box-shadow: 0 0 0 3px rgba(59,130,246,0.35), 0 2px 6px rgba(0,0,0,0.3);
  `;

  new mapboxgl.Marker({ element: el, draggable: false })
    .setLngLat([lng, lat])
    .addTo(map);

  return () => map.remove();
});
