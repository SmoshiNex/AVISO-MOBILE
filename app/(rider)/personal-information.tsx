import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useThemeColor } from '@/hooks/use-theme-color';
import { api } from '@/lib/api-client';
import { sanitizeText } from '@/lib/sanitize';
import type { User } from '@/types';

type EditableField = 'first_name' | 'last_name' | 'email' | 'contact_number';

const FIELDS: { key: EditableField; label: string; icon: string; keyboardType?: any; autoCapitalize?: any }[] = [
  { key: 'first_name',     label: 'First Name',     icon: 'person-outline',  autoCapitalize: 'words'  },
  { key: 'last_name',      label: 'Last Name',      icon: 'person-outline',  autoCapitalize: 'words'  },
  { key: 'email',          label: 'Email',           icon: 'mail-outline',    keyboardType: 'email-address', autoCapitalize: 'none' },
  { key: 'contact_number', label: 'Contact Number', icon: 'call-outline',    keyboardType: 'phone-pad', autoCapitalize: 'none' },
];

export default function PersonalInformationScreen() {
  const background        = useThemeColor({}, 'background');
  const backgroundElement = useThemeColor({}, 'backgroundElement');
  const card              = useThemeColor({}, 'card');
  const text              = useThemeColor({}, 'text');
  const textSecondary     = useThemeColor({}, 'textSecondary');
  const primary           = useThemeColor({}, 'primary');
  const border            = useThemeColor({}, 'border');

  const [user,         setUser]         = useState<User | null>(null);
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [fieldInput,   setFieldInput]   = useState('');
  const [saving,       setSaving]       = useState(false);

  useFocusEffect(
    useCallback(() => {
      SecureStore.getItemAsync('rider_user').then((json) => {
        if (json) setUser(JSON.parse(json));
      });
    }, []),
  );

  const startEdit = (field: EditableField, currentValue: string) => {
    setEditingField(field);
    setFieldInput(currentValue);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setFieldInput('');
  };

  const saveField = async () => {
    if (!editingField || !user) return;
    const value = sanitizeText(fieldInput).trim();
    if (!value) {
      Toast.show({ type: 'error', text1: 'Field cannot be empty.' });
      return;
    }
    setSaving(true);
    try {
      const res: any = await api.patch('/rider/profile/personal', { [editingField]: value });
      const updatedUser = { ...user, ...res };
      setUser(updatedUser);
      await SecureStore.setItemAsync('rider_user', JSON.stringify(updatedUser));
      setEditingField(null);
      Toast.show({ type: 'success', text1: 'Updated successfully!' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err?.message ?? 'Could not update. Try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: background }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color={text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: '700', color: text, flex: 1 }}>Personal Information</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
          <View style={{ backgroundColor: card, borderRadius: 12, borderWidth: 1, borderColor: border, overflow: 'hidden' }}>
            {FIELDS.map((field, index) => {
              const value = (user?.[field.key] as string) ?? '';
              const isEditing = editingField === field.key;

              return (
                <View key={field.key}>
                  {index > 0 && <View style={{ height: 1, backgroundColor: border }} />}
                  <View style={{ padding: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: isEditing ? 10 : 4 }}>
                      <Ionicons name={field.icon as any} size={16} color={textSecondary} style={{ marginRight: 8 }} />
                      <Text style={{ fontSize: 12, color: textSecondary, flex: 1 }}>{field.label}</Text>
                      {!isEditing && (
                        <TouchableOpacity onPress={() => startEdit(field.key, value)} style={{ padding: 4 }}>
                          <Ionicons name="pencil-outline" size={14} color={textSecondary} />
                        </TouchableOpacity>
                      )}
                    </View>

                    {!isEditing ? (
                      <Text style={{ fontSize: 15, color: text, marginLeft: 24 }}>{value || '—'}</Text>
                    ) : (
                      <View style={{ gap: 8 }}>
                        <TextInput
                          style={{ backgroundColor: backgroundElement, borderRadius: 8, borderWidth: 1, borderColor: border, padding: 10, color: text, fontSize: 15 }}
                          value={fieldInput}
                          onChangeText={setFieldInput}
                          autoFocus
                          autoCapitalize={field.autoCapitalize ?? 'sentences'}
                          autoCorrect={false}
                          keyboardType={field.keyboardType ?? 'default'}
                          maxLength={field.key === 'email' ? 255 : 100}
                        />
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity
                            style={{ flex: 1, borderRadius: 8, borderWidth: 1, borderColor: border, padding: 10, alignItems: 'center' }}
                            onPress={cancelEdit}
                            disabled={saving}
                          >
                            <Text style={{ color: textSecondary }}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{ flex: 1, borderRadius: 8, backgroundColor: primary, padding: 10, alignItems: 'center', opacity: saving ? 0.6 : 1 }}
                            onPress={saveField}
                            disabled={saving}
                          >
                            {saving
                              ? <ActivityIndicator color="#fff" size="small" />
                              : <Text style={{ color: '#fff', fontWeight: '600' }}>Save</Text>
                            }
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
