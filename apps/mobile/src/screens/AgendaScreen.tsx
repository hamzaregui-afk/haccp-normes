import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { controlClient } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useTranslation } from '@/i18n';
import type { MainTabParamList } from '../navigation/MainNavigator';
import type { RootStackParamList } from '../navigation/RootNavigator';

// ── Types ────────────────────────────────────────────────────────────────────

// ARCH-DECISION: TaskStatus mirrors TaskStatusSchema in control-service exactly.
// The original screen used PENDING/DONE/FAILED which don't exist on the backend —
// queries returned empty results and canStart was always false.
type TaskStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED';

interface ControlTask {
  id: string;
  // backend returns template.name via include — no top-level `title` field
  template: { id: string; name: string };
  scheduledAt: string;   // was scheduledDate — matches Prisma field name
  status: TaskStatus;
  templateId: string;
  // scheduleId is non-null for auto-generated tasks from a ControlSchedule
  scheduleId?: string | null;
}

interface TasksResponse {
  data: ControlTask[];
}

// ── Status badge styles ───────────────────────────────────────────────────────

const STATUS_COLORS: Record<TaskStatus, { bg: string; text: string }> = {
  PLANNED:     { bg: '#E5E7EB', text: '#374151' },
  IN_PROGRESS: { bg: '#DBEAFE', text: '#1D4ED8' },
  COMPLETED:   { bg: '#D1FAE5', text: '#065F46' },
  OVERDUE:     { bg: '#FEE2E2', text: '#991B1B' },
  CANCELLED:   { bg: '#F3F4F6', text: '#6B7280' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string, locale: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

function dateISO(d: Date): string {
  return d.toISOString().split('T')[0] as string;
}

function formatFullDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { weekday: 'long', day: '2-digit', month: 'long' });
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// ── TaskCard ──────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: ControlTask;
  onStart: (taskId: string, taskTitle: string) => void;
  starting: boolean;
}

