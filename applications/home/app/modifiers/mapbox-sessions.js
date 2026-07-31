// app/modifiers/mapbox-sessions.js
import { modifier } from 'ember-modifier';
import mapboxgl from 'mapbox-gl';

const MAPBOX_TOKEN = window.ENV?.MAPBOX_TOKEN ?? '';

export default modifier((element, [sessions], { onSelect }) => {
  mapboxgl.accessToken = MAPBOX_TOKEN;

  const map = new mapboxgl.Map({
    container: element,
    style:     'mapbox://styles/mapbox/light-v11',
    zoom:      4,
    center:    [36.8, 0.0],
  });

  map.addControl(new mapboxgl.NavigationControl(), 'top-right');

  map.once('load', () => {
    const bounds = new mapboxgl.LngLatBounds();
    let hasBounds = false;

    (sessions ?? []).forEach(session => {
      const lat = parseFloat(session.modules.checkin_latitude);
      const lng = parseFloat(session.modules.checkin_longitude);
      if (!lat || !lng) return;

      const status = session.modules.status;
      const colour = status === 'cancelled' ? '#EF4444' : '#22C55E';

      // Wrapper keeps the hit area square and correctly positioned
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `
        width: 28px;
        height: 28px;
        cursor: pointer;
      `;

      // Inner rotated shape — pointer-events: none so it doesn't
      // steal events from the wrong (rotated) coordinates
      const el = document.createElement('div');
      el.className     = 'fazoo-map-pin';
      el.style.cssText = `
        width: 28px;
        height: 28px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        background: ${colour};
        border: 3px solid #fff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        pointer-events: none;
      `;

      wrapper.appendChild(el);

      wrapper.addEventListener('click', () => {
        if (typeof onSelect === 'function') onSelect(session);
      });

      new mapboxgl.Marker({ element: wrapper, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(map);

      bounds.extend([lng, lat]);
      hasBounds = true;
    });

    if (hasBounds) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 12 });
    }
  });

  return () => map.remove();
});