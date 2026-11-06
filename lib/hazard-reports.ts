import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { api } from '@/lib/api-client';

/** The server accepts photos up to 2 MB. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_NOTE_LENGTH = 200;

export type HazardReportPhoto = { uri: string; fileSize?: number };

export type HazardReportResult = {
  id: number;
  hazard_log_id: number;
  status: 'pending' | 'confirmed' | 'rejected';
  distance_m: number | null;
};

/**
 * Opens the camera (never the gallery, so the proof photo is fresh and taken
 * at the spot). Returns null when the rider cancels.
 * Throws when camera permission is refused.
 */
export async function takeHazardReportPhoto(): Promise<HazardReportPhoto | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('AVISO needs camera access to take the proof photo.');
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: 'images',
    quality: 0.3,
    exif: false,
  });
  if (result.canceled || result.assets.length === 0) return null;

  const asset = result.assets[0];
  return { uri: asset.uri, fileSize: asset.fileSize };
}

/** The rider's position now, or null when there is no fix (the report still works). */
async function currentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const last = await Location.getLastKnownPositionAsync({ maxAge: 30000 });
    const fix = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { latitude: fix.coords.latitude, longitude: fix.coords.longitude };
  } catch {
    return null;
  }
}

/**
 * "Hazard no longer there": sends the photo (and the rider's position, so the
 * admin sees how far away it was taken) for an admin to review.
 */
export async function submitHazardReport(
  hazardId: number,
  photo: HazardReportPhoto,
  note: string,
): Promise<HazardReportResult> {
  const formData = new FormData();
  formData.append('photo', {
    uri: photo.uri,
    name: 'hazard-report.jpg',
    type: 'image/jpeg',
  } as unknown as Blob);

  const position = await currentPosition();
  if (position) {
    formData.append('latitude', String(position.latitude));
    formData.append('longitude', String(position.longitude));
  }

  const trimmed = note.trim().slice(0, MAX_NOTE_LENGTH);
  if (trimmed) formData.append('note', trimmed);

  const res = await api.postForm<{ data: HazardReportResult }>(`/rider/hazards/${hazardId}/reports`, formData);
  return res.data;
}
