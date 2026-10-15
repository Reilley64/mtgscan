import { Image } from 'expo-image';
import { cssInterop } from 'nativewind';

cssInterop(Image, { className: { target: 'style', nativeStyleToProp: { color: 'tintColor' } } });

export { Image as TintedImage };
