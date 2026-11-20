import { nativeCollectionSearch, type NativeSearchInput } from './native-collection-search';

Object.assign(globalThis, {
  mtgscanCollectionSearch(input: string) {
    return JSON.stringify(nativeCollectionSearch(JSON.parse(input) as NativeSearchInput));
  },
});
