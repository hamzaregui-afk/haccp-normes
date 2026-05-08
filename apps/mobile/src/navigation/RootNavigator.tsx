import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { I18nProvider } from '../i18n';
import { ChecklistScreen } from '../screens/ChecklistScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { useAuthStore } from '../store/authStore';
import { MainNavigator } from './MainNavigator';

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Checklist: { taskId: string; taskTitle: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// ─── Inner navigator (needs auth store, lives inside I18nProvider) ────────────

function AppNavigator() {
  const { token, hydrateFromStorage } = useAuthStore();
  const [hydrating, setHydrating] = useState(true);

  useEffect(() => {
    hydrateFromStorage().finally(() => setHydrating(false));
  }, [hydrateFromStorage]);

  if (hydrating) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1A3D2B' }}>
        <ActivityIndicator size="large" color="#B5833A" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#1A3D2B' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        {token ? (
          <>
            <Stack.Screen name="Main" component={MainNavigator} options={{ headerShown: false }} />
            <Stack.Screen
              name="Checklist"
              component={ChecklistScreen}
              options={({ route }) => ({ title: route.params.taskTitle })}
            />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ─── Root — wraps everything in I18nProvider ──────────────────────────────────

export const RootNavigator = () => (
  <I18nProvider>
    <AppNavigator />
  </I18nProvider>
);

RootNavigator.displayName = 'RootNavigator';
