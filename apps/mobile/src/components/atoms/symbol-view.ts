import { SymbolView } from 'expo-symbols';
import { cssInterop } from 'nativewind';

cssInterop(SymbolView, { className: { target: 'style', nativeStyleToProp: { color: 'tintColor' } } });

export { SymbolView };
