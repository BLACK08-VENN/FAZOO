import type { ReactElement, ReactNode } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  ScrollView,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import type { RefreshControlProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import mountainBackdrop from '../../assets/mountain-backdrop.jpg';
import { PrimaryButton } from './primary-button';

const H_PADDING = 20;
const V_PADDING = 20;

export function AppBackdrop({
  children,
  overlayOpacity = 0.24,
}: {
  children: ReactNode;
  overlayOpacity?: number;
}) {
  return (
    <View className="flex-1 bg-deep">
      <ImageBackground
        source={mountainBackdrop}
        resizeMode="cover"
        className="absolute inset-0"
        imageStyle={{ opacity: 0.16 }}
        accessibilityIgnoresInvertColors
      />
      <View className="absolute inset-0 bg-[#05030E]" style={{ opacity: Math.max(0.68, overlayOpacity) }} />
      <LinearGradient
        colors={['rgba(129,83,255,0.48)', 'rgba(75,32,164,0.24)', 'rgba(8,6,22,0.30)', 'rgba(8,6,22,0.88)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="absolute inset-0"
      />
      <LinearGradient
        colors={['rgba(108,229,255,0.20)', 'rgba(21,13,58,0.14)', 'rgba(5,3,14,0.72)']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        className="absolute inset-0"
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0)']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.85, y: 0.72 }}
        className="absolute inset-0"
      />
      <View className="absolute -left-24 top-8 h-64 w-64 rounded-full bg-violet-500/20" />
      <View className="absolute right-[-70] top-44 h-72 w-72 rounded-full bg-cyan-300/12" />
      <View className="absolute -bottom-12 left-2 h-64 w-64 rounded-full bg-fuchsia-500/16" />
      {children}
    </View>
  );
}

export function Screen({
  children,
  scroll = true,
  bottomInset = true,
  style,
  contentStyle,
  refreshControl,
  backdropOverlayOpacity,
}: {
  children: ReactNode;
  scroll?: boolean;
  bottomInset?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  refreshControl?: ReactElement<RefreshControlProps>;
  backdropOverlayOpacity?: number;
}) {
  const insets = useSafeAreaInsets();
  const pad: StyleProp<ViewStyle> = {
    paddingTop: insets.top + V_PADDING,
    paddingBottom: bottomInset ? insets.bottom + V_PADDING : V_PADDING,
  };

  if (!scroll) {
    return (
      <AppBackdrop overlayOpacity={backdropOverlayOpacity}>
        <View style={[{ flex: 1, paddingHorizontal: H_PADDING }, pad, style]}>{children}</View>
      </AppBackdrop>
    );
  }

  return (
    <AppBackdrop overlayOpacity={backdropOverlayOpacity}>
      <ScrollView
        style={[{ flex: 1 }, style]}
        contentContainerStyle={[{ paddingHorizontal: H_PADDING }, pad, contentStyle]}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="never"
        refreshControl={refreshControl}
      >
        {children}
      </ScrollView>
    </AppBackdrop>
  );
}

export function GlassCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <View
      className={`overflow-hidden rounded-[32px] border border-white/20 bg-[#141027]/78 shadow-2xl ${className}`}
      style={{ shadowColor: '#05020F', shadowOpacity: 0.46, shadowRadius: 28, shadowOffset: { width: 0, height: 16 }, elevation: 10 }}
    >
      <View className="absolute inset-0 rounded-[32px] bg-white/5" />
      <LinearGradient
        colors={['rgba(255,255,255,0.20)', 'rgba(135,92,255,0.13)', 'rgba(20,16,39,0.03)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="absolute inset-0"
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.02)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="absolute inset-x-0 top-0 h-16"
      />
      <View className="absolute inset-x-0 top-0 h-px bg-white/55" />
      <View className="absolute bottom-0 left-8 right-8 h-px bg-cyan-200/20" />
      <View className="p-5">{children}</View>
    </View>
  );
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <View
      className={`overflow-hidden rounded-[28px] border border-white/16 bg-[#17122E]/80 shadow-2xl ${className}`}
      style={{ shadowColor: '#05020F', shadowOpacity: 0.34, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 8 }}
    >
      <View className="absolute inset-0 rounded-[30px] bg-white/5" />
      <LinearGradient
        colors={['rgba(255,255,255,0.16)', 'rgba(108,229,255,0.06)', 'rgba(135,92,255,0.10)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="absolute inset-0"
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.85, y: 0.7 }}
        className="absolute inset-x-0 top-0 h-14"
      />
      <View className="p-5">{children}</View>
    </View>
  );
}

export function HeroCard({
  title,
  subtitle,
  eyebrow,
  icon,
  trailing,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  trailing?: ReactNode;
}) {
  return (
    <GlassCard className="mb-5">
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1">
          {eyebrow ? (
            <Text className="font-sans text-xs uppercase tracking-[2px] text-[#9FAEEC]">{eyebrow}</Text>
          ) : null}
          <View className="mt-2 flex-row items-center gap-3">
            {icon ? (
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/8">
                <Ionicons name={icon} size={20} color="#FFFFFF" />
              </View>
            ) : null}
            <View className="flex-1">
              <Text className="font-sans text-[26px] font-bold leading-8 text-white">{title}</Text>
              {subtitle ? <Text className="font-sans mt-1 text-base leading-6 text-[#B6C2E8]">{subtitle}</Text> : null}
            </View>
          </View>
        </View>
        {trailing ? <View>{trailing}</View> : null}
      </View>
    </GlassCard>
  );
}

export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View className="mb-5 flex-row items-start justify-between gap-4">
      <View className="flex-1">
        {eyebrow ? (
          <Text className="font-sans text-xs uppercase tracking-[2px] text-[#9FAEEC]">{eyebrow}</Text>
        ) : null}
        <Text className="font-sans mt-2 font-sans text-[28px] font-bold leading-9 text-white">{title}</Text>
        {subtitle ? <Text className="font-sans mt-2 text-base leading-7 text-[#B6C2E8]">{subtitle}</Text> : null}
      </View>
      {action ? <View className="pt-1">{action}</View> : null}
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text className="font-sans mb-3 mt-7 text-sm font-semibold uppercase tracking-[2px] text-[#A8B6E8]">{children}</Text>;
}

