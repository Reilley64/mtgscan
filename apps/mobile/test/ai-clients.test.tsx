import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { textOnTheClipboard } from './fake-clipboard';
import {
  aiClientsRevokedOnTheServer,
  allowAiClients,
  failAiClientReads,
  failAiClientRevokes,
  holdAiClientRevokes,
  startSignedIn,
} from './fake-supabase';
import {
  appearsBefore,
  drawerBackButton,
  openSettings,
  pressAlertButton,
  pressDrawerBack,
  presentedAlert,
  presentedAlertButtonStyles,
} from './native-ui';
import { renderApp } from './render-app';
import { tokenColors } from './token-colors';

const mcpServerUrl = 'https://abcdefghijklmnop.supabase.co/functions/v1/mcp';

async function openAiClientsList() {
  await renderApp();
  await openSettings();
  await fireEvent.press(await screen.findByRole('button', { name: /^AI clients/ }));
  return screen.findByRole('header', { name: 'AI clients' });
}

async function openAiClientsListWithChatGPT() {
  await openAiClientsList();
  await screen.findByLabelText(/^ChatGPT, Allowed/);
}

function aiClientRow(name: string) {
  return screen.getByLabelText(new RegExp(`^${name}, Allowed`)).parent!;
}

async function pressRevoke(name: string) {
  await fireEvent.press(within(aiClientRow(name)).getByRole('button', { name: 'Revoke' }));
}

beforeEach(() => {
  startSignedIn();
});

describe('the AI clients row', () => {
  test('the settings drawer has an AI clients row under the Currency row, with the number of connected AI clients', async () => {
    allowAiClients([{ name: 'ChatGPT', allowedAt: '2026-10-16T02:00:00Z' }]);
    await renderApp();
    await openSettings();

    const row = await screen.findByRole('button', { name: 'AI clients, 1' });
    expect(within(row).getByText('AI clients')).toBeOnTheScreen();
    expect(within(row).getByText('1')).toHaveStyle({ color: tokenColors.textMuted });
    expect(appearsBefore(screen.getByRole('button', { name: /^Currency/ }), row)).toBe(true);
    expect(appearsBefore(row, screen.getByRole('switch', { name: 'Scan sounds' }))).toBe(true);
  });

  test('the AI clients row pushes the AI clients list inside the drawer, with the back button Settings', async () => {
    expect(await openAiClientsList()).toBeOnTheScreen();

    expect(drawerBackButton()).toEqual({ label: 'Settings' });
  });

  test('the AI clients row shows no number while the AI clients cannot load', async () => {
    failAiClientReads(1);
    await renderApp();
    await openSettings();

    expect(await screen.findByRole('button', { name: 'AI clients' })).toBeOnTheScreen();
  });
});

describe('the MCP server URL', () => {
  test('the AI clients list shows the MCP server URL in text muted, a Copy button, and how to add it', async () => {
    await openAiClientsList();

    expect(screen.getByText('MCP server URL')).toBeOnTheScreen();
    expect(screen.getByText(mcpServerUrl)).toHaveStyle({ color: tokenColors.textMuted });
    expect(screen.getByRole('button', { name: 'Copy' })).toBeOnTheScreen();
    expect(
      screen.getByText('Add it as a custom connector in your AI chat. You will sign in to mtgscan and allow it.'),
    ).toBeOnTheScreen();
  });

  test('Copy copies the MCP server URL and shows that it did', async () => {
    await openAiClientsList();

    await fireEvent.press(screen.getByRole('button', { name: 'Copy' }));

    expect(textOnTheClipboard()).toBe(mcpServerUrl);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeOnTheScreen();
  });
});

