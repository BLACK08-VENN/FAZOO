import type { ReactElement, ReactNode } from 'react';
import {
  ActivityIndicator,
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
    <View className="flex-1 bg-[#09071A]">
      <View className="absolute inset-0 bg-[#05030F]" style={{ opacity: overlayOpacity }} />
      <LinearGradient
        colors={['rgba(130,94,255,0.18)', 'rgba(56,25,126,0.12)', 'rgba(7,7,28,0.10)', 'rgba(7,7,28,0.02)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="absolute inset-0"
      />
      <LinearGradient
        colors={['rgba(52,209,255,0.10)', 'rgba(32,20,89,0.20)', 'rgba(5,3,15,0.42)']}
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
      <View className="absolute -left-16 top-12 h-52 w-52 rounded-full bg-violet-500/18" />
      <View className="absolute right-[-50] top-40 h-60 w-60 rounded-full bg-cyan-400/14" />
      <View className="absolute bottom-14 left-6 h-44 w-44 rounded-full bg-fuchsia-500/14" />
      <View className="absolute right-10 top-24 h-24 w-24 rounded-full bg-white/8" />
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
    <View className={`overflow-hidden rounded-[30px] border border-white/14 bg-[#110F28]/70 shadow-2xl ${className}`}>
      <View className="absolute inset-0 rounded-[30px] bg-white/6" />
      <LinearGradient
        colors={['rgba(255,255,255,0.18)', 'rgba(124,92,255,0.12)', 'rgba(17,15,40,0.04)']}
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
      <View className="absolute inset-x-0 top-0 h-px bg-white/40" />
      <View className="absolute bottom-0 left-6 right-6 h-px bg-cyan-200/10" />
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
    <View className={`overflow-hidden rounded-[30px] border border-white/12 bg-[#141233]/72 shadow-2xl ${className}`}>
      <View className="absolute inset-0 rounded-[30px] bg-white/5" />
      <LinearGradient
        colors={['rgba(255,255,255,0.15)', 'rgba(52,209,255,0.05)', 'rgba(124,92,255,0.06)']}
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
            <Text className="text-xs uppercase tracking-[2px] text-[#9FAEEC]">{eyebrow}</Text>
          ) : null}
          <View className="mt-2 flex-row items-center gap-3">
            {icon ? (
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/8">
                <Ionicons name={icon} size={20} color="#FFFFFF" />
              </View>
            ) : null}
            <View className="flex-1">
              <Text className="text-[26px] font-bold leading-8 text-white">{title}</Text>
              {subtitle ? <Text className="mt-1 text-base leading-6 text-[#B6C2E8]">{subtitle}</Text> : null}
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
          <Text className="text-xs uppercase tracking-[2px] text-[#9FAEEC]">{eyebrow}</Text>
        ) : null}
        <Text className="mt-2 text-[28px] font-bold leading-9 text-white">{title}</Text>
        {subtitle ? <Text className="mt-2 text-base leading-7 text-[#B6C2E8]">{subtitle}</Text> : null}
      </View>
      {action ? <View className="pt-1">{action}</View> : null}
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text className="mb-3 mt-7 text-sm font-semibold uppercase tracking-[2px] text-[#A8B6E8]">{children}</Text>;
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
      <Text className="text-xs uppercase tracking-[2px] text-[#A8B6E8]">{label}</Text>
      <Text className="mt-2 text-[30px] font-bold text-white">{value}</Text>
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
      {label ? <Text className="mb-2 text-base font-medium text-white">{label}</Text> : null}
      <TextInput
        placeholderTextColor="#93A0C8"
        className="h-14 rounded-2xl border border-white/14 bg-white/8 px-4 text-[16px] text-white"
        {...props}
      />
      {hint ? <Text className="mt-2 text-sm leading-5 text-[#A8B6E8]">{hint}</Text> : null}
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
      {label ? <Text className="mb-2 text-base font-medium text-white">{label}</Text> : null}
      <TextInput
        placeholderTextColor="#93A0C8"
        multiline
        textAlignVertical="top"
        className="min-h-28 rounded-2xl border border-white/14 bg-white/8 px-4 py-4 text-[16px] text-white"
        {...props}
      />
      {hint ? <Text className="mt-2 text-sm leading-5 text-[#A8B6E8]">{hint}</Text> : null}
    </View>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <AppBackdrop>
      <View className="flex-1 items-center justify-center px-8">
        <GlassCard className="px-8 py-8">
          <ActivityIndicator size="large" color="#D8DDFF" />
          <Text className="mt-4 text-center text-base text-[#C8D3F5]">{label}</Text>
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
        <Text className="text-center text-2xl font-bold text-white">{title}</Text>
        <Text className="mt-3 text-center text-base leading-7 text-[#C8D3F5]">{body}</Text>
        {actionLabel && onAction ? (
          <View className="mt-6 w-full">
            <PrimaryButton label={actionLabel} onPress={onAction} />
          </View>
        ) : null}
      </View>
    </GlassCard>
  );
}