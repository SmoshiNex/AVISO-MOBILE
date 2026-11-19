import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useThemeColor } from '@/hooks/use-theme-color';
import {
  MAX_NOTE_LENGTH,
  MAX_PHOTO_BYTES,
  submitHazardReport,
  takeHazardReportPhoto,
  type HazardReportPhoto,
} from '@/lib/hazard-reports';

type HazardReportSheetProps = {
  /** The saved hazard being reported, or null when closed. */
  hazard: { id: number; type: string; code?: string } | null;
  onClose: () => void;
  /** Called after the report was sent. */
  onSent: (hazardId: number) => void;
};

/**
 * "Hazard no longer there": take a photo of the spot (camera only), add an
 * optional note, and send it for an admin to check.
 */
export function HazardReportSheet({ hazard, onClose, onSent }: HazardReportSheetProps) {
  const card = useThemeColor({}, 'card');
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const primary = useThemeColor({}, 'primary');
  const border = useThemeColor({}, 'border');

  const success = useThemeColor({}, 'success');
  const danger = useThemeColor({}, 'danger');

  const [photo, setPhoto] = useState<HazardReportPhoto | null>(null);
  const [note, setNote] = useState('');
  // idle → sending → sent, or sending → failed (photo and note kept for "Try again").
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [errorText, setErrorText] = useState('');
  const sending = status === 'sending';

  const reset = () => {
    setPhoto(null);
    setNote('');
    setStatus('idle');
    setErrorText('');
  };

  const close = () => {
    if (sending) return;
    reset();
    onClose();
  };

  const takePhoto = async () => {
    try {
      const taken = await takeHazardReportPhoto();
      if (!taken) return;
      if (taken.fileSize != null && taken.fileSize > MAX_PHOTO_BYTES) {
        Toast.show({ type: 'error', text1: 'Photo too large', text2: 'Please take the photo again (10 MB maximum).' });
        return;
      }
      setPhoto(taken);
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Camera unavailable',
        text2: err instanceof Error ? err.message : 'Could not open the camera.',
      });
    }
  };

  const send = async () => {
    if (!hazard || !photo || sending) return;
    setStatus('sending');
    setErrorText('');
    try {
      await submitHazardReport(hazard.id, photo, note);
      setStatus('sent');
      onSent(hazard.id);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Please check your connection and try again.');
      setStatus('failed');
    }
  };

  if (status === 'sent') {
    return (
      <Modal visible={hazard !== null} transparent animationType="slide" onRequestClose={close}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, styles.doneSheet, { backgroundColor: card, borderColor: border }]}>
            <Ionicons name="checkmark-circle" size={64} color={success} />
            <Text style={[styles.title, { color: text }]}>Report sent!</Text>
            <Text style={[styles.subtitle, styles.centered, { color: textSecondary }]}>
              Your photo was delivered to the admin. The pin stays on the map until an admin confirms it.
            </Text>
            <TouchableOpacity
              onPress={close}
              style={[styles.sendButton, styles.fullWidth, { backgroundColor: primary }]}
              accessibilityRole="button"
            >
              <Text style={styles.sendText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={hazard !== null} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={[styles.sheet, { backgroundColor: card, borderColor: border }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: text }]}>Hazard no longer there</Text>
            <TouchableOpacity onPress={close} accessibilityLabel="Close" hitSlop={10} disabled={sending}>
              <Ionicons name="close" size={22} color={textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.subtitle, { color: textSecondary }]}>
            {hazard ? `${hazard.type}${hazard.code ? ` · ${hazard.code}` : ''}` : ''}
            {'\n'}Take a photo of the spot as proof. An admin will check it before removing the pin.
          </Text>

          {photo ? (
            <TouchableOpacity onPress={takePhoto} disabled={sending} accessibilityLabel="Retake photo">
              <Image source={{ uri: photo.uri }} style={styles.preview} contentFit="cover" />
              <Text style={[styles.retake, { color: primary }]}>Tap the photo to retake</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={takePhoto}
              style={[styles.cameraButton, { borderColor: primary }]}
              accessibilityRole="button"
            >
              <Ionicons name="camera-outline" size={28} color={primary} />
              <Text style={[styles.cameraText, { color: primary }]}>Take photo</Text>
            </TouchableOpacity>
          )}

          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Note (optional), e.g. Already patched"
            placeholderTextColor={textSecondary}
            maxLength={MAX_NOTE_LENGTH}
            editable={!sending}
            style={[styles.note, { color: text, borderColor: border }]}
          />

          {sending && (
            <Text style={[styles.statusText, { color: textSecondary }]}>
              Uploading your photo to the admin… keep the app open.
            </Text>
          )}
          {status === 'failed' && (
            <View style={[styles.errorBox, { borderColor: danger }]}>
              <Ionicons name="alert-circle" size={18} color={danger} />
              <Text style={[styles.errorText, { color: danger }]}>Not sent. {errorText}</Text>
            </View>
          )}

          <TouchableOpacity
            onPress={send}
            disabled={!photo || sending}
            style={[styles.sendButton, { backgroundColor: primary, opacity: !photo || sending ? 0.5 : 1 }]}
            accessibilityRole="button"
          >
            {sending ? (
              <View style={styles.sendingRow}>
                <ActivityIndicator color="#FFFFFF" />
                <Text style={styles.sendText}>Sending to admin…</Text>
              </View>
            ) : (
              <Text style={styles.sendText}>{status === 'failed' ? 'Try again' : 'Send report'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    padding: 16,
    paddingBottom: 28,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  cameraButton: {
    height: 140,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  cameraText: {
    fontSize: 15,
    fontWeight: '600',
  },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: 14,
  },
  retake: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
  },
  note: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendButton: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  sendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusText: {
    fontSize: 13,
    textAlign: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
  },
  doneSheet: {
    alignItems: 'center',
  },
  centered: {
    textAlign: 'center',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
});
