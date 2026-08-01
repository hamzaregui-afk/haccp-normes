import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { onlineManager, useQuery, useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { controlClient } from '../api/client';
import { MUTATION_KEYS, type ControlSubmitVars } from '../lib/mutationKeys';
import { useAuthStore } from '../store/authStore';
import { useTranslation } from '@/i18n';
import type { RootStackParamList } from '../navigation/RootNavigator';

// ── Types ─────────────────────────────────────────────────────────────────────

// ARCH-DECISION: CheckpointType mirrors TaskResultItemSchema.type in
// control-service exactly. The checklist is stored server-side as
// `checklistJson: ChecklistItem[]` — NOT a `checkpoints: string[]` array. The
// screen previously read a non-existent `checkpoints` field and called `.map()`
// on `undefined`, which threw inside the queryFn and surfaced as
// "Impossible de charger le contrôle." on every control.
type CheckpointType =
  | 'BOOLEAN' | 'NUMBER' | 'TEXT' | 'TEMPERATURE'
  | 'PHOTO' | 'SIGNATURE' | 'DATE' | 'SELECT';

const VALID_CHECKPOINT_TYPES: readonly CheckpointType[] = [
  'BOOLEAN', 'NUMBER', 'TEXT', 'TEMPERATURE', 'PHOTO', 'SIGNATURE', 'DATE', 'SELECT',
];

interface ChecklistItem {
  id: string;
  label: string;
  type: CheckpointType;
  unit?: string;
  min?: number;
  max?: number;
  required: boolean;
}

interface CheckpointEntry {
  id: string;
  description: string;   // = ChecklistItem.label — shown in CheckpointRow
  type: CheckpointType;
  unit?: string;
  min?: number;
  max?: number;
  required: boolean;
  temperature: string;
  result: 'PASS' | 'FAIL' | null;
}

interface ControlTaskDetail {
  id: string;
  templateId: string;
  // findOneTask includes the frozen snapshot AND the live template's checklistJson.
  // Read order mirrors the web ChecklistExecutionModal: snapshot first, template fallback.
  checklistSnapshot?: unknown;
  template?: { id: string; name: string; checklistJson?: unknown };
}

interface TaskResponse {
  data: ControlTaskDetail;
}

// Pure parser — tolerates any raw JSON shape and never throws (mirrors the web
// ChecklistEditorPage parsing). A malformed/empty checklist yields [] rather than
// crashing the screen.
function parseChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry, i) => {
    const r = (entry ?? {}) as Record<string, unknown>;
    const label =
      typeof r['label'] === 'string'
        ? r['label']
        : typeof r['description'] === 'string'
          ? r['description']
          : '';
    return {
      id:       typeof r['id'] === 'string' ? r['id'] : `item-${i}`,
      label,
      type:     VALID_CHECKPOINT_TYPES.includes(r['type'] as CheckpointType)
        ? (r['type'] as CheckpointType)
        : 'TEXT',
      unit:     typeof r['unit'] === 'string' ? r['unit'] : undefined,
      min:      typeof r['min'] === 'number' ? r['min'] : undefined,
      max:      typeof r['max'] === 'number' ? r['max'] : undefined,
      required: r['required'] !== false,
    };
  });
}

// ── CheckpointRow ─────────────────────────────────────────────────────────────

interface CheckpointRowProps {
  index: number;
  entry: CheckpointEntry;
  onChange: (index: number, patch: Partial<CheckpointEntry>) => void;
  readOnly?: boolean;
}

