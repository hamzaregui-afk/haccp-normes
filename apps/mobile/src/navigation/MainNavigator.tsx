import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

import { AgendaScreen }  from '../screens/AgendaScreen';
import { DLCScreen }     from '../screens/DLCScreen';
import { NCFormScreen }  from '../screens/NCFormScreen';
import { ProfileScreen } from '../screens/ProfileScreen';

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

export const MainNavigator = () => (
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
    <Tab.Screen name="Agenda" component={AgendaScreen} options={{ title: 'Agenda' }} />
    <Tab.Screen
      name="Non-conformités"
      component={NCFormScreen}
      options={{ title: 'Non-conformités' }}
    />
    <Tab.Screen name="DLC"    component={DLCScreen}    options={{ title: 'DLC' }} />
    <Tab.Screen name="Profil" component={ProfileScreen} options={{ title: 'Mon profil' }} />
  </Tab.Navigator>
);

MainNavigator.displayName = 'MainNavigator';
