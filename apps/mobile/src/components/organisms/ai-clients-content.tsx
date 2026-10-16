import { View } from 'react-native';

import type { AiClient } from '@/ai-clients/ai-clients';
import { Button } from '@/components/atoms/button';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { DashedCardFrame } from '@/components/molecules/empty-state-illustrations';
import { ReadFailure } from '@/components/molecules/read-failure';
import { shownDay } from '@/lib/shown-day';
import type { FocusedRead } from '@/lib/use-focused-read';

type AiClientsContentProps = {
  mcpServerUrl: string;
  copied: boolean;
  onCopy: () => void;
  aiClients: FocusedRead<{ status: 'loaded'; aiClients: AiClient[] }>;
  onTryAgain: () => void;
  onRevoke: (aiClient: AiClient) => void;
};

function AiClientRow({ aiClient, onRevoke }: { aiClient: AiClient; onRevoke: () => void }) {
  const allowed = `Allowed ${shownDay(aiClient.granted_at)}`;
  return (
    <Surface className="flex-row items-center gap-md">
      <View accessible accessibilityLabel={`${aiClient.client.name}, ${allowed}`} className="flex-1 gap-xs">
        <Text variant="body-strong" numberOfLines={1}>
          {aiClient.client.name}
        </Text>
        <Text variant="meta">{allowed}</Text>
      </View>
      <Button variant="danger" onPress={onRevoke}>
        <Text>Revoke</Text>
      </Button>
    </Surface>
  );
}

export function AiClientsContent({ mcpServerUrl, copied, onCopy, aiClients, onTryAgain, onRevoke }: AiClientsContentProps) {
  return (
    <>
      <Surface className="gap-sm">
        <View className="flex-row items-center gap-md">
          <View className="flex-1 gap-xs">
            <Text variant="body-strong">MCP server URL</Text>
            <Text className="text-text-muted">{mcpServerUrl}</Text>
          </View>
          <Button onPress={onCopy}>
            <Text>{copied ? 'Copied' : 'Copy'}</Text>
          </Button>
        </View>
        <Text variant="meta">Add it as a custom connector in your AI chat. You will sign in to mtgscan and allow it.</Text>
      </Surface>
      {aiClients.status === 'loaded' && aiClients.aiClients.length === 0 ? (
        <Text className="text-text-muted">No AI clients are connected.</Text>
      ) : null}
      {aiClients.status === 'loaded'
        ? aiClients.aiClients.map((aiClient) => (
            <AiClientRow key={aiClient.client.id} aiClient={aiClient} onRevoke={() => onRevoke(aiClient)} />
          ))
        : null}
      {aiClients.status === 'failed' ? (
        <ReadFailure
          illustration={<DashedCardFrame symbol="wifi.slash" />}
          title="Could not load the AI clients"
          onTryAgain={onTryAgain}
        />
      ) : null}
    </>
  );
}
