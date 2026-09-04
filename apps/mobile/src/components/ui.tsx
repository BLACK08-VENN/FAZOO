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
import appBackground from '../../assets/snow-covered-mountain-daytime.jpg';
import { PrimaryButton } from './primary-button';

const H_PADDING = 20;
const V_PADDING = 20;

export function AppBackdrop({
  children,
  imageOpacity = 0.3,
  overlayOpacity = 0.24,
}: {
  children: ReactNode;
  imageOpacity?: number;
  overlayOpacity?: number;
}) {
  return (
    <View className="flex-1 bg-[#FFF4EA]">
      <ImageBackground
        source={appBackground}
        resizeMode="cover"
        imageStyle={{ opacity: imageOpacity }}
        className="absolute inset-0"
      />
      <View className="absolute inset-0 bg-[#140B06]" style={{ opacity: overlayOpacity }} />
      <LinearGradient
        colors={['rgba(255,255,255,0.26)', 'rgba(255,244,234,0.20)', 'rgba(255,231,209,0.14)', 'rgba(255,244,234,0.10)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="absolute inset-0"
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.10)', 'rgba(86,41,14,0.12)', 'rgba(35,16,8,0.24)']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        className="absolute inset-0"
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.34)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.85, y: 0.72 }}
        className="absolute inset-0"
      />
      <View className="absolute -left-16 top-14 h-48 w-48 rounded-full bg-orange-300/18" />
      <View className="absolute right-[-40] top-44 h-56 w-56 rounded-full bg-amber-200/22" />
      <View className="absolute bottom-20 left-10 h-40 w-40 rounded-full bg-rose-200/16" />
      <View className="absolute right-8 top-20 h-32 w-32 rounded-full bg-white/10" />
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
  backdropImageOpacity,
  backdropOverlayOpacity,
}: {
  children: ReactNode;
  scroll?: boolean;
  bottomInset?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  refreshControl?: ReactElement<RefreshControlProps>;
  backdropImageOpacity?: number;
  backdropOverlayOpacity?: number;
}) {
  const insets = useSafeAreaInsets();
  const pad: StyleProp<ViewStyle> = {
    paddingTop: insets.top + V_PADDING,
    paddingBottom: bottomInset ? insets.bottom + V_PADDING : V_PADDING,
  };

  if (!scroll) {
    return (
      <AppBackdrop imageOpacity={backdropImageOpacity} overlayOpacity={backdropOverlayOpacity}>
        <View style={[{ flex: 1, paddingHorizontal: H_PADDING }, pad, style]}>{children}</View>
      </AppBackdrop>
    );
  }

  return (
    <AppBackdrop imageOpacity={backdropImageOpacity} overlayOpacity={backdropOverlayOpacity}>
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
    <View className={`overflow-hidden rounded-[30px] border border-white/30 bg-white/12 shadow-2xl ${className}`}>
      <View className="absolute inset-0 rounded-[30px] bg-white/10" />
      <LinearGradient
        colors={['rgba(255,255,255,0.40)', 'rgba(255,255,255,0.16)', 'rgba(255,244,234,0.08)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="absolute inset-0"
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.08)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="absolute inset-x-0 top-0 h-16"
      />
      <View className="absolute inset-x-0 top-0 h-px bg-white/80" />
      <View className="absolute bottom-0 left-6 right-6 h-px bg-[#815C4A]/12" />
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
    <View className={`overflow-hidden rounded-[30px] border border-white/26 bg-white/10 shadow-2xl ${className}`}>
      <View className="absolute inset-0 rounded-[30px] bg-white/12" />
      <LinearGradient
        colors={['rgba(255,255,255,0.32)', 'rgba(238,242,255,0.15)', 'rgba(255,255,255,0.06)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="absolute inset-0"
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.34)', 'rgba(255,255,255,0)']}
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
            <Text className="text-xs uppercase tracking-[2px] text-[#6B4A36]">{eyebrow}</Text>
          ) : null}
          <View className="mt-2 flex-row items-center gap-3">
            {icon ? (
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-[#2B160B]/8">
                <Ionicons name={icon} size={20} color="#2B160B" />
              </View>
            ) : null}
            <View className="flex-1">
              <Text className="text-[26px] font-bold leading-8 text-[#1F130C]">{title}</Text>
              {subtitle ? <Text className="mt-1 text-base leading-6 text-[#4D3426]">{subtitle}</Text> : null}
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
          <Text className="text-xs uppercase tracking-[2px] text-[#6B4A36]">{eyebrow}</Text>
        ) : null}
        <Text className="mt-2 text-[28px] font-bold leading-9 text-[#1F130C]">{title}</Text>
        {subtitle ? <Text className="mt-2 text-base leading-7 text-[#4D3426]">{subtitle}</Text> : null}
      </View>
      {action ? <View className="pt-1">{action}</View> : null}
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text className="mb-3 mt-7 text-sm font-semibold uppercase tracking-[2px] text-[#6B4A36]">{children}</Text>;
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
      ? 'bg-emerald-300/14 border-emerald-100/30'
      : tone === 'warning'
        ? 'bg-amber-200/16 border-amber-50/30'
        : 'bg-white/10 border-white/16';

  return (
    <View className={`flex-1 overflow-hidden rounded-[26px] border px-4 py-4 ${toneClass}`}>
      <LinearGradient
        colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.04)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="absolute inset-0"
      />
      <Text className="text-xs uppercase tracking-[2px] text-[#6B4A36]">{label}</Text>
      <Text className="mt-2 text-[30px] font-bold text-[#1F130C]">{value}</Text>
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
      {label ? <Text className="mb-2 text-base font-medium text-[#2B160B]">{label}</Text> : null}
      <TextInput
        placeholderTextColor="#8B6B59"
        className="h-14 rounded-2xl border border-white/28 bg-white/18 px-4 text-[16px] text-[#1F130C]"
        {...props}
      />
      {hint ? <Text className="mt-2 text-sm leading-5 text-[#6B4A36]">{hint}</Text> : null}
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
      {label ? <Text className="mb-2 text-base font-medium text-[#2B160B]">{label}</Text> : null}
      <TextInput
        placeholderTextColor="#8B6B59"
        multiline
        textAlignVertical="top"
        className="min-h-28 rounded-2xl border border-white/28 bg-white/18 px-4 py-4 text-[16px] text-[#1F130C]"
        {...props}
      />
      {hint ? <Text className="mt-2 text-sm leading-5 text-[#6B4A36]">{hint}</Text> : null}
    </View>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <AppBackdrop>
      <View className="flex-1 items-center justify-center px-8">
        <GlassCard className="px-8 py-8">
          <ActivityIndicator size="large" color="#D8DDFF" />
          <Text className="mt-4 text-center text-base text-[#4D3426]">{label}</Text>
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
        <Text className="text-center text-2xl font-bold text-[#1F130C]">{title}</Text>
        <Text className="mt-3 text-center text-base leading-7 text-[#4D3426]">{body}</Text>
        {actionLabel && onAction ? (
          <View className="mt-6 w-full">
            <PrimaryButton label={actionLabel} onPress={onAction} />
          </View>
        ) : null}
      </View>
    </GlassCard>
  );
}