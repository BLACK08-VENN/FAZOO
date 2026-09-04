import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const ACTIVE = '#1F130C';
const INACTIVE = 'rgba(74, 52, 38, 0.72)';

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(name: IconName, focused: boolean) {
  return (
    <Ionicons
      name={focused ? name : (`${name}-outline` as IconName)}
      size={24}
      color={focused ? ACTIVE : INACTIVE}
    />
  );
}

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 16,
          backgroundColor: 'rgba(255, 248, 241, 0.96)',
          borderTopColor: 'rgba(58,36,20,0.10)',
          borderTopWidth: 1,
          borderRadius: 28,
          height: 82,
          paddingTop: 12,
          paddingBottom: 12,
          elevation: 0,
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '700' },
        tabBarLabel: ({ children, color }) => (
          <Text style={{ color, fontSize: 13, fontWeight: '700', paddingBottom: 2 }}>{children}</Text>
        ),
        sceneStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: 'Today',
          tabBarIcon: ({ focused }) => (
            <View
              style={{
                borderRadius: 16,
                paddingHorizontal: 12,
                paddingVertical: 6,
              }}
            >
              {tabIcon('home', focused)}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ focused }) => (
            <View
              style={{
                backgroundColor: focused ? 'rgba(255,255,255,0.14)' : 'transparent',
                borderRadius: 16,
                paddingHorizontal: 12,
                paddingVertical: 7,
              }}
            >
              {tabIcon('time', focused)}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => (
            <View
              style={{
                backgroundColor: focused ? 'rgba(255,255,255,0.14)' : 'transparent',
                borderRadius: 16,
                paddingHorizontal: 12,
                paddingVertical: 7,
              }}
            >
              {tabIcon('person', focused)}
            </View>
          ),
        }}
      />
      {/* Non-tab routes in this group — hidden from the tab bar */}
      <Tabs.Screen name="campaign-logs" options={{ href: null }} />
      <Tabs.Screen name="campaigns" options={{ href: null }} />
      <Tabs.Screen name="error" options={{ href: null }} />
      <Tabs.Screen name="leave" options={{ href: null }} />
      <Tabs.Screen name="loading" options={{ href: null }} />
      <Tabs.Screen name="sales" options={{ href: null }} />
    </Tabs>
  );
}
