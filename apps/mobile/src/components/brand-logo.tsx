import { Image, View } from 'react-native';

const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL ?? 'https://fazoo-rpp2.vercel.app').replace(/\/$/, '');

function logoUri(path: string): string {
  return /^https?:\/\//.test(path) ? path : `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function BrandLogo({
  name,
  slug,
  logoUrl,
}: {
  name: string;
  slug: string;
  logoUrl: string | null;
}) {
  if (!logoUrl) return null;

  return (
    <View className="h-16 overflow-hidden rounded-xl border border-ink/5 bg-white">
      <Image
        source={{ uri: logoUri(logoUrl) }}
        accessibilityLabel={`${name} logo`}
        className="h-full w-full"
        resizeMode={slug === 'lenovo-nigeria' ? 'cover' : 'contain'}
      />
    </View>
  );
}
