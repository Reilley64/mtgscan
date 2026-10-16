import { useState } from 'react';
import { Alert } from 'react-native';

import { copyMcpServerUrl, useAiClients, type AiClient } from '@/ai-clients/ai-clients';
import { AiClientsContent } from '@/components/organisms/ai-clients-content';
import { DrawerSheet } from '@/components/templates/drawer-sheet';
import { mcpServerUrl } from '@/lib/app-config';

export default function AiClientsScreen() {
  const { aiClientsRead, reload, revokingIds, revoke } = useAiClients();
  const [copied, setCopied] = useState(false);

  async function copy() {
    setCopied(await copyMcpServerUrl());
  }

  async function revokeOrSayItFailed(aiClient: AiClient) {
    if (!(await revoke(aiClient))) {
      Alert.alert(`Could not revoke ${aiClient.name}`, 'Check your connection.');
    }
  }

  function confirmRevoke(aiClient: AiClient) {
    Alert.alert(`Revoke ${aiClient.name}?`, 'It loses access to your mtgscan data at once.', [
      { text: 'Revoke', style: 'destructive', onPress: () => void revokeOrSayItFailed(aiClient) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <DrawerSheet title="AI clients">
      <AiClientsContent
        mcpServerUrl={mcpServerUrl()}
        copied={copied}
        onCopy={() => void copy()}
        aiClientsRead={aiClientsRead}
        revokingIds={revokingIds}
        onTryAgain={reload}
        onRevoke={confirmRevoke}
      />
    </DrawerSheet>
  );
}
