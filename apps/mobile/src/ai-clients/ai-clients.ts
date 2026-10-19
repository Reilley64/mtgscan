import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';

import { mcpServerUrl } from '@/lib/app-config';
import { supabase } from '@/lib/supabase';
import { useScreenRead, type Read } from '@/lib/read';

export type AiClient = { id: string; name: string; allowedAt: string };

export type AiClientsRead = Read<{ aiClients: AiClient[] }>;

const allowedAiClients = {
  key: ['ai_clients'],
  read: async (): Promise<AiClient[]> => {
    const { data, error } = await supabase.auth.oauth.listGrants();
    if (error) {
      throw error;
    }
    return data.map((grant) => ({ id: grant.client.id, name: grant.client.name, allowedAt: grant.granted_at }));
  },
};

function loadedAiClients(aiClients: AiClient[]) {
  return { aiClients };
}

export function useAiClients() {
  const { read: aiClientsRead, reload, replaceReply } = useScreenRead(allowedAiClients, loadedAiClients);
  const [revokingIds, setRevokingIds] = useState<string[]>([]);

  async function revoke(aiClient: AiClient): Promise<boolean> {
    setRevokingIds((ids) => [...ids, aiClient.id]);
    const { error } = await supabase.auth.oauth.revokeGrant({ clientId: aiClient.id });
    setRevokingIds((ids) => ids.filter((id) => id !== aiClient.id));
    if (!error) {
      replaceReply((aiClients) => aiClients?.filter(({ id }) => id !== aiClient.id));
    }
    return !error;
  }

  return { aiClientsRead, reload, revokingIds, revoke };
}

export function copyMcpServerUrl(): Promise<boolean> {
  return Clipboard.setStringAsync(mcpServerUrl());
}