describe('the AI clients list', () => {
  test('the list shows one row per AI client with its name and the day the user allowed it', async () => {
    allowAiClients([
      { name: 'ChatGPT', allowedAt: '2026-10-16T02:00:00Z' },
      { name: 'Claude', allowedAt: '2026-10-03T09:30:00Z' },
    ]);

    await openAiClientsList();

    expect(await screen.findByLabelText('ChatGPT, Allowed 16 October 2026')).toBeOnTheScreen();
    expect(within(aiClientRow('ChatGPT')).getByText('Allowed 16 October 2026')).toBeOnTheScreen();
    expect(screen.getByLabelText('Claude, Allowed 3 October 2026')).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Revoke' })).toHaveLength(2);
  });

  test('with no AI clients, the row shows 0 and the list says that none are connected', async () => {
    await renderApp();
    await openSettings();
    await fireEvent.press(await screen.findByRole('button', { name: 'AI clients, 0' }));

    expect(await screen.findByText('No AI clients are connected.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeOnTheScreen();
  });

  test('when the AI clients cannot load, the list says so, and Try again reads them again', async () => {
    allowAiClients([{ name: 'ChatGPT', allowedAt: '2026-10-16T02:00:00Z' }]);
    failAiClientReads(2);
    await openAiClientsList();

    expect(await screen.findByText('Could not load the AI clients')).toBeOnTheScreen();
    expect(screen.queryByText('No AI clients are connected.')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByLabelText('ChatGPT, Allowed 16 October 2026')).toBeOnTheScreen();
    expect(screen.queryByText('Could not load the AI clients')).not.toBeOnTheScreen();
  });
});

describe('Revoke', () => {
  beforeEach(() => {
    allowAiClients([
      { name: 'ChatGPT', allowedAt: '2026-10-16T02:00:00Z' },
      { name: 'Claude', allowedAt: '2026-10-03T09:30:00Z' },
    ]);
  });

  test('Revoke asks first, with a destructive Revoke and Cancel', async () => {
    await openAiClientsListWithChatGPT();

    await pressRevoke('ChatGPT');

    expect(presentedAlert()).toEqual({
      title: 'Revoke ChatGPT?',
      message: 'It loses access to your mtgscan data at once.',
      buttons: ['Revoke', 'Cancel'],
    });
    expect(presentedAlertButtonStyles()).toEqual([
      { text: 'Revoke', style: 'destructive' },
      { text: 'Cancel', style: 'cancel' },
    ]);
    expect(aiClientsRevokedOnTheServer()).toEqual([]);
  });

  test('Revoke in the alert revokes the AI client and removes its row', async () => {
    await openAiClientsListWithChatGPT();

    await pressRevoke('ChatGPT');
    await pressAlertButton('Revoke');

    expect(aiClientsRevokedOnTheServer()).toEqual(['ai-client-1']);
    await waitFor(() => expect(screen.queryByLabelText(/^ChatGPT, Allowed/)).not.toBeOnTheScreen());
    expect(screen.getByLabelText('Claude, Allowed 3 October 2026')).toBeOnTheScreen();
  });

  test('after a revoke, the AI clients row in settings shows the new number', async () => {
    await openAiClientsListWithChatGPT();
    await pressRevoke('ChatGPT');
    await pressAlertButton('Revoke');
    await waitFor(() => expect(screen.queryByLabelText(/^ChatGPT, Allowed/)).not.toBeOnTheScreen());

    await pressDrawerBack();

    expect(await screen.findByRole('button', { name: 'AI clients, 1' })).toBeOnTheScreen();
  });

  test('a revoke that works removes the row even when the AI clients cannot be read again', async () => {
    await openAiClientsListWithChatGPT();
    failAiClientReads(1);

    await pressRevoke('ChatGPT');
    await pressAlertButton('Revoke');

    expect(aiClientsRevokedOnTheServer()).toEqual(['ai-client-1']);
    await waitFor(() => expect(screen.queryByLabelText(/^ChatGPT, Allowed/)).not.toBeOnTheScreen());
    expect(screen.queryByText('Could not load the AI clients')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Claude, Allowed 3 October 2026')).toBeOnTheScreen();
  });

  test('while a revoke runs, its Revoke button is busy and cannot be tapped again', async () => {
    const revokes = holdAiClientRevokes();
    await openAiClientsListWithChatGPT();

    await pressRevoke('ChatGPT');
    await pressAlertButton('Revoke');

    const revoking = within(aiClientRow('ChatGPT')).getByRole('button', { name: 'Revoke' });
    expect(revoking).toBeBusy();
    expect(revoking).toBeDisabled();
    expect(within(aiClientRow('Claude')).getByRole('button', { name: 'Revoke' })).toBeEnabled();
    await revokes.finish();
    expect(screen.queryByLabelText(/^ChatGPT, Allowed/)).not.toBeOnTheScreen();
    expect(aiClientsRevokedOnTheServer()).toEqual(['ai-client-1']);
  });

  test('Cancel in the alert keeps the AI client', async () => {
    await openAiClientsListWithChatGPT();

    await pressRevoke('ChatGPT');
    await pressAlertButton('Cancel');

    expect(aiClientsRevokedOnTheServer()).toEqual([]);
    expect(screen.getByLabelText('ChatGPT, Allowed 16 October 2026')).toBeOnTheScreen();
  });

  test('when a revoke fails, the row stays and an alert says so', async () => {
    failAiClientRevokes(1);
    await openAiClientsListWithChatGPT();

    await pressRevoke('ChatGPT');
    await pressAlertButton('Revoke');

    expect(presentedAlert()).toEqual({ title: 'Could not revoke ChatGPT', message: 'Check your connection.', buttons: ['OK'] });
    expect(screen.getByLabelText('ChatGPT, Allowed 16 October 2026')).toBeOnTheScreen();
  });
});
