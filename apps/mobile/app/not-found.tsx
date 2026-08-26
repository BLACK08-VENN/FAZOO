import { Link } from 'expo-router';
import { Text, View } from 'react-native';

export default function NotFound() {
  return (
    <View className="flex-1 items-center justify-center bg-lavender px-6">
      <View className="items-center rounded-2xl bg-white p-8">
        <View className="mb-4 h-12 w-12 items-center justify-center rounded-full bg-purple-100">
          <Text className="text-xl font-bold text-purple-600">404</Text>
        </View>
        <Text className="text-lg font-semibold text-gray-900">Page not found</Text>
        <Text className="mt-2 text-center text-sm text-gray-500">
          The screen you are looking for does not exist or has been moved.
        </Text>
        <Link
          href="/today"
          className="mt-6 rounded-xl bg-purple-600 px-6 py-3"
          accessibilityLabel="Go to Today"
        >
          <Text className="text-sm font-medium text-white">Go to Today</Text>
        </Link>
      </View>
    </View>
  );
}
