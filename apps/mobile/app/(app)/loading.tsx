import { ActivityIndicator, View } from 'react-native';

export default function AppLoading() {
  return (
    <View className="flex-1 items-center justify-center bg-lavender">
      <ActivityIndicator size="large" color="#7B2FBE" accessibilityLabel="Loading" />
    </View>
  );
}
