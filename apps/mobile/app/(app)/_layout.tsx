import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const ACTIVE = '#7B2FBE';
const INACTIVE = 'rgba(23, 23, 28, 0.42)';

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
          backgroundColor: 'rgba(255,255,255,0.96)',
          borderTopColor: 'rgba(11,11,15,0.09)',
          borderTopWidth: 1,
          borderRadius: 30,
          height: 82,
          paddingTop: 12,
          paddingBottom: 12,
          elevation: 0,
          shadowColor: '#23122C',
          shadowOpacity: 0.1,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: -8 },
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
        tabBarLabelStyle: { fontFamily: 'Sora', fontSize: 12, fontWeight: '700' },
        tabBarLabel: ({ children, color }) => (
          <Text style={{ color, fontFamily: 'Sora', fontSize: 12, fontWeight: '700', paddingBottom: 2 }}>{children}</Text>
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
                backgroundColor: focused ? 'rgba(123,47,190,0.12)' : 'transparent',
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
                backgroundColor: focused ? 'rgba(139,47,209,0.10)' : 'transparent',
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
