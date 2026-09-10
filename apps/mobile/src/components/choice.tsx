import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

export interface ChoiceOption {
  code: string;
  label: string;
}

/** A filter chip. `code: null` means "no filter". */
export interface ChipOption {
  code: string | null;
  label: string;
}

/**
 * Horizontally scrollable single-select filter row — used for regions on the
 * visit wizard and stages on the pipeline list. Scrolls rather than wraps
 * because filter lists can be long. Selected state is marked with a tick and
 * bold text, never colour alone.
 */
export function ChipRow({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: readonly ChipOption[];
  value: string | null;
  onChange: (code: string | null) => void;
}) {
  return (
    <View className="mb-4">
      {label ? <Text className="font-sans mb-2 text-base font-medium text-ink">{label}</Text> : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {options.map((option) => {
          const selected = option.code === value;
          return (
            <TouchableOpacity
              key={option.code ?? '__all'}
              onPress={() => onChange(selected ? null : option.code)}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              accessibilityLabel={option.label}
              activeOpacity={0.8}
              className={`min-h-12 shrink-0 justify-center rounded-2xl border px-4 py-3 ${
                selected ? 'border-primary bg-primary/15' : 'border-edge bg-white'
              }`}
            >
              <Text
                className={`font-sans text-[15px] ${selected ? 'font-bold text-primaryText' : 'text-ink'}`}
              >
                {selected ? '✓ ' : ''}
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

/**
 * Single-select chip row. Big tap targets for one-handed use at a school gate,
 * and the selected option is marked with a tick and bold text — never colour
 * alone.
 */
export function ChoiceGroup({
  label,
  options,
  value,
  onChange,
  hint,
}: {
  label: string;
  options: readonly ChoiceOption[];
  value: string | null;
  onChange: (code: string | null) => void;
  hint?: string;
}) {
  return (
    <View className="mb-4">
      <Text className="font-sans mb-2 text-base font-medium text-ink">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.code === value;
          return (
            <TouchableOpacity
              key={option.code}
              onPress={() => onChange(selected ? null : option.code)}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              accessibilityLabel={option.label}
              activeOpacity={0.8}
              className={`min-h-12 justify-center rounded-2xl border px-4 py-3 ${
                selected ? 'border-primary bg-primary/15' : 'border-edge bg-white'
              }`}
            >
              <Text
                className={`font-sans text-[15px] ${selected ? 'font-bold text-primaryText' : 'text-ink'}`}
              >
                {selected ? '✓ ' : ''}
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {hint ? <Text className="font-sans mt-2 text-sm leading-5 text-muted">{hint}</Text> : null}
    </View>
  );
}

/** Two large, equally weighted answer buttons for a yes/no style question. */
export function AnswerButtons({
  options,
  onSelect,
}: {
  options: ReadonlyArray<{ code: string; label: string; hint: string; icon: 'checkmark-circle' | 'close-circle' }>;
  onSelect: (code: string) => void;
}) {
  return (
    <View className="gap-3">
      {options.map((option) => (
        <TouchableOpacity
          key={option.code}
          onPress={() => onSelect(option.code)}
          accessibilityRole="button"
          accessibilityLabel={option.label}
          accessibilityHint={option.hint}
          activeOpacity={0.85}
          className="min-h-20 flex-row items-center gap-4 rounded-[24px] border border-edge bg-white px-5 py-4"
        >
          <View className="h-12 w-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/15">
            <Text className="font-sans text-xl">{option.icon === 'checkmark-circle' ? '✓' : '✕'}</Text>
          </View>
          <View className="flex-1">
            <Text className="font-sans text-lg font-bold text-ink">{option.label}</Text>
            <Text className="font-sans mt-1 text-sm leading-5 text-muted">{option.hint}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}
