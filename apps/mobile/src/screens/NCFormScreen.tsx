import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { onlineManager, useMutation, useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { tenantClient } from '../api/client';
import {
  MUTATION_KEYS,
  type NcCreateResult,
  type NcCreateVars,
} from '../lib/mutationKeys';
import { useAuthStore } from '../store/authStore';
import { useTranslation } from '@/i18n';
import type { MainTabParamList } from '../navigation/MainNavigator';

// ── Types ─────────────────────────────────────────────────────────────────────

type NCSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type NCCategory =
  | 'TEMPERATURE'
  | 'HYGIENE'
  | 'LABELING'
  | 'TRACEABILITY'
  | 'EQUIPMENT'
  | 'SUPPLIER'
  | 'PROCESS'
  | 'OTHER';

interface Site { id: string; name: string; }

// A photo picked locally, ready to be uploaded as multipart/form-data.
interface LocalPhoto { uri: string; name: string; type: string; }

const MAX_PHOTOS = 5;

// ARCH-DECISION: The backend NC-photo endpoint takes ONE file per request
// (POST /nonconformities/:id/photos, field "file"). We therefore upload photos
// sequentially AFTER the NC is created (we need its id). Photo failures are
// non-fatal — the NC already exists — so we count them and warn, never rollback.
function toLocalPhoto(asset: ImagePicker.ImagePickerAsset): LocalPhoto {
  const name = asset.fileName ?? asset.uri.split('/').pop() ?? `nc-photo-${Date.now()}.jpg`;
  return { uri: asset.uri, name, type: asset.mimeType ?? 'image/jpeg' };
}

// ── Severity config ───────────────────────────────────────────────────────────

const SEVERITY_OPTIONS: Array<{ value: NCSeverity; bg: string; text: string }> = [
  { value: 'LOW',      bg: '#D1FAE5', text: '#065F46' },
  { value: 'MEDIUM',   bg: '#FEF3C7', text: '#92400E' },
  { value: 'HIGH',     bg: '#FEE2E2', text: '#991B1B' },
  { value: 'CRITICAL', bg: '#7F1D1D', text: '#fff'    },
];

// ── Category config ───────────────────────────────────────────────────────────

const CATEGORY_VALUES: NCCategory[] = [
  'TEMPERATURE',
  'HYGIENE',
  'LABELING',
  'TRACEABILITY',
  'EQUIPMENT',
  'SUPPLIER',
  'PROCESS',
  'OTHER',
];

// ── Screen ────────────────────────────────────────────────────────────────────

type Props = BottomTabScreenProps<MainTabParamList, 'Non-conformités'>;

export function NCFormScreen(_props: Props) {
  const { t } = useTranslation();
  const hasToken = !!useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  // ARCH-DECISION: Explicit whitelist is safer than blacklist (role !== VIEWER).
  // SUPER_ADMIN can also create NCs in any tenant via cross-tenant JWT.
  const canSubmit = ['OPERATOR', 'ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'SUPER_ADMIN'].includes(user?.role ?? '');

  const [description,      setDescription]      = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [severity,         setSeverity]         = useState<NCSeverity>('MEDIUM');
  const [category,         setCategory]         = useState<NCCategory>('OTHER');
  const [siteId,           setSiteId]           = useState<string | null>(null);
  const [photos,           setPhotos]           = useState<LocalPhoto[]>([]);

  // ── Photo attachment ───────────────────────────────────────────────────────
  const addAssets = (assets: ImagePicker.ImagePickerAsset[]) => {
    setPhotos((prev) => {
      const room = MAX_PHOTOS - prev.length;
      return room <= 0 ? prev : [...prev, ...assets.slice(0, room).map(toLocalPhoto)];
    });
  };

  const takePhoto = async () => {
    if (photos.length >= MAX_PHOTOS) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('ncForm.permissionDenied'), t('ncForm.permissionCameraMsg'));
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!res.canceled) addAssets(res.assets);
  };

  const choosePhoto = async () => {
    if (photos.length >= MAX_PHOTOS) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('ncForm.permissionDenied'), t('ncForm.permissionLibraryMsg'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.6,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
    });
    if (!res.canceled) addAssets(res.assets);
  };

  const removePhoto = (uri: string) => setPhotos((prev) => prev.filter((p) => p.uri !== uri));

  // ── Load sites so the operator can pick one ────────────────────────────────
  const { data: sitesData } = useQuery<{ data: { data: Site[] } }>({
    queryKey: ['mobile-sites'],
    queryFn:  () => tenantClient.get('/api/v1/sites'),
    staleTime: 5 * 60_000,
    enabled: hasToken,
  });
  const sites: Site[] = sitesData?.data?.data ?? [];

  const resetForm = () => {
    setDescription('');
    setCorrectiveAction('');
    setSeverity('MEDIUM');
    setCategory('OTHER');
    setSiteId(null);
    setPhotos([]);
  };

  // ── Submit NC (+ optional photos) ──────────────────────────────────────────
  // ARCH-DECISION: The mutationFn lives in queryClient.ts registered under
  // MUTATION_KEYS.ncCreate, so a submission made offline is paused, persisted and
  // replayed on reconnect (even after an app restart). See lib/mutationKeys.ts.
  const mutation = useMutation<NcCreateResult, unknown, NcCreateVars>({
    mutationKey: MUTATION_KEYS.ncCreate,
    onSuccess: ({ photoFailures }) => {
      const partial = photoFailures > 0;
      Alert.alert(
        partial ? t('ncForm.photoPartialTitle') : t('ncForm.successTitle'),
        partial ? t('ncForm.photoPartialMsg') : t('ncForm.successMsg'),
        [{ text: t('common.ok'), onPress: resetForm }],
      );
    },
    onError: () => {
      Alert.alert(t('ncForm.errorTitle'), t('ncForm.errorMsg'));
    },
  });

  const handleSubmit = () => {
    if (!description.trim()) {
      Alert.alert(t('ncForm.requiredField'), t('ncForm.requiredDesc'));
      return;
    }
    const resolvedSiteId = siteId ?? sites[0]?.id;
    if (!resolvedSiteId) {
      Alert.alert(t('ncForm.requiredSite'), t('ncForm.noSiteMsg'));
      return;
    }
    const vars: NcCreateVars = {
      payload: {
        description:      description.trim(),
        siteId:           resolvedSiteId,
        severity,
        category,
        correctiveAction: correctiveAction.trim() || undefined,
      },
      photos,
    };
    mutation.mutate(vars);
    // Offline: the mutation is paused (not failed) — confirm it's queued and
    // reset the form now; it will replay automatically on reconnect.
    if (!onlineManager.isOnline()) {
      Alert.alert(t('offline.queuedTitle'), t('offline.queuedMsg'), [
        { text: t('common.ok'), onPress: resetForm },
      ]);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>{t('ncForm.pageTitle')}</Text>

      {/* Site selector */}
      {sites.length > 1 && (
        <>
          <Text style={styles.label}>{t('ncForm.site')}</Text>
          <View style={styles.categoryGrid}>
            {sites.map((s) => {
              const selected = (siteId ?? sites[0]?.id) === s.id;
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.categoryBtn, selected && styles.categoryBtnActive]}
                  onPress={() => setSiteId(s.id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.categoryBtnText, selected && styles.categoryBtnTextActive]}>
                    {s.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {/* Description */}
      <Text style={styles.label}>{t('ncForm.description')} *</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder={t('ncForm.descriptionHint')}
        placeholderTextColor="#9CA3AF"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
      />

      {/* Severity */}
      <Text style={styles.label}>{t('ncForm.severity')}</Text>
      <View style={styles.severityRow}>
        {SEVERITY_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.severityBtn,
              { backgroundColor: severity === opt.value ? opt.bg : '#F3F4F6' },
              severity === opt.value && styles.severityBtnActive,
            ]}
            onPress={() => setSeverity(opt.value)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.severityBtnText,
                { color: severity === opt.value ? opt.text : '#6B7280' },
              ]}
            >
              {t(`ncForm.severity_values.${opt.value}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Category */}
      <Text style={styles.label}>{t('ncForm.category')}</Text>
      <View style={styles.categoryGrid}>
        {CATEGORY_VALUES.map((cat) => {
          const selected = category === cat;
          return (
            <TouchableOpacity
              key={cat}
              style={[styles.categoryBtn, selected && styles.categoryBtnActive]}
              onPress={() => setCategory(cat)}
              activeOpacity={0.8}
            >
              <Text style={[styles.categoryBtnText, selected && styles.categoryBtnTextActive]}>
                {t(`ncForm.category_values.${cat}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Corrective action (optional) */}
      <Text style={styles.label}>{t('ncForm.correctiveAction')}</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder={t('ncForm.correctiveHint')}
        placeholderTextColor="#9CA3AF"
        value={correctiveAction}
        onChangeText={setCorrectiveAction}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
      />

      {/* Photos */}
      <Text style={styles.label}>{t('ncForm.photos')}</Text>
      <View style={styles.photoRow}>
        {photos.map((p) => (
          <View key={p.uri} style={styles.thumbWrap}>
            <Image source={{ uri: p.uri }} style={styles.thumb} />
            <TouchableOpacity
              style={styles.thumbRemove}
              onPress={() => removePhoto(p.uri)}
              activeOpacity={0.8}
              accessibilityLabel={t('ncForm.removePhoto')}
            >
              <Text style={styles.thumbRemoveText}>×</Text>
            </TouchableOpacity>
          </View>
        ))}
        {photos.length < MAX_PHOTOS && (
          <>
            <TouchableOpacity style={styles.photoAddBtn} onPress={takePhoto} activeOpacity={0.8}>
              <Text style={styles.photoAddIcon}>📷</Text>
              <Text style={styles.photoAddText}>{t('ncForm.takePhoto')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoAddBtn} onPress={choosePhoto} activeOpacity={0.8}>
              <Text style={styles.photoAddIcon}>🖼️</Text>
              <Text style={styles.photoAddText}>{t('ncForm.choosePhoto')}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Submit */}
      {!canSubmit && (
        <View style={styles.readOnlyBanner}>
          <Text style={styles.readOnlyText}>{t('ncForm.viewerReadOnly')}</Text>
        </View>
      )}
      <TouchableOpacity
        style={[styles.submitBtn, (mutation.isPending || !canSubmit) && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={mutation.isPending || !canSubmit}
        activeOpacity={0.85}
      >
        {mutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitBtnText}>{t('ncForm.submit')}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

NCFormScreen.displayName = 'NCFormScreen';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F0',
  },
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A3D2B',
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#1a1a1a',
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  textArea: {
    height: 100,
    paddingTop: 11,
  },
  severityRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  severityBtn: {
    flex: 1,
    minWidth: 70,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  severityBtnActive: {
    borderColor: 'rgba(0,0,0,0.1)',
  },
  severityBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  categoryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#fff',
  },
  categoryBtnActive: {
    backgroundColor: '#1A3D2B',
    borderColor: '#1A3D2B',
  },
  categoryBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  categoryBtnTextActive: {
    color: '#fff',
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  thumbWrap: {
    width: 72,
    height: 72,
    borderRadius: 8,
    position: 'relative',
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
  },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#991B1B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRemoveText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 18,
  },
  photoAddBtn: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderStyle: 'dashed',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  photoAddIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  photoAddText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
  },
  submitBtn: {
    backgroundColor: '#B5833A',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.65,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  readOnlyBanner: {
    backgroundColor: '#FEF3C7',
    borderLeftWidth: 4,
    borderLeftColor: '#B5833A',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  readOnlyText: {
    fontSize: 13,
    color: '#92400E',
    fontWeight: '500',
  },
});
