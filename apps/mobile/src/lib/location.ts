import * as Location from 'expo-location';
import { GPS_TIMEOUT_MS } from '@fazoo/config';

export interface Fix {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export async function getFix(): Promise<Fix> {
  const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error(
      canAskAgain
        ? 'Location permission is needed to verify you are at the store.'
        : 'Location permission is blocked. Enable it in Settings → Fazoo → Location.',
    );
  }

  const position = await Promise.race<Location.LocationObject | Error>([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
    new Promise<Error>((resolve) =>
      setTimeout(() => resolve(new Error('Getting your location timed out. Try again outdoors.')), GPS_TIMEOUT_MS),
    ),
  ]);

  if (position instanceof Error) throw position;

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy ?? null,
  };
}
