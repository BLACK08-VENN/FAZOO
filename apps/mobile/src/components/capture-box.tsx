import { Image, Text, View } from 'react-native';
import { PrimaryButton } from './primary-button';

export interface Capturable {
  uri: string;
}

/** Large tap target that shows the captured image once there is one. */
export function CaptureBox({
  photo,
  onSnap,
  hint,
  heightClass = 'min-h-48',
}: {
  photo: Capturable | null;
  onSnap: () => void;
  hint: string;
  heightClass?: string;
}) {
  return (
    <PrimaryButton onPress={onSnap} label="" accessibilityLabel={hint}>
      {photo ? (
        <Image source={{ uri: photo.uri }} className="h-full w-full rounded-2xl" resizeMode="cover" />
      ) : (
        <View
          className={`${heightClass} w-full items-center justify-center rounded-2xl border border-dashed border-ink/15 bg-lavender px-4`}
        >
          <Text className="font-sans text-center font-semibold text-ink">{hint}</Text>
        </View>
      )}
    </PrimaryButton>
  );
}
