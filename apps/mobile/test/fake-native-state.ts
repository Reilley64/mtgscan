import type * as SwiftUI from '@expo/ui/swift-ui';
import { useState } from 'react';

const swiftUI = jest.requireActual<typeof SwiftUI>('@expo/ui/swift-ui');

const nativeStateValues = new Map<number, unknown>();

function useFakeNativeState<T>(initialValue: T) {
  const [state] = useState(() => {
    const id = nativeStateValues.size + 1;
    nativeStateValues.set(id, initialValue);
    return { __expo_shared_object_id__: id };
  });
  return state as unknown as ReturnType<typeof swiftUI.useNativeState<T>>;
}

export const fakeSwiftUI = { ...swiftUI, useNativeState: useFakeNativeState };

export function nativeStateValue(id: number) {
  return nativeStateValues.get(id);
}

export function setNativeStateValue(id: number, value: unknown) {
  nativeStateValues.set(id, value);
}

export function resetFakeNativeState() {
  nativeStateValues.clear();
}
