import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuthStore } from '../store/authStore';

// ── Role labels ───────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN:     'Super Administrateur',
  ADMIN:           'Administrateur',
  MANAGER:         'Manager',
  QUALITY_OFFICER: 'Responsable Qualité',
  OPERATOR:        'Opérateur',
  VIEWER:          'Lecteur',
};

// ── Info row ──────────────────────────────────────────────────────────────────

interface InfoRowProps {
  label: string;
  value: string;
}

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

// ── ProfileScreen ─────────────────────────────────────────────────────────────

export function ProfileScreen() {
  const user   = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = () => {
    Alert.alert(
      'Déconnexion',
      'Voulez-vous vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Déconnexion', style: 'destructive', onPress: () => void logout() },
      ],
    );
  };

  if (!user) return null;

  const initials = user.email.charAt(0).toUpperCase();
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.rolePill}>
          <Text style={styles.rolePillText}>{roleLabel}</Text>
        </View>
      </View>

      {/* Info card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Informations du compte</Text>
        <InfoRow label="Email"      value={user.email} />
        <InfoRow label="Rôle"       value={roleLabel} />
        <InfoRow label="Tenant ID"  value={user.tenantId} />
        <InfoRow label="User ID"    value={user.sub} />
      </View>

      {/* App info card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Application</Text>
        <InfoRow label="Version"    value="1.0.0" />
        <InfoRow label="Plateforme" value="NORMES HACCP Mobile" />
      </View>

      {/* Logout button */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
        <Text style={styles.logoutText}>🚪  Déconnexion</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

ProfileScreen.displayName = 'ProfileScreen';

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F0',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2D6A4F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
  },
  rolePill: {
    backgroundColor: '#B5833A',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  rolePillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A3D2B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  rowLabel: {
    fontSize: 14,
    color: '#6B7280',
    flex: 1,
  },
  rowValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  logoutButton: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#991B1B',
  },
});
