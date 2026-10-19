import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';

import { mcpServerUrl } from '@/lib/app-config';
import { supabase } from '@/lib/supabase';
import { useScreenRead, type Read } from '@/lib/read';

export type AiClient = { id: string; name: string; allowedAt: string };

type AiClientsLoaded = { status: 'loaded'; aiClients: AiClient[] };

export type AiClientsRead = Read<AiClientsLoaded>;

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

function loadedAiClients(aiClients: AiClient[]): AiClientsLoaded {
  return { status: 'loaded', aiClients };
}

export function useAiClients() {
  const { read, reload } = useScreenRead(allowedAiClients, loadedAiClients);
  const [revokedIds, setRevokedIds] = useState<string[]>([]);
  const [revokingIds, setRevokingIds] = useState<string[]>([]);

  const aiClientsRead: AiClientsRead =
    read.status === 'loaded' ? { ...read, aiClients: read.aiClients.filter(({ id }) => !revokedIds.includes(id)) } : read;

  async function revoke(aiClient: AiClient): Promise<boolean> {
    setRevokingIds((ids) => [...ids, aiClient.id]);
    const { error } = await supabase.auth.oauth.revokeGrant({ clientId: aiClient.id });
    setRevokingIds((ids) => ids.filter((id) => id !== aiClient.id));
    if (!error) {
      setRevokedIds((ids) => [...ids, aiClient.id]);
    }
    return !error;
  }

  return { aiClientsRead, reload, revokingIds, revoke };
}

export function copyMcpServerUrl(): Promise<boolean> {
  return Clipboard.setStringAsync(mcpServerUrl());
}