function CheckpointRow({ index, entry, onChange, readOnly = false }: CheckpointRowProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.checkpointRow}>
      <Text style={styles.checkpointDesc}>{entry.description}</Text>
      <View style={styles.checkpointControls}>
        <TextInput
          style={[styles.tempInput, readOnly && styles.tempInputReadOnly]}
          placeholder="°C"
          placeholderTextColor="#9CA3AF"
          keyboardType="decimal-pad"
          value={entry.temperature}
          onChangeText={(v) => { if (!readOnly) onChange(index, { temperature: v }); }}
          editable={!readOnly}
        />
        <TouchableOpacity
          style={[styles.resultBtn, entry.result === 'PASS' && styles.resultBtnPass, readOnly && styles.resultBtnReadOnly]}
          onPress={() => { if (!readOnly) onChange(index, { result: entry.result === 'PASS' ? null : 'PASS' }); }}
          activeOpacity={readOnly ? 1 : 0.8}
          disabled={readOnly}
        >
          <Text style={[styles.resultBtnText, entry.result === 'PASS' && styles.resultBtnTextActive]}>
            {t('checklist.ok')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.resultBtn, entry.result === 'FAIL' && styles.resultBtnFail, readOnly && styles.resultBtnReadOnly]}
          onPress={() => { if (!readOnly) onChange(index, { result: entry.result === 'FAIL' ? null : 'FAIL' }); }}
          activeOpacity={readOnly ? 1 : 0.8}
          disabled={readOnly}
        >
          <Text style={[styles.resultBtnText, entry.result === 'FAIL' && styles.resultBtnTextActive]}>
            {t('checklist.nok')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RootStackParamList, 'Checklist'>;

export function ChecklistScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const canExecute = ['OPERATOR', 'ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(user?.role ?? '');
  const { taskId } = route.params;
  const [entries, setEntries] = useState<CheckpointEntry[]>([]);
  const [initialised, setInitialised] = useState(false);
  const [showNCModal, setShowNCModal] = useState(false);

  // ARCH-DECISION: a single request. GET /controls/tasks/:id already includes the
  // frozen `checklistSnapshot` AND the live `template.checklistJson`, so no separate
  // template fetch is needed (mirrors the web ChecklistExecutionModal). This also
  // removes the second request that previously read a non-existent field and 403/500'd.
  const { data: task, isLoading, isError } = useQuery<ControlTaskDetail>({
    queryKey: ['task', taskId],
    queryFn: async () => {
      const res = await controlClient.get<TaskResponse>(`/api/v1/controls/tasks/${taskId}`);
      return res.data.data;
    },
  });

  // Initialise checkpoint entries once, from the task's checklist (snapshot first,
  // live template as fallback). parseChecklist never throws on a malformed shape.
  useEffect(() => {
    if (!task || initialised) return;
    const checklist = parseChecklist(task.checklistSnapshot ?? task.template?.checklistJson);
    setEntries(
      checklist.map((it) => ({
        id:          it.id,
        description: it.label,
        type:        it.type,
        unit:        it.unit,
        min:         it.min,
        max:         it.max,
        required:    it.required,
        temperature: '',
        result:      null,
      })),
    );
    setInitialised(true);
  }, [task, initialised]);

  // ARCH-DECISION: mutationFn registered in queryClient.ts under
  // MUTATION_KEYS.controlSubmit so a completion done offline is paused,
  // persisted and replayed on reconnect. See lib/mutationKeys.ts.
  const submitMutation = useMutation<void, unknown, ControlSubmitVars>({
    mutationKey: MUTATION_KEYS.controlSubmit,
    onSuccess: () => {
      const hasFailure = entries.some((e) => e.result === 'FAIL');
      if (hasFailure) {
        setShowNCModal(true);
      } else {
        Alert.alert(t('checklist.successTitle'), t('checklist.successMsg'), [
          { text: t('common.ok'), onPress: () => navigation.navigate('Main') },
        ]);
      }
    },
    onError: () => {
      Alert.alert(t('checklist.errorTitle'), t('checklist.errorMsg'));
    },
  });

  const handleEntryChange = (index: number, patch: Partial<CheckpointEntry>) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };

  const handleSubmit = () => {
    const incomplete = entries.some((e) => e.result === null);
    if (incomplete) {
      Alert.alert(t('checklist.incompleteTitle'), t('checklist.incompleteMsg'));
      return;
    }
    const now = new Date().toISOString();
    // ARCH-DECISION: resultJson MUST satisfy the backend TaskResultSchema
    // ({ submittedAt, submittedBy, overallCompliant, items[] }). The screen
    // previously sent { checkpoints, completedAt }, which Zod rejected with 400 —
    // completions silently failed. overallCompliant = every REQUIRED item passed
    // (matches the web execution modal); it drives the backend's auto-NC event.
    const overallCompliant = entries.filter((e) => e.required).every((e) => e.result === 'PASS');
    submitMutation.mutate({
      taskId,
      payload: {
        // 'COMPLETED' is the canonical status per TaskStatusSchema.
        status: 'COMPLETED',
        completedAt: now,
        resultJson: {
          submittedAt:      now,
          submittedBy:      user?.sub ?? '',
          overallCompliant,
          items: entries.map((e) => ({
            id:           e.id,
            label:        e.description,
            type:         e.type,
            // PASS → true / FAIL → false / unanswered → null (schema allows null).
            value:        e.result === null ? null : e.result === 'PASS',
            unit:         e.unit,
            min:          e.min,
            max:          e.max,
            compliant:    e.result === 'PASS',
            required:     e.required,
            measuredTemp: e.temperature || undefined,
          })),
        },
      },
    });
    // Offline: the completion is queued (paused) and will replay on reconnect —
    // confirm and return to the agenda rather than waiting for a server response.
    if (!onlineManager.isOnline()) {
      Alert.alert(t('offline.queuedTitle'), t('offline.queuedMsg'), [
        { text: t('common.ok'), onPress: () => navigation.navigate('Main') },
      ]);
    }
  };

  const handleNCModalYes = () => {
    setShowNCModal(false);
    navigation.navigate('Main');
    // Navigate to NC tab — user can switch manually; deep-linking into tabs
    // from a stack screen requires root navigation ref which is out of scope.
    Alert.alert(t('checklist.ncInfo'), t('checklist.ncInfoMsg'));
  };

  const handleNCModalNo = () => {
    setShowNCModal(false);
    Alert.alert(t('checklist.successTitle'), t('checklist.successMsg'), [
      { text: t('common.ok'), onPress: () => navigation.navigate('Main') },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#5AA4C8" />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t('checklist.loadErrorMsg')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>{t('checklist.checkpoints')}</Text>
        {!canExecute && (
          <View style={styles.readOnlyBanner}>
            <Text style={styles.readOnlyText}>{t('checklist.viewerReadOnly')}</Text>
          </View>
        )}
        {entries.map((entry, idx) => (
          <CheckpointRow
            key={idx}
            index={idx}
            entry={entry}
            onChange={handleEntryChange}
            readOnly={!canExecute}
          />
        ))}

        <TouchableOpacity
          style={[styles.submitButton, (submitMutation.isPending || !canExecute) && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitMutation.isPending || !canExecute}
          activeOpacity={0.85}
        >
          {submitMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>{t('checklist.submit')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* NC creation modal */}
      <Modal
        visible={showNCModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNCModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('checklist.ncModalTitle')}</Text>
            <Text style={styles.modalBody}>{t('checklist.ncModalBody')}</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnNo} onPress={handleNCModalNo}>
                <Text style={styles.modalBtnNoText}>{t('checklist.ncModalNo')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnYes} onPress={handleNCModalYes}>
                <Text style={styles.modalBtnYesText}>{t('checklist.ncModalYes')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

ChecklistScreen.displayName = 'ChecklistScreen';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F0F0',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    color: '#6B7280',
    fontSize: 14,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 15,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0A0F3F',
    marginBottom: 12,
  },
  checkpointRow: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  checkpointDesc: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 10,
    fontWeight: '500',
  },
  checkpointControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tempInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    width: 70,
    fontSize: 14,
    color: '#1a1a1a',
    backgroundColor: '#FAFAFA',
  },
  resultBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  resultBtnPass: {
    backgroundColor: '#D1FAE5',
    borderColor: '#059669',
  },
  resultBtnFail: {
    backgroundColor: '#FEE2E2',
    borderColor: '#DC2626',
  },
  resultBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  resultBtnTextActive: {
    color: '#1a1a1a',
  },
  submitButton: {
    backgroundColor: '#5AA4C8',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 20,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
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
  tempInputReadOnly: {
    backgroundColor: '#F3F4F6',
    color: '#9CA3AF',
  },
  resultBtnReadOnly: {
    opacity: 0.55,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 380,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0A0F3F',
    marginBottom: 10,
  },
  modalBody: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 20,
    lineHeight: 21,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtnNo: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
  },
  modalBtnNoText: {
    color: '#6B7280',
    fontWeight: '600',
    fontSize: 15,
  },
  modalBtnYes: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#B5833A',
    alignItems: 'center',
  },
  modalBtnYesText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
