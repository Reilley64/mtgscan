import { Alert } from 'react-native';

export function resetFakeAlert() {
  jest.spyOn(Alert, 'alert').mockReset();
}
