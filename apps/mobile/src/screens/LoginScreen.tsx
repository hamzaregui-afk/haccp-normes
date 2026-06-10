import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { authClient } from '../api/client';
import { SUPPORTED_LANGUAGES, useTranslation, type LangCode } from '../i18n';
import type { RootStackParamList } from '../navigation/RootNavigator';
import type { JwtPayload } from '../store/authStore';
import { useAuthStore } from '../store/authStore';

// ARCH-DECISION: auth-service returns { accessToken, refreshToken, user } flat
// (no toApiResponse wrapper) because it predates the standard ApiResponse pattern.
// The mobile client reads res.data directly (not res.data.data).
interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: JwtPayload;
}

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen(_props: Props) {
  const { setAuth } = useAuthStore();
  const { t, lang, setLang } = useTranslation();

  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setErrorMsg(t('common.required'));
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await authClient.post<LoginResponse>('/api/v1/auth/login', { email, password });
      const { accessToken, refreshToken, user } = res.data;  // flat response — no .data wrapper
      // Persist the refresh token so the client can silently renew the access
      // token on 401 instead of forcing a re-login (see api/client.ts).
      setAuth(accessToken, user, refreshToken);
    } catch (err: unknown) {
      const message =
        isAxiosError(err) && err.response?.data?.message
          ? String(err.response.data.message)
          : t('auth.loginError');
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        {/* ── Language picker (top-right) ─────────────────────────── */}
        <View style={styles.langRow}>
          {SUPPORTED_LANGUAGES.map((l) => (
            <TouchableOpacity
              key={l.code}
              onPress={() => { void setLang(l.code as LangCode); }}
              style={[
                styles.langButton,
                lang === l.code && styles.langButtonActive,
              ]}
              accessibilityRole="button"
              accessibilityLabel={l.label}
              accessibilityState={{ selected: lang === l.code }}
            >
              <Text
                style={[
                  styles.langText,
                  lang === l.code && styles.langTextActive,
                ]}
              >
                {l.code.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Brand header ──────────────────────────────────────────── */}
        <View style={styles.brandBlock}>
          <Text style={styles.brandTitle}>{t('auth.title')}</Text>
          <Text style={styles.brandSubtitle}>{t('auth.subtitle')}</Text>
        </View>

        {/* ── Form card ─────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('auth.login')}</Text>

          <TextInput
            style={styles.input}
            placeholder={t('auth.email')}
            placeholderTextColor="#999"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            returnKeyType="next"
            testID="email-input"
          />
          <TextInput
            style={styles.input}
            placeholder={t('auth.password')}
            placeholderTextColor="#999"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
            testID="password-input"
          />

          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
            testID="login-button"
          >
            {loading ? (
              <ActivityIndicator color="#1A3D2B" />
            ) : (
              <Text style={styles.buttonText}>{t('auth.loginButton')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// Narrow type guard for Axios errors without importing axios types
function isAxiosError(
  err: unknown,
): err is { response?: { data?: { message?: unknown } } } {
  return typeof err === 'object' && err !== null && 'response' in err;
}

LoginScreen.displayName = 'LoginScreen';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A3D2B',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  langRow: {
    position: 'absolute',
    top: 52,
    right: 24,
    flexDirection: 'row',
    gap: 6,
  },
  langButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  langButtonActive: {
    backgroundColor: '#B5833A',
    borderColor: '#B5833A',
  },
  langText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    fontWeight: '600',
  },
  langTextActive: {
    color: '#fff',
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: 40,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#B5833A',
    letterSpacing: 2,
  },
  brandSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
    letterSpacing: 1,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A3D2B',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1a1a1a',
    marginBottom: 14,
    backgroundColor: '#FAFAFA',
  },
  errorText: {
    color: '#C0392B',
    fontSize: 13,
    marginBottom: 10,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#B5833A',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
