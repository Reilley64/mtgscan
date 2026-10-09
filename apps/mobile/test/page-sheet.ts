import { fireEvent, screen } from 'expo-router/testing-library';

export async function swipeDownPageSheet() {
  const [sheet] = screen.container.queryAll(
    (instance) => instance.type === 'RNSModalScreen' && instance.props.stackPresentation === 'pageSheet',
  );
  if (!sheet) {
    throw new Error('No page sheet is open');
  }
  await fireEvent(sheet, 'dismissed', { nativeEvent: { dismissCount: 1 } });
}
