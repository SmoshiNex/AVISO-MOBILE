import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';

const CACHE_DIR = `${FileSystem.cacheDirectory}jarvis-tts/`;

export async function generateJarvisAudio(
  text: string,
  cacheKey: string,
): Promise<Audio.Sound | null> {
  try {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });

    const cachePath = `${CACHE_DIR}${cacheKey}.wav`;
    const info = await FileSystem.getInfoAsync(cachePath);

    if (!info.exists) {
      const token = await getToken();
      console.log('[TTS] token present:', !!token);

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL ?? ''}/api/rider/tts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'audio/wav',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ text, cache_key: cacheKey }),
        },
      );

      console.log('[TTS] backend status:', response.status);
      if (!response.ok) {
        console.warn('[TTS] backend error — falling back to speech');
        return null;
      }

      const blob = await response.blob();
      console.log('[TTS] blob size:', blob.size);

      const base64 = await blobToBase64(blob);
      console.log('[TTS] base64 length:', base64.length);

      await FileSystem.writeAsStringAsync(cachePath, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      console.log('[TTS] saved to cache:', cachePath);
    } else {
      console.log('[TTS] playing from cache:', cachePath);
    }

    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const { sound } = await Audio.Sound.createAsync({ uri: cachePath });
    console.log('[TTS] sound created OK');
    return sound;
  } catch (err) {
    console.error('[TTS] unexpected error:', err);
    return null;
  }
}

export async function clearJarvisCache(): Promise<void> {
  await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true }).catch(() => {});
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function getToken(): Promise<string> {
  return (await SecureStore.getItemAsync('rider_token')) ?? '';
}
