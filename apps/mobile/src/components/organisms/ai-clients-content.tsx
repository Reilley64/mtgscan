import type { AiClient, AiClientsRead } from '@/ai-clients/ai-clients';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { ActionRow } from '@/components/molecules/action-row';
import { DashedCardFrame } from '@/components/molecules/empty-state-illustrations';
import { ReadFailure } from '@/components/molecules/read-failure';
import { shownDay } from '@/lib/shown-day';

type AiClientsContentProps = {
  mcpServerUrl: string;
  copied: boolean;
  onCopy: () => void;
  aiClientsRead: AiClientsRead;
  revokingIds: string[];
  onTryAgain: () => void;
  onRevoke: (aiClient: AiClient) => void;
};

function AiClientList({ aiClientsRead, revokingIds, onTryAgain, onRevoke }: Omit<AiClientsContentProps, 'mcpServerUrl' | 'copied' | 'onCopy'>) {
  switch (aiClientsRead.status) {
    case 'loading':
      return null;
    case 'failed':
      return (
        <ReadFailure illustration={<DashedCardFrame symbol="wifi.slash" />} title="Could not load the AI clients" onTryAgain={onTryAgain} />
      );
    case 'loaded':
      return aiClientsRead.aiClients.length === 0 ? (
        <Text className="text-text-muted">No AI clients are connected.</Text>
      ) : (
        aiClientsRead.aiClients.map((aiClient) => (
          <Surface key={aiClient.id}>
            <ActionRow
              title={aiClient.name}
              detail={`Allowed ${shownDay(aiClient.allowedAt)}`}
              action={{ label: 'Revoke', variant: 'danger', busy: revokingIds.includes(aiClient.id), onPress: () => onRevoke(aiClient) }}
            />
          </Surface>
        ))
      );
  }
}

export function AiClientsContent({ mcpServerUrl, copied, onCopy, ...list }: AiClientsContentProps) {
  return (
    <>
      <Surface className="gap-sm">
        <ActionRow title="MCP server URL" detail={mcpServerUrl} action={{ label: copied ? 'Copied' : 'Copy', onPress: onCopy }} />
        <Text variant="meta">Add it as a custom connector in your AI chat. You will sign in to mtgscan and allow it.</Text>
      </Surface>
      <AiClientList {...list} />
    </>
  );
}
