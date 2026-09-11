import { Image, Text, TouchableOpacity, View } from 'react-native';

export interface Capturable {
  uri: string;
}

/** Large tap target that shows the captured image once there is one. */
export function CaptureBox({
  photo,
  onSnap,
  hint,
}: {
  photo: Capturable | null;
  onSnap: () => void;
  hint: string;
}) {
  return (
    <TouchableOpacity
      onPress={onSnap}
      accessibilityLabel={hint}
      accessibilityRole="button"
      activeOpacity={0.85}
      className="min-h-48 w-full overflow-hidden rounded-2xl border border-dashed border-ink/15 bg-lavender"
    >
      {photo ? (
        <Image
          source={{ uri: photo.uri }}
          className="h-48 w-full rounded-2xl"
          resizeMode="cover"
        />
      ) : (
        <View
          className="min-h-48 w-full items-center justify-center px-4"
        >
          <Text className="font-sans text-center font-semibold text-ink">{hint}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
