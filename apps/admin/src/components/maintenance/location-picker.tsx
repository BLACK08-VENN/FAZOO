'use client';

import { useState } from 'react';
import { Crosshair, MapPin } from 'lucide-react';
import {
  captureLocation,
  locationMapUrl,
  manualPin,
  type LocationPin,
} from '@/lib/maintenance/location';
import styles from './workspace.module.css';

export function LocationPicker({
  onChange,
  disabled,
  onBusyChange,
}: {
  onBusyChange: (busy: boolean) => void;
  onChange: (pin: LocationPin | null, error: string) => void;
  disabled: boolean;
}) {
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [pin, setPin] = useState<LocationPin | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  function edit(lat: string, lng: string) {
    setLatitude(lat);
    setLongitude(lng);
    setPin(null);
    try {
      const result = manualPin(lat, lng);
      setPin(result);
      setError('');
      onChange(result, '');
    } catch {
      const message = 'Enter valid latitude (−90 to 90) and longitude (−180 to 180).';
      setError(message);
      onChange(null, message);
    }
  }
  async function locate() {
    if (!navigator.geolocation) {
      setError('GPS is unavailable in this browser. Enter the coordinates manually.');
      return;
    }
    setLocating(true);
    onBusyChange(true);
    setError('');
    try {
      const result = await captureLocation(navigator.geolocation);
      setLatitude(String(result.latitude));
      setLongitude(String(result.longitude));
      setPin(result);
      onChange(result, '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to capture your location.');
    } finally {
      setLocating(false);
      onBusyChange(false);
    }
  }
  return (
    <fieldset className={styles.pinPicker}>
      <legend>
        <MapPin size={15} aria-hidden="true" /> Site location pin
      </legend>
      <p>
        Use GPS only when you are at the job site. For a different site, enter its coordinates
        from your map.
      </p>
      <button
        type="button"
        className={styles.locateButton}
        onClick={locate}
        disabled={disabled || locating}
      >
        <Crosshair size={16} aria-hidden="true" />
        {locating ? 'Getting location…' : 'Use current GPS location'}
      </button>
      <div className={styles.formRow}>
        <label>
          Latitude
          <input
            name="latitude"
            type="number"
            step="any"
            min="-90"
            max="90"
            inputMode="decimal"
            placeholder="−90 to 90"
            value={latitude}
            disabled={disabled || locating}
            onChange={(e) => edit(e.target.value, longitude)}
          />
        </label>
        <label>
          Longitude
          <input
            name="longitude"
            type="number"
            step="any"
            min="-180"
            max="180"
            inputMode="decimal"
            placeholder="−180 to 180"
            value={longitude}
            disabled={disabled || locating}
            onChange={(e) => edit(latitude, e.target.value)}
          />
        </label>
      </div>
      {error ? (
        <p role="alert" className={styles.locationError}>
          {error}
        </p>
      ) : null}
      {pin ? (
        <div className={styles.pinResult} role="status">
          <strong>
            {pin.source === 'gps'
              ? `Device GPS · reported accuracy ±${Math.ceil(pin.accuracy_m ?? 0)} m`
              : 'Manual pin · accuracy not measured'}
          </strong>
          {pin.source === 'gps' && (pin.accuracy_m ?? 0) > 50 ? (
            <p>
              This reading may be too broad to identify a building. Try again outdoors and add
              floor/room details.
            </p>
          ) : null}
          <a href={locationMapUrl(pin)} target="_blank" rel="noopener noreferrer">
            Check this pin on Google Maps ↗
          </a>
        </div>
      ) : (
        <p className={styles.pinHint}>
          No map pin added yet. Technicians will rely on the address and access details.
        </p>
      )}
      <p className={styles.pinHint}>
        A one-time reading only. No background location tracking.
      </p>
    </fieldset>
  );
}
