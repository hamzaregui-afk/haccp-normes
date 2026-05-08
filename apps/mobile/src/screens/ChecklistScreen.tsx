import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
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
import type { RootStackParamList } from '../navigation/RootNavigator';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CheckpointEntry {
  description: string;
  temperature: string;
  result: 'PASS' | 'FAIL' | null;
}

interface ControlTemplate {
  id: string;
  checkpoints: string[];
}

interface TemplateResponse {
  data: ControlTemplate;
}

interface ControlTask {
  id: string;
  title: string;
  templateId: string;
}

interface TaskResponse {
  data: ControlTask;
}

interface SubmitPayload {
  // ARCH-DECISION: 'COMPLETED' is the canonical status value per TaskStatusSchema.
  // The mobile screen previously sent 'DONE' which Zod rejected with a 400 error,
  // causing tasks to never be marked complete and the compliance KPI to stay at 0%.
  status: 'COMPLETED';
  completedAt: string;
  resultJson: {
    checkpoints: Array<{ description: string; temperature: string; result: string | null }>;
    completedAt: string;
  };
}

// ── CheckpointRow ─────────────────────────────────────────────────────────────

interface CheckpointRowProps {
  index: number;
  entry: CheckpointEntry;
  onChange: (index: number, patch: Partial<CheckpointEntry>) => void;
}

function CheckpointRow({ index, entry, onChange }: CheckpointRowProps) {
  return (
    <View style={styles.checkpointRow}>
      <Text style={styles.checkpointDesc}>{entry.description}</Text>
      <View style={styles.checkpointControls}>
        <TextInput
          style={styles.tempInput}
          placeholder="°C"
          placeholderTextColor="#9CA3AF"
          keyboardType="decimal-pad"
          value={entry.temperature}
          onChangeText={(v) => onChange(index, { temperature: v })}
        />
        <TouchableOpacity
          style={[styles.resultBtn, entry.result === 'PASS' && styles.resultBtnPass]}
          onPress={() => onChange(index, { result: entry.result === 'PASS' ? null : 'PASS' })}
          activeOpacity={0.8}
        >
          <Text style={[styles.resultBtnText, entry.result === 'PASS' && styles.resultBtnTextActive]}>
            ✓ OK
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.resultBtn, entry.result === 'FAIL' && styles.resultBtnFail]}
          onPress={() => onChange(index, { result: entry.result === 'FAIL' ? null : 'FAIL' })}
          activeOpacity={0.8}
        >
          <Text style={[styles.resultBtnText, entry.result === 'FAIL' && styles.resultBtnTextActive]}>
            ✗ NOK
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RootStackParamList, 'Checklist'>;

export function ChecklistScreen({ route, navigation }: Props) {
  const { taskId } = route.params;
  const [entries, setEntries] = useState<CheckpointEntry[]>([]);
  const [templateLoaded, setTemplateLoaded] = useState(false);
  const [showNCModal, setShowNCModal] = useState(false);

  // Fetch the task to get templateId
  const { data: task, isLoading: taskLoading, isError: taskError } = useQuery<ControlTask>({
    queryKey: ['task', taskId],
    queryFn: async () => {
      const res = await controlClient.get<TaskResponse>(`/api/v1/controls/tasks/${taskId}`);
      return res.data.data;
    },
  });

  // Fetch the template checkpoints once we have the task
  const { isLoading: tplLoading, isError: tplError } = useQuery<ControlTemplate>({
    queryKey: ['template', task?.templateId],
    enabled: !!task?.templateId && !templateLoaded,
    queryFn: async () => {
      const res = await controlClient.get<TemplateResponse>(
        `/api/v1/controls/templates/${task!.templateId}`,
      );
      const tpl = res.data.data;
      // Initialise entries from template checkpoints
      setEntries(
        tpl.checkpoints.map((desc) => ({ description: desc, temperature: '', result: null })),
      );
      setTemplateLoaded(true);
      return tpl;
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (payload: SubmitPayload) => {
      await controlClient.patch(`/api/v1/controls/tasks/${taskId}`, payload);
    },
    onSuccess: () => {
      const hasFailure = entries.some((e) => e.result === 'FAIL');
      if (hasFailure) {
        setShowNCModal(true);
      } else {
        Alert.alert('Succès', 'Contrôle soumis avec succès.', [
          { text: 'OK', onPress: () => navigation.navigate('Main') },
        ]);
      }
    },
    onError: () => {
      Alert.alert('Erreur', 'Impossible de soumettre le contrôle. Veuillez réessayer.');
    },
  });

  const handleEntryChange = (index: number, patch: Partial<CheckpointEntry>) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };

  const handleSubmit = () => {
    const incomplete = entries.some((e) => e.result === null);
    if (incomplete) {
      Alert.alert(
        'Incomplet',
        'Veuillez renseigner un résultat (OK/NOK) pour chaque point de contrôle.',
      );
      return;
    }
    const now = new Date().toISOString();
    submitMutation.mutate({
      status: 'COMPLETED',
      completedAt: now,
      resultJson: {
        checkpoints: entries.map((e) => ({
          description: e.description,
          temperature: e.temperature,
          result: e.result,
        })),
        completedAt: now,
      },
    });
  };

  const handleNCModalYes = () => {
    setShowNCModal(false);
    navigation.navigate('Main');
    // Navigate to NC tab — user can switch manually; deep-linking into tabs
    // from a stack screen requires root navigation ref which is out of scope.
    Alert.alert('Info', 'Accédez à l\'onglet "Non-conformités" pour créer un signalement.');
  };

  const handleNCModalNo = () => {
    setShowNCModal(false);
    Alert.alert('Succès', 'Contrôle soumis avec succès.', [
      { text: 'OK', onPress: () => navigation.navigate('Main') },
    ]);
  };

  const isLoading = taskLoading || tplLoading;
  const isError = taskError || tplError;

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2D6A4F" />
        <Text style={styles.loadingText}>Chargement du contrôle…</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Impossible de charger le contrôle.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>Points de contrôle</Text>
        {entries.map((entry, idx) => (
          <CheckpointRow
            key={idx}
            index={idx}
            entry={entry}
            onChange={handleEntryChange}
          />
        ))}

        <TouchableOpacity
          style={[styles.submitButton, submitMutation.isPending && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitMutation.isPending}
          activeOpacity={0.85}
        >
          {submitMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Soumettre le contrôle</Text>
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
            <Text style={styles.modalTitle}>⚠️ Points de contrôle échoués</Text>
            <Text style={styles.modalBody}>
              Des non-conformités ont été détectées. Voulez-vous créer un signalement ?
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnNo} onPress={handleNCModalNo}>
                <Text style={styles.modalBtnNoText}>Non</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnYes} onPress={handleNCModalYes}>
                <Text style={styles.modalBtnYesText}>Oui, créer</Text>
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
    backgroundColor: '#F5F5F0',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F0',
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
    color: '#1A3D2B',
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
    backgroundColor: '#2D6A4F',
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
    color: '#1A3D2B',
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
