import { useEffect, useRef } from 'react';
import { Tabs } from 'expo-router';
import { Animated, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const ACTIVE = '#7B2FBE';
const INACTIVE = 'rgba(27, 22, 35, 0.42)';
const TAB_BAR_HEIGHT = 68;

type IconName = keyof typeof Ionicons.glyphMap;

function FancyTabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  const scale = useRef(new Animated.Value(focused ? 1 : 0.96)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: focused ? 1.06 : 0.96,
      damping: 12,
      stiffness: 180,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
  }, [focused, scale]);

  const icon = (
    <Ionicons
      name={focused ? name : (`${name}-outline` as IconName)}
      size={focused ? 23 : 22}
      color={focused ? '#FFFFFF' : INACTIVE}
    />
  );

  if (!focused) {
    return (
      <Animated.View
        style={{
          width: 42,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(123,47,190,0.08)',
          transform: [{ scale }],
        }}
      >
        {icon}
      </Animated.View>
    );
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <LinearGradient
        colors={['#9B4FE8', '#7B2FBE', '#5A1E82']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: 46,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.85)',
          shadowColor: '#7B2FBE',
          shadowOpacity: 0.4,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 5 },
          elevation: 6,
        }}
      >
        {icon}
      </LinearGradient>
    </Animated.View>
  );
}

export default function AppLayout() {
  return (
    <Tabs
      initialRouteName="today"
      screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: ACTIVE,
          tabBarInactiveTintColor: INACTIVE,
          tabBarHideOnKeyboard: true,
          tabBarBackground: () => (
            <LinearGradient
              colors={['rgba(255,255,255,0.96)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.98)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                flex: 1,
                borderRadius: 26,
                borderWidth: 1,
                borderColor: 'rgba(123,47,190,0.20)',
              }}
            />
          ),
          tabBarStyle: {
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 10,
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            borderRadius: 26,
            height: TAB_BAR_HEIGHT,
            paddingTop: 5,
            paddingBottom: 5,
            elevation: 10,
            shadowColor: '#7B2FBE',
            shadowOpacity: 0.18,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: 10 },
          },
          tabBarItemStyle: {
            paddingVertical: 2,
          },
          tabBarLabelStyle: { fontFamily: 'Sora', fontSize: 11, fontWeight: '700' },
          tabBarLabel: ({ children, color }) => (
            <Text style={{ color, fontFamily: 'Sora', fontSize: 11, fontWeight: '700', paddingBottom: 1, letterSpacing: 0.2 }}>{children}</Text>
          ),
          sceneStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ focused }) => <FancyTabIcon name="person" focused={focused} />,
          }}
        />
      <Tabs.Screen
          name="today"
          options={{
            title: 'Today',
            tabBarIcon: ({ focused }) => <FancyTabIcon name="home" focused={focused} />,
          }}
        />
      <Tabs.Screen
          name="history"
          options={{
            title: 'History',
            tabBarIcon: ({ focused }) => <FancyTabIcon name="time" focused={focused} />,
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
