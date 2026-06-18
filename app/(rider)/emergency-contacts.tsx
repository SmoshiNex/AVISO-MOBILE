import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Switch,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { toast } from 'sonner-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import {
  getContacts,
  upsertContact,
  setContactActive,
  deleteContact,
} from '@/lib/local-db';
import { api } from '@/lib/api-client';
import { Spacing, Radius } from '@/constants/theme';
import type { LocalEmergencyContact } from '@/types';

type AddModalData = { name: string; relationship: string; contact_number: string };

export default function EmergencyContactsScreen() {
  const background = useThemeColor({}, 'background');
  const card = useThemeColor({}, 'card');
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const primary = useThemeColor({}, 'primary');
  const danger = useThemeColor({}, 'danger');
  const border = useThemeColor({}, 'border');
  const backgroundElement = useThemeColor({}, 'backgroundElement');

  const [contacts, setContacts] = useState<LocalEmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<AddModalData>({ name: '', relationship: '', contact_number: '' });
  const [saving, setSaving] = useState(false);

  const loadContacts = useCallback(async () => {
    // Fetch from backend and upsert into SQLite
    try {
      const remote: any[] = await api.get('/rider/emergency-contacts');
      for (const c of remote) {
        await upsertContact({
          id: c.id,
          name: c.name,
          relationship: c.relationship ?? '',
          contact_number: c.contact_number,
          is_active: true,
        });
      }
    } catch {
      // Offline — use local cache
    }

    const local = await getContacts();
    setContacts(local);
  }, []);

  useEffect(() => {
    loadContacts().finally(() => setLoading(false));
  }, [loadContacts]);

  const handlePickFromContacts = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      toast.error('Contacts permission denied');
      return;
    }

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
    });

    if (!data.length) {
      toast.error('No contacts found on device');
      return;
    }

    // Just pre-fill the add modal with the first phone number found
    // A production UX would show a picker — for now we open the manual form pre-filled
    const picked = data[0];
    const phone = picked.phoneNumbers?.[0]?.number ?? '';
    setAddForm({
      name: picked.name ?? '',
      relationship: '',
      contact_number: phone,
    });
    setShowAddModal(true);
  };

  const handleSaveContact = async () => {
    if (!addForm.name.trim() || !addForm.contact_number.trim()) {
      toast.error('Name and phone number are required');
      return;
    }
    setSaving(true);

    toast.promise(
      (async () => {
        const response: any = await api.post('/rider/emergency-contacts', {
          name: addForm.name.trim(),
          relationship: addForm.relationship.trim() || undefined,
          contact_number: addForm.contact_number.trim(),
        });

        await upsertContact({
          id: response.id,
          name: response.name,
          relationship: response.relationship,
          contact_number: response.contact_number,
          is_active: true,
        });

        const updated = await getContacts();
        setContacts(updated);
        setShowAddModal(false);
        setAddForm({ name: '', relationship: '', contact_number: '' });
      })(),
      {
        loading: 'Saving contact...',
        success: 'Contact added!',
        error: 'Could not save contact',
      },
    );
    setSaving(false);
  };

  const handleToggleActive = async (contact: LocalEmergencyContact) => {
    await setContactActive(contact.id, !contact.is_active);
    setContacts((prev) =>
      prev.map((c) => (c.id === contact.id ? { ...c, is_active: !c.is_active } : c)),
    );
  };

  const handleDelete = async (contact: LocalEmergencyContact) => {
    toast.promise(
      (async () => {
        await api.delete(`/rider/emergency-contacts/${contact.id}`);
        await deleteContact(contact.id);
        setContacts((prev) => prev.filter((c) => c.id !== contact.id));
      })(),
      {
        loading: 'Deleting...',
        success: 'Contact removed',
        error: 'Could not delete',
      },
    );
  };

  const renderItem = ({ item }: { item: LocalEmergencyContact }) => (
    <View style={[styles.contactCard, { backgroundColor: card, borderColor: border }]}>
      <View style={[styles.contactAvatar, { backgroundColor: primary + '22' }]}>
        <Text style={[styles.contactInitial, { color: primary }]}>
          {item.name[0]?.toUpperCase() ?? '?'}
        </Text>
      </View>
      <View style={styles.contactInfo}>
        <Text style={[styles.contactName, { color: text }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.contactPhone, { color: textSecondary }]}>{item.contact_number}</Text>
        {item.relationship ? (
          <Text style={[styles.contactRel, { color: textSecondary }]}>{item.relationship}</Text>
        ) : null}
      </View>
      <View style={styles.contactActions}>
        <Switch
          value={item.is_active}
          onValueChange={() => handleToggleActive(item)}
          trackColor={{ true: primary, false: '#D1D5DB' }}
          thumbColor="#fff"
          style={{ transform: [{ scale: 0.85 }] }}
        />
        <TouchableOpacity
          onPress={() => handleDelete(item)}
          style={styles.deleteBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="trash-outline" size={18} color={danger} />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: background }]}>
        <ActivityIndicator color={primary} />
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: border }]}>
        <Text style={[styles.headerTitle, { color: text }]}>Emergency Contacts</Text>
        <View style={styles.headerBtns}>
          <TouchableOpacity onPress={handlePickFromContacts} style={styles.headerBtn}>
            <Ionicons name="person-add-outline" size={22} color={primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowAddModal(true)} style={styles.headerBtn}>
            <Ionicons name="add-circle-outline" size={22} color={primary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.infoBar, { backgroundColor: primary + '15' }]}>
        <Ionicons name="information-circle-outline" size={14} color={primary} />
        <Text style={[styles.infoText, { color: primary }]}>
          Toggle to enable/disable SMS for each contact
        </Text>
      </View>

      <FlatList
        data={contacts}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          <View style={[styles.empty, { backgroundColor: backgroundElement }]}>
            <Ionicons name="people-outline" size={48} color={textSecondary} />
            <Text style={[styles.emptyTitle, { color: text }]}>No emergency contacts</Text>
            <Text style={[styles.emptySubtitle, { color: textSecondary }]}>
              Add contacts to receive SOS SMS when you're in an accident
            </Text>
            <TouchableOpacity
              style={[styles.emptyBtn, { backgroundColor: primary }]}
              onPress={() => setShowAddModal(true)}
            >
              <Text style={styles.emptyBtnText}>Add Contact</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Add Contact Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalSheet, { backgroundColor: card }]}>
              <View style={styles.modalHandle} />
              <Text style={[styles.modalTitle, { color: text }]}>Add Emergency Contact</Text>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: textSecondary }]}>Full Name *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: backgroundElement, color: text, borderColor: border }]}
                  value={addForm.name}
                  onChangeText={(v) => setAddForm((f) => ({ ...f, name: v }))}
                  placeholder="e.g. Maria Santos"
                  placeholderTextColor={textSecondary}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: textSecondary }]}>Relationship</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: backgroundElement, color: text, borderColor: border }]}
                  value={addForm.relationship}
                  onChangeText={(v) => setAddForm((f) => ({ ...f, relationship: v }))}
                  placeholder="e.g. Mother, Spouse, Friend"
                  placeholderTextColor={textSecondary}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: textSecondary }]}>Phone Number *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: backgroundElement, color: text, borderColor: border }]}
                  value={addForm.contact_number}
                  onChangeText={(v) => setAddForm((f) => ({ ...f, contact_number: v }))}
                  placeholder="+63 9XX XXX XXXX"
                  placeholderTextColor={textSecondary}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalCancelBtn, { borderColor: border }]}
                  onPress={() => { setShowAddModal(false); setAddForm({ name: '', relationship: '', contact_number: '' }); }}
                >
                  <Text style={[styles.modalCancelText, { color: textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSaveBtn, { backgroundColor: primary }, saving && { opacity: 0.7 }]}
                  onPress={handleSaveContact}
                  disabled={saving}
                >
                  <Text style={styles.modalSaveText}>{saving ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  headerBtns: { flexDirection: 'row', gap: 4 },
  headerBtn: { padding: 4, minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  infoText: { fontSize: 12 },
  listContent: { padding: Spacing.md, paddingBottom: 100 },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    gap: 12,
  },
  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactInitial: { fontSize: 18, fontWeight: '700' },
  contactInfo: { flex: 1, gap: 2 },
  contactName: { fontSize: 15, fontWeight: '600' },
  contactPhone: { fontSize: 13 },
  contactRel: { fontSize: 12 },
  contactActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteBtn: { padding: 4 },
  empty: {
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptySubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    borderRadius: Radius.md,
    height: 44,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.lg,
    paddingBottom: 40,
    gap: 16,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 4,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  inputGroup: { gap: 6 },
  inputLabel: { fontSize: 13, fontWeight: '600' },
  input: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 44,
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  modalCancelBtn: {
    flex: 1,
    borderRadius: Radius.md,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  modalCancelText: { fontWeight: '600', fontSize: 15 },
  modalSaveBtn: {
    flex: 1,
    borderRadius: Radius.md,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
