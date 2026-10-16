import { useState } from 'react';
import { Alert } from 'react-native';

import { copyMcpServerUrl, revokeAiClient, useAiClients, type AiClient } from '@/ai-clients/ai-clients';
import { AiClientsContent } from '@/components/organisms/ai-clients-content';
import { DrawerSheet } from '@/components/templates/drawer-sheet';
import { mcpServerUrl } from '@/lib/app-config';

export default function AiClientsScreen() {
  const { read, reload } = useAiClients();
  const [copied, setCopied] = useState(false);

  async function copy() {
    setCopied(await copyMcpServerUrl());
  }

  async function revoke(aiClient: AiClient) {
    if (await revokeAiClient(aiClient)) {
      reload();
    } else {
      Alert.alert(`Could not revoke ${aiClient.client.name}`, 'Check your connection.');
    }
  }

  function confirmRevoke(aiClient: AiClient) {
    Alert.alert(`Revoke ${aiClient.client.name}?`, 'It loses access to your mtgscan data at once.', [
      { text: 'Revoke', style: 'destructive', onPress: () => void revoke(aiClient) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <DrawerSheet title="AI clients">
      <AiClientsContent
        mcpServerUrl={mcpServerUrl}
        copied={copied}
        onCopy={() => void copy()}
        aiClients={read}
        onTryAgain={reload}
        onRevoke={confirmRevoke}
      />
    </DrawerSheet>
  );
}