export function MetricTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'success' | 'warning';
}) {
  const toneClass =
    tone === 'success'
      ? 'bg-emerald-300/14 border-emerald-100/24'
      : tone === 'warning'
        ? 'bg-amber-300/16 border-amber-100/24'
        : 'bg-white/8 border-white/12';

  return (
    <View className={`flex-1 overflow-hidden rounded-[26px] border px-4 py-4 ${toneClass}`}>
      <LinearGradient
        colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.04)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="absolute inset-0"
      />
      <Text className="font-sans text-xs uppercase tracking-[2px] text-[#A8B6E8]">{label}</Text>
      <Text className="font-sans mt-2 text-[30px] font-bold text-white">{value}</Text>
    </View>
  );
}

export function Field({
  label,
  hint,
  ...props
}: TextInputProps & { label?: string; hint?: string }) {
  return (
    <View className="mb-3">
      {label ? <Text className="font-sans mb-2 text-base font-medium text-white">{label}</Text> : null}
      <TextInput
        placeholderTextColor="#93A0C8"
        className="h-14 rounded-2xl border border-white/20 bg-[#17122E]/75 px-4 font-sans text-[16px] text-white"
        {...props}
      />
      {hint ? <Text className="font-sans mt-2 text-sm leading-5 text-[#A8B6E8]">{hint}</Text> : null}
    </View>
  );
}

export function MultilineField({
  label,
  hint,
  ...props
}: TextInputProps & { label?: string; hint?: string }) {
  return (
    <View className="mb-3">
      {label ? <Text className="font-sans mb-2 text-base font-medium text-white">{label}</Text> : null}
      <TextInput
        placeholderTextColor="#93A0C8"
        multiline
        textAlignVertical="top"
        className="min-h-28 rounded-2xl border border-white/20 bg-[#17122E]/75 px-4 py-4 font-sans text-[16px] text-white"
        {...props}
      />
      {hint ? <Text className="font-sans mt-2 text-sm leading-5 text-[#A8B6E8]">{hint}</Text> : null}
    </View>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <AppBackdrop>
      <View className="flex-1 items-center justify-center px-8">
        <GlassCard className="px-8 py-8">
          <ActivityIndicator size="large" color="#D8DDFF" />
          <Text className="font-sans mt-4 text-center text-base text-[#C8D3F5]">{label}</Text>
        </GlassCard>
      </View>
    </AppBackdrop>
  );
}

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <GlassCard className="items-center px-2 py-3">
      <View className="items-center justify-center px-4 py-6">
        <Text className="font-sans text-center text-2xl font-bold text-white">{title}</Text>
        <Text className="font-sans mt-3 text-center text-base leading-7 text-[#C8D3F5]">{body}</Text>
        {actionLabel && onAction ? (
          <View className="mt-6 w-full">
            <PrimaryButton label={actionLabel} onPress={onAction} />
          </View>
        ) : null}
      </View>
    </GlassCard>
  );
}
