import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

import { AgendaScreen }  from '../screens/AgendaScreen';
import { DLCScreen }     from '../screens/DLCScreen';
import { NCFormScreen }  from '../screens/NCFormScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { useTranslation } from '@/i18n';

export type MainTabParamList = {
  Agenda:             undefined;
  'Non-conformités':  undefined;
  DLC:                undefined;
  Profil:             undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

// Simple emoji/unicode icon fallback — avoids adding a vector icon dependency
const TAB_ICONS: Record<string, string> = {
  Agenda:            '📅',
  'Non-conformités': '⚠️',
  DLC:               '🏷️',
  Profil:            '👤',
};

interface TabIconProps {
  label: string;
  focused: boolean;
}

function TabIcon({ label, focused }: TabIconProps) {
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>
      {TAB_ICONS[label] ?? '•'}
    </Text>
  );
}

export function MainNavigator() {
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: '#1A3D2B' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarStyle: { backgroundColor: '#1A3D2B', borderTopColor: '#2D6A4F' },
        tabBarActiveTintColor: '#B5833A',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.5)',
        tabBarIcon: ({ focused }) => <TabIcon label={route.name} focused={focused} />,
      })}
    >
      <Tab.Screen
        name="Agenda"
        component={AgendaScreen}
        options={{ title: t('nav.agenda') }}
      />
      <Tab.Screen
        name="Non-conformités"
        component={NCFormScreen}
        options={{ title: t('nav.nc') }}
      />
      <Tab.Screen
        name="DLC"
        component={DLCScreen}
        options={{ title: t('nav.dlc') }}
      />
      <Tab.Screen
        name="Profil"
        component={ProfileScreen}
        options={{ title: t('nav.profile') }}
      />
    </Tab.Navigator>
  );
}

MainNavigator.displayName = 'MainNavigator';
