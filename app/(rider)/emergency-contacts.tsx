import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import Toast from 'react-native-toast-message';
import { useThemeColor } from '@/hooks/use-theme-color';
import {
  getContacts,
  upsertContact,
  setContactActive,
  deleteContact,
} from '@/lib/local-db';
import { api } from '@/lib/api-client';
import type { LocalEmergencyContact } from '@/types';
import { styles } from '@/styles/emergency-contacts.style';

type AddModalData = { name: string; relationship: string; contact_number: string };

function normalizePhilippineNumber(raw: string): string {
  // Strip everything except digits and a leading +
  const stripped = raw.replace(/[^\d+]/g, '');

  if (stripped.startsWith('+63')) return stripped;           // +639XXXXXXXXX  ✓
  if (stripped.startsWith('63'))  return '+' + stripped;     // 639XXXXXXXXX   → +639XXXXXXXXX
  if (stripped.startsWith('0'))   return '+63' + stripped.slice(1); // 09XXXXXXXXX → +639XXXXXXXXX
  if (/^9\d{9}$/.test(stripped))  return '+63' + stripped;  // 9XXXXXXXXX (10 digits) → +639XXXXXXXXX

  return stripped || raw.trim(); // fallback — return cleaned string
}

export default function EmergencyContactsScreen() {
  const background = useThemeColor({}, 'background');
  const card = useThemeColor({}, 'card');
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const primary = useThemeColor({}, 'primary');
  const actionBg = useThemeColor({}, 'actionBg');
  const actionText = useThemeColor({}, 'actionText');
  const danger = useThemeColor({}, 'danger');
  const border = useThemeColor({}, 'border');
  const backgroundElement = useThemeColor({}, 'backgroundElement');

  const [contacts, setContacts] = useState<LocalEmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<AddModalData>({ name: '', relationship: '', contact_number: '' });
  const [saving, setSaving] = useState(false);

  // Contact picker state
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [phoneContacts, setPhoneContacts] = useState<Contacts.Contact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);

  const loadContacts = useCallback(async () => {
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

  const openContactPicker = async () => {
    setLoadingContacts(true);
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      Toast.show({ type: 'error', text1: 'Contacts permission denied' });
      setLoadingContacts(false);
      return;
    }
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
      sort: Contacts.SortTypes.FirstName,
    });
    setPhoneContacts(data.filter((c) => c.name && c.phoneNumbers?.length));
    setLoadingContacts(false);
    setShowAddModal(false);
    setShowContactPicker(true);
  };

  const selectPhoneContact = (contact: Contacts.Contact) => {
    const raw = contact.phoneNumbers?.[0]?.number ?? '';
    setAddForm({
      name: contact.name ?? '',
      relationship: '',
      contact_number: normalizePhilippineNumber(raw),
    });
    setContactSearch('');
    setShowContactPicker(false);
    setShowAddModal(true);
  };

  const handleSaveContact = async () => {
    if (!addForm.name.trim() || !addForm.contact_number.trim()) {
      Toast.show({ type: 'error', text1: 'Name and phone number are required' });
      return;
    }
    setSaving(true);
    Toast.show({ type: 'info', text1: 'Saving contact...' });
    try {
      const response: any = await api.post('/rider/emergency-contacts', {
        name: addForm.name.trim(),
        relationship: addForm.relationship.trim() || undefined,
        contact_number: normalizePhilippineNumber(addForm.contact_number),
      });

      await upsertContact({
        id: response.contact.id,
        name: response.contact.name,
        relationship: response.contact.relationship,
        contact_number: response.contact.contact_number,
        is_active: true,
      });

      const updated = await getContacts();
      setContacts(updated);
      setShowAddModal(false);
      setAddForm({ name: '', relationship: '', contact_number: '' });
      Toast.show({ type: 'success', text1: 'Contact added!' });
    } catch {
      Toast.show({ type: 'error', text1: 'Could not save contact' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (contact: LocalEmergencyContact) => {
    await setContactActive(contact.id, !contact.is_active);
    setContacts((prev) =>
      prev.map((c) => (c.id === contact.id ? { ...c, is_active: !c.is_active } : c)),
    );
  };

  const handleDelete = async (contact: LocalEmergencyContact) => {
    Toast.show({ type: 'info', text1: 'Deleting...' });
    try {
      await api.delete(`/rider/emergency-contacts/${contact.id}`);
      await deleteContact(contact.id);
      setContacts((prev) => prev.filter((c) => c.id !== contact.id));
      Toast.show({ type: 'success', text1: 'Contact removed' });
    } catch {
      Toast.show({ type: 'error', text1: 'Could not delete' });
    }
  };

  const filteredPhoneContacts = phoneContacts.filter((c) => {
    const q = contactSearch.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.phoneNumbers?.[0]?.number?.includes(q)
    );
  });

  const renderItem = ({ item }: { item: LocalEmergencyContact }) => (
    <View style={[styles.contactCard, { backgroundColor: card, borderColor: border }]}>
      <View style={[styles.contactAvatar, { backgroundColor: backgroundElement }]}>
        <Text style={[styles.contactInitial, { color: text }]}>
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
      {/* Header — single "+" button */}
      <View style={[styles.header, { borderBottomColor: border }]}>
        <Text style={[styles.headerTitle, { color: text }]}>Emergency Contacts</Text>
        <TouchableOpacity onPress={() => setShowAddModal(true)} style={styles.headerBtn}>
          <Ionicons name="add-circle-outline" size={22} color={primary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.infoBar, { backgroundColor: backgroundElement }]}>
        <Ionicons name="information-circle-outline" size={14} color={textSecondary} />
        <Text style={[styles.infoText, { color: textSecondary }]}>
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
              style={[styles.emptyBtn, { backgroundColor: actionBg }]}
              onPress={() => setShowAddModal(true)}
            >
              <Text style={[styles.emptyBtnText, { color: actionText }]}>Add Contact</Text>
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

              {/* Import from Contacts button */}
              <TouchableOpacity
                style={[styles.importBtn, { borderColor: primary }]}
                onPress={openContactPicker}
                disabled={loadingContacts}
              >
                {loadingContacts ? (
                  <ActivityIndicator size="small" color={primary} />
                ) : (
                  <>
                    <Ionicons name="people-outline" size={16} color={primary} />
                    <Text style={[styles.importBtnText, { color: primary }]}>Import from Contacts</Text>
                  </>
                )}
              </TouchableOpacity>

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
                  style={[styles.modalSaveBtn, { backgroundColor: actionBg }, saving && { opacity: 0.7 }]}
                  onPress={handleSaveContact}
                  disabled={saving}
                >
                  <Text style={[styles.modalSaveText, { color: actionText }]}>{saving ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Contact Picker Modal */}
      <Modal
        visible={showContactPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowContactPicker(false)}
      >
        <View style={[styles.pickerModal]}>
          <View style={[styles.pickerSheet, { backgroundColor: background }]}>
            {/* Header */}
            <View style={[styles.pickerHeader, { borderBottomColor: border }]}>
              <Text style={[styles.pickerTitle, { color: text }]}>Select Contact</Text>
              <TouchableOpacity
                style={styles.pickerCloseBtn}
                onPress={() => { setShowContactPicker(false); setShowAddModal(true); }}
              >
                <Ionicons name="close" size={22} color={textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Search bar */}
            <TextInput
              style={[styles.pickerSearch, { backgroundColor: backgroundElement, color: text, borderColor: border }]}
              value={contactSearch}
              onChangeText={setContactSearch}
              placeholder="Search by name or number..."
              placeholderTextColor={textSecondary}
              autoFocus
              clearButtonMode="while-editing"
            />

            {/* Contact list */}
            <FlatList
              data={filteredPhoneContacts}
              keyExtractor={(item) => item.id ?? item.name ?? String(Math.random())}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerRow, { borderBottomColor: border }]}
                  onPress={() => selectPhoneContact(item)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.pickerAvatar, { backgroundColor: backgroundElement }]}>
                    <Text style={[styles.pickerInitial, { color: primary }]}>
                      {item.name?.[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                  <View style={styles.pickerInfo}>
                    <Text style={[styles.pickerName, { color: text }]} numberOfLines={1}>{item.name}</Text>
                    <Text style={[styles.pickerPhone, { color: textSecondary }]}>
                      {item.phoneNumbers?.[0]?.number ?? ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={textSecondary} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.pickerEmpty}>
                  <Ionicons name="person-outline" size={40} color={textSecondary} />
                  <Text style={[styles.pickerEmptyText, { color: textSecondary }]}>
                    {contactSearch ? 'No contacts match your search' : 'No contacts with phone numbers found'}
                  </Text>
                </View>
              }
              keyboardShouldPersistTaps="handled"
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
