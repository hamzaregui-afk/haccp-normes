import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { nonconformityClient, tenantClient } from '../api/client';
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

interface CreateNCPayload {
  description:      string;
  siteId:           string;
  severity:         NCSeverity;
  category:         NCCategory;
  correctiveAction?: string;
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

  // ── Load sites so the operator can pick one ────────────────────────────────
  const { data: sitesData } = useQuery<{ data: { data: Site[] } }>({
    queryKey: ['mobile-sites'],
    queryFn:  () => tenantClient.get('/api/v1/sites'),
    staleTime: 5 * 60_000,
    enabled: hasToken,
  });
  const sites: Site[] = sitesData?.data?.data ?? [];

  // ── Submit NC ─────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: async (payload: CreateNCPayload) => {
      await nonconformityClient.post('/api/v1/nonconformities', payload);
    },
    onSuccess: () => {
      Alert.alert(t('ncForm.successTitle'), t('ncForm.successMsg'), [
        {
          text: t('common.ok'),
          onPress: () => {
            setDescription('');
            setCorrectiveAction('');
            setSeverity('MEDIUM');
            setCategory('OTHER');
            setSiteId(null);
          },
        },
      ]);
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
    mutation.mutate({
      description:      description.trim(),
      siteId:           resolvedSiteId,
      severity,
      category,
      correctiveAction: correctiveAction.trim() || undefined,
    });
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
