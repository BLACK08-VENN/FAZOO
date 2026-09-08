import type { ReactElement, ReactNode } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
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
}: {
  children: ReactNode;
}) {
  return (
    <View className="flex-1 bg-lavender">
      <LinearGradient
        colors={['rgba(139,47,209,0.12)', 'rgba(90,30,130,0.06)', 'rgba(246,242,250,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="absolute inset-0"
      />
      <LinearGradient
        colors={['rgba(139,47,209,0.07)', 'rgba(246,242,250,0)']}
        start={{ x: 1, y: 1 }}
        end={{ x: 0, y: 0 }}
        className="absolute inset-0"
      />
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
}: {
  children: ReactNode;
  scroll?: boolean;
  bottomInset?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  refreshControl?: ReactElement<RefreshControlProps>;
}) {
  const insets = useSafeAreaInsets();
  const pad: StyleProp<ViewStyle> = {
    paddingTop: insets.top + V_PADDING,
    paddingBottom: bottomInset ? insets.bottom + V_PADDING : V_PADDING,
  };

  if (!scroll) {
    return (
      <AppBackdrop>
        <View style={[{ flex: 1, paddingHorizontal: H_PADDING }, pad, style]}>{children}</View>
      </AppBackdrop>
    );
  }

  return (
    <AppBackdrop>
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

export function Page({
  children,
  scroll = true,
  bottomInset = true,
  style,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  bottomInset?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <Screen scroll={scroll} bottomInset={bottomInset} style={style} contentStyle={contentStyle}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: '100%', maxWidth: 720 }}>{children}</View>
      </View>
    </Screen>
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
      className={`overflow-hidden rounded-[32px] border border-ink/10 bg-white p-5 ${className}`}
      style={{ shadowColor: '#23122C', shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 4 }}
    >
      {children}
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
      className={`overflow-hidden rounded-[28px] border border-ink/10 bg-white p-5 ${className}`}
      style={{ shadowColor: '#23122C', shadowOpacity: 0.06, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 3 }}
    >
      {children}
    </View>
  );
}

export function HeroCard({
  title,
  subtitle,
  eyebrow,
  icon,
  trailing,
  onBack,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  trailing?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <GlassCard className="mb-5">
      <View className="flex-row items-start justify-between gap-4">
        {onBack ? (
          <TouchableOpacity onPress={onBack} className="mr-2 mt-1 h-10 w-10 items-center justify-center rounded-full bg-ink/5" accessibilityLabel="Go back" accessibilityRole="button">
            <Ionicons name="chevron-back" size={22} color="#0B0B0F" />
          </TouchableOpacity>
        ) : null}
        <View className="flex-1">
          {eyebrow ? (
            <Text className="font-sans text-xs uppercase tracking-[2px] text-primary">{eyebrow}</Text>
          ) : null}
          <View className="mt-2 flex-row items-center gap-3">
            {icon ? (
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <Ionicons name={icon} size={20} color="#7B2FBE" />
              </View>
            ) : null}
            <View className="flex-1">
              <Text className="font-sans text-[26px] font-bold leading-8 text-ink">{title}</Text>
              {subtitle ? <Text className="font-sans mt-1 text-base leading-6 text-muted">{subtitle}</Text> : null}
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
  onBack,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <View className="mb-5 flex-row items-start justify-between gap-4">
      {onBack ? (
        <TouchableOpacity onPress={onBack} className="mr-2 mt-1 h-10 w-10 items-center justify-center rounded-full bg-ink/5" accessibilityLabel="Go back" accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color="#0B0B0F" />
        </TouchableOpacity>
      ) : null}
      <View className="flex-1">
        {eyebrow ? (
          <Text className="font-sans text-xs uppercase tracking-[2px] text-primary">{eyebrow}</Text>
        ) : null}
        <Text className="font-sans mt-2 font-sans text-[28px] font-bold leading-9 text-ink">{title}</Text>
        {subtitle ? <Text className="font-sans mt-2 text-base leading-7 text-muted">{subtitle}</Text> : null}
      </View>
      {action ? <View className="pt-1">{action}</View> : null}
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text className="font-sans mb-3 mt-7 text-sm font-semibold uppercase tracking-[2px] text-muted">{children}</Text>;
}

export function MetricTile({
  label,
  value,
  tone = 'default',
  compact = false,
}: {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'success' | 'warning';
  compact?: boolean;
}) {
  const toneClass =
    tone === 'success'
      ? 'border-ok/25 bg-emerald-50'
      : tone === 'warning'
        ? 'border-warn/30 bg-amber-50'
        : 'border-ink/10 bg-white';

  if (compact) {
    return (
      <View className={`overflow-hidden rounded-[16px] border px-3 py-1.5 ${toneClass}`}>
        <Text className="font-sans text-[10px] uppercase tracking-[1.5px] text-muted">{label}</Text>
        <Text className="font-sans text-sm font-bold text-ink">{value}</Text>
      </View>
    );
  }

  return (
    <View className={`flex-1 overflow-hidden rounded-[26px] border px-4 py-4 ${toneClass}`}>
      <Text className="font-sans text-xs uppercase tracking-[2px] text-muted">{label}</Text>
      <Text className="font-sans mt-2 text-[30px] font-bold text-ink">{value}</Text>
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
      {label ? <Text className="font-sans mb-2 text-base font-medium text-ink">{label}</Text> : null}
      <TextInput
        placeholderTextColor="#8A8491"
        className="h-14 rounded-xl border border-ink/15 bg-white px-4 font-sans text-[16px] text-ink"
        {...props}
      />
      {hint ? <Text className="font-sans mt-2 text-sm leading-5 text-muted">{hint}</Text> : null}
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
      {label ? <Text className="font-sans mb-2 text-base font-medium text-ink">{label}</Text> : null}
      <TextInput
        placeholderTextColor="#8A8491"
        multiline
        textAlignVertical="top"
        className="min-h-28 rounded-xl border border-ink/15 bg-white px-4 py-4 font-sans text-[16px] text-ink"
        {...props}
      />
      {hint ? <Text className="font-sans mt-2 text-sm leading-5 text-muted">{hint}</Text> : null}
    </View>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <AppBackdrop>
      <View className="flex-1 items-center justify-center px-8">
        <GlassCard className="px-8 py-8">
          <ActivityIndicator size="large" color="#7B2FBE" />
          <Text className="font-sans mt-4 text-center text-base text-muted">{label}</Text>
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
        <Text className="font-sans text-center text-2xl font-bold text-ink">{title}</Text>
        <Text className="font-sans mt-3 text-center text-base leading-7 text-muted">{body}</Text>
        {actionLabel && onAction ? (
          <View className="mt-6 w-full">
            <PrimaryButton label={actionLabel} onPress={onAction} />
          </View>
        ) : null}
      </View>
    </GlassCard>
  );
}
