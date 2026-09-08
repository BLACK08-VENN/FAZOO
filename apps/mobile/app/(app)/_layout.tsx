import { useEffect, useRef, useState } from 'react';
import { Tabs } from 'expo-router';
import { Animated, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const ACTIVE = '#7B2FBE';
const INACTIVE = 'rgba(23, 23, 28, 0.42)';
const TAB_BAR_HEIGHT = 82;

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
          width: 48,
          height: 38,
          borderRadius: 19,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(123,47,190,0.05)',
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
        colors={['#A557E0', '#7B2FBE', '#5A1E82']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: 52,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.72)',
          shadowColor: '#5A1E82',
          shadowOpacity: 0.3,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 5,
        }}
      >
        {icon}
        <Ionicons
          name="sparkles"
          size={9}
          color="#FFFFFF"
          style={{ position: 'absolute', right: 6, top: 5, opacity: 0.9 }}
        />
      </LinearGradient>
    </Animated.View>
  );
}

const toggleShadow = {
  shadowColor: '#23122C',
  shadowOpacity: 0.28,
  shadowRadius: 20,
  shadowOffset: { width: 0, height: 10 },
  elevation: 12,
} as const;

function HamburgerIcon() {
  return (
    <View style={{ gap: 5 }}>
      {[0, 1, 2].map((line) => (
        <View
          key={line}
          style={{
            width: 30,
            height: 4,
            borderRadius: 2,
            backgroundColor: '#0B0B0F',
          }}
        />
      ))}
    </View>
  );
}

export default function AppLayout() {
  const [menuCollapsed, setMenuCollapsed] = useState(false);

  return (
    <>
      <Tabs
        initialRouteName="profile"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: ACTIVE,
          tabBarInactiveTintColor: INACTIVE,
          tabBarHideOnKeyboard: true,
          tabBarBackground: () => (
            <LinearGradient
              colors={['rgba(255,255,255,0.99)', 'rgba(250,246,253,0.98)', 'rgba(244,235,250,0.98)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                flex: 1,
                borderRadius: 32,
                borderWidth: 1,
                borderColor: 'rgba(123,47,190,0.18)',
              }}
            />
          ),
          tabBarStyle: menuCollapsed
            ? { display: 'none' }
            : {
                position: 'absolute',
                left: 16,
                right: 16,
                bottom: 16,
                backgroundColor: 'transparent',
                borderTopWidth: 0,
                borderRadius: 32,
                height: TAB_BAR_HEIGHT,
                paddingTop: 8,
                paddingBottom: 8,
                elevation: 10,
                shadowColor: '#23122C',
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

      {menuCollapsed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Expand menu"
          onPress={() => setMenuCollapsed(false)}
          style={({ pressed }) => [
            {
              position: 'absolute',
              right: 16,
              bottom: 20,
              height: 64,
              width: 64,
              borderRadius: 32,
              backgroundColor: '#FFFFFF',
              borderWidth: 3,
              borderColor: '#0B0B0F',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            },
            toggleShadow,
          ]}
        >
          <HamburgerIcon />
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Collapse menu"
          onPress={() => setMenuCollapsed(true)}
          style={({ pressed }) => [
            {
              position: 'absolute',
              left: '50%',
              marginLeft: -22,
              bottom: 16 + TAB_BAR_HEIGHT + 8,
              height: 44,
              width: 44,
              borderRadius: 22,
              backgroundColor: '#FFFFFF',
              borderWidth: 3,
              borderColor: '#0B0B0F',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.8 : 1,
            },
            toggleShadow,
          ]}
        >
          <Ionicons name="chevron-down" size={26} color="#0B0B0F" />
        </Pressable>
      )}
    </>
  );
}
