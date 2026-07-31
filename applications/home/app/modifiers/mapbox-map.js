import { modifier } from 'ember-modifier';
import mapboxgl from 'mapbox-gl';

const MAPBOX_TOKEN = window.ENV?.MAPBOX_TOKEN ?? '';

export default modifier((element, [sessions]) => {
  mapboxgl.accessToken = MAPBOX_TOKEN;

  const map = new mapboxgl.Map({
    container: element,
    style: 'mapbox://styles/mapbox/light-v11',
    center: [36.8219, -1.2921], // Nairobi default
    zoom: 9,
  });

  map.addControl(new mapboxgl.NavigationControl(), 'top-right');

  const bounds = new mapboxgl.LngLatBounds();
  let hasBounds = false;

  (sessions ?? []).forEach((session) => {
    const lat = parseFloat(session.modules?.checkin_latitude);
    const lng = parseFloat(session.modules?.checkin_longitude);
    if (!lat || !lng) return;

    const isActive = session.modules?.status === 'completed';

    const el = document.createElement('div');
    el.style.cssText = `
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: ${isActive ? '#22C55E' : '#EF4444'};
      border: 2px solid #fff;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
      cursor: pointer;
    `;

    const popup = new mapboxgl.Popup({ offset: 12, closeButton: false })
      .setHTML(`
      <div style="font-family: Inter, sans-serif; font-size: 13px; padding: 2px 4px">
        <strong>${session.modules?.title ?? 'Session'}</strong><br>
        ${session.modules?.session_date ?? ''}<br>
        Learners: ${session.modules?.learner_count ?? '—'}<br>
        <span style="color: ${isActive ? '#22C55E' : '#EF4444'}; font-weight: 600; text-transform: capitalize">
          ${session.modules?.status ?? ''}
        </span>
      </div>
    `);

    new mapboxgl.Marker(el).setLngLat([lng, lat]).setPopup(popup).addTo(map);

    bounds.extend([lng, lat]);
    hasBounds = true;
  });

  if (hasBounds) {
    map.fitBounds(bounds, { padding: 60, maxZoom: 13 });
  }

  return () => map.remove();
});