function TaskCard({ task, onStart, starting }: TaskCardProps) {
  const { t, lang } = useTranslation();

  // STATUS_COLORS covers every TaskStatus value — no runtime fallback needed.
  const colors = STATUS_COLORS[task.status];
  const canStart = task.status === 'PLANNED' || task.status === 'IN_PROGRESS' || task.status === 'OVERDUE';
  const isRecurring = Boolean(task.scheduleId);

  const startLabel =
    task.status === 'IN_PROGRESS'
      ? t('agenda.continue')
      : task.status === 'OVERDUE'
        ? t('agenda.catchUp')
        : t('agenda.start');

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.taskTitle}>{task.template.name}</Text>
          {isRecurring && (
            <View style={styles.recurringBadge}>
              <Text style={styles.recurringBadgeText}>{t('agenda.recurring')}</Text>
            </View>
          )}
        </View>
        <View style={[styles.badge, { backgroundColor: colors.bg }]}>
          <Text style={[styles.badgeText, { color: colors.text }]}>
            {t(`agenda.status.${task.status}`)}
          </Text>
        </View>
      </View>
      <Text style={styles.taskTime}>⏰ {formatTime(task.scheduledAt, lang)}</Text>
      {canStart && (
        <TouchableOpacity
          style={[
            styles.startButton,
            task.status === 'OVERDUE' && styles.startButtonOverdue,
            starting && styles.startButtonDisabled,
          ]}
          onPress={() => onStart(task.id, task.template.name)}
          disabled={starting}
          activeOpacity={0.8}
        >
          {starting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.startButtonText}>{startLabel}</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Agenda'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function AgendaScreen({ navigation }: Props) {
  const { t, lang } = useTranslation();
  const qc = useQueryClient();
  const [startingId, setStartingId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const user = useAuthStore((s) => s.user);
  // ARCH-DECISION: OPERATOR role sees only their own assigned tasks.
  // Other roles (MANAGER, ADMIN) see all tenant tasks.
  // Mirrors the web ControlsPage behaviour (line 941 in ControlsPage.tsx).
  const operatorId = user?.role === 'OPERATOR' ? (user?.sub ?? null) : null;

  const goToPrev = () => setSelectedDate((d) => addDays(d, -1));
  const goToNext = () => setSelectedDate((d) => addDays(d, +1));
  const goToToday = () => setSelectedDate(new Date());

  const isToday = dateISO(selectedDate) === dateISO(new Date());

  const {
    data,
    isFetching,
    isError,
    refetch,
  } = useQuery<ControlTask[]>({
    queryKey: ['tasks', dateISO(selectedDate), operatorId ?? 'all'],
    queryFn: async () => {
      // ARCH-DECISION: The backend `status` param is a single string — it does
      // not support multi-value filtering in one request. We fire two parallel
      // requests (PLANNED + IN_PROGRESS) so operators see tasks they can start
      // AND tasks they were interrupted mid-way through. Results are merged and
      // sorted by scheduledAt ascending.
      const day = dateISO(selectedDate);
      const baseParams: Record<string, string | number> = {
        from:  `${day}T00:00:00.000Z`,
        to:    `${day}T23:59:59.999Z`,
        limit: 100,
        // Filter to own tasks for OPERATOR role (others see all tenant tasks)
        ...(operatorId ? { assigneeId: operatorId } : {}),
      };
      // ARCH-DECISION: Three parallel requests so operators see:
      //   IN_PROGRESS — tasks they started but didn't finish
      //   OVERDUE     — tasks they missed (shown with "Catch up" CTA)
      //   PLANNED     — upcoming tasks for the selected day
      const [inProgressRes, overdueRes, plannedRes] = await Promise.all([
        controlClient.get<TasksResponse>('/api/v1/controls/tasks', {
          params: { ...baseParams, status: 'IN_PROGRESS' },
        }),
        controlClient.get<TasksResponse>('/api/v1/controls/tasks', {
          params: { ...baseParams, status: 'OVERDUE' },
        }),
        controlClient.get<TasksResponse>('/api/v1/controls/tasks', {
          params: { ...baseParams, status: 'PLANNED' },
        }),
      ]);

      const merged = [
        ...inProgressRes.data.data,  // IN_PROGRESS first (highest priority)
        ...overdueRes.data.data,     // OVERDUE second — operator must see these
        ...plannedRes.data.data,
      ];
      // Deduplicate by id (shouldn't happen, but defensive)
      const seen = new Set<string>();
      return merged.filter((task) => {
        if (seen.has(task.id)) return false;
        seen.add(task.id);
        return true;
      });
    },
    refetchInterval: 60_000,
  });

  const startMutation = useMutation({
    mutationFn: async ({ taskId }: { taskId: string; taskTitle: string }) => {
      await controlClient.patch(`/api/v1/controls/tasks/${taskId}`, { status: 'IN_PROGRESS' });
    },
    onMutate: ({ taskId }) => setStartingId(taskId),
    onSettled: (_data, _err, { taskId: _id }) => {
      setStartingId(null);
      // ARCH-DECISION: invalidate by date key so the AgendaScreen refetches
      // the current day's tasks regardless of which day the operator is viewing.
      void qc.invalidateQueries({ queryKey: ['tasks', dateISO(selectedDate)] });
    },
    onSuccess: (_data, { taskId, taskTitle }) => {
      navigation.navigate('Checklist', { taskId, taskTitle });
    },
    onError: () => {
      Alert.alert(t('common.error'), t('agenda.startError'));
    },
  });

  const handleStart = (taskId: string, taskTitle: string) => {
    startMutation.mutate({ taskId, taskTitle });
  };

  const tasks = data ?? [];

  return (
    <View style={styles.container}>
      {/* Date navigation header */}
      <View style={styles.header}>
        <View style={styles.dateNav}>
          <TouchableOpacity onPress={goToPrev} style={styles.navArrow}>
            <Text style={styles.navArrowText}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={goToToday} style={styles.datePill}>
            <Text style={styles.headerTitle}>
              {isToday ? t('agenda.todayTitle') : formatFullDate(selectedDate, lang)}
            </Text>
            {isToday && (
              <Text style={styles.headerDate}>{formatFullDate(selectedDate, lang)}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={goToNext} style={styles.navArrow}>
            <Text style={styles.navArrowText}>›</Text>
          </TouchableOpacity>
        </View>
        {!isToday && (
          <TouchableOpacity onPress={goToToday} style={styles.todayChip}>
            <Text style={styles.todayChipText}>{t('agenda.tabs.today')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      {isError ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{t('agenda.errorLoad')}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={tasks.length === 0 ? styles.emptyContainer : styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={refetch}
              colors={['#2D6A4F']}
              tintColor="#2D6A4F"
            />
          }
          ListEmptyComponent={
            isFetching ? (
              <ActivityIndicator size="large" color="#2D6A4F" />
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>✅</Text>
                <Text style={styles.emptyText}>{t('agenda.empty')}</Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <TaskCard
              task={item}
              onStart={handleStart}
              starting={startingId === item.id}
            />
          )}
        />
      )}
    </View>
  );
}

AgendaScreen.displayName = 'AgendaScreen';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F0',
  },
  header: {
    backgroundColor: '#1A3D2B',
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 20,
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navArrow: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  navArrowText: {
    fontSize: 24,
    color: '#fff',
    lineHeight: 28,
  },
  datePill: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  todayChip: {
    alignSelf: 'center',
    marginTop: 8,
    backgroundColor: '#B5833A',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  todayChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  headerDate: {
    fontSize: 12,
    color: '#B5833A',
    marginTop: 2,
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTitleRow: {
    flex: 1,
    marginRight: 8,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A3D2B',
  },
  recurringBadge: {
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  recurringBadgeText: {
    fontSize: 10,
    color: '#1D4ED8',
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  taskTime: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 12,
  },
  startButton: {
    backgroundColor: '#2D6A4F',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  startButtonOverdue: {
    backgroundColor: '#B91C1C',
  },
  startButtonDisabled: {
    opacity: 0.6,
  },
  startButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 15,
    color: '#991B1B',
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#2D6A4F',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
});
