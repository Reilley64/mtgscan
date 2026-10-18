import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';

import { mcpServerUrl } from '@/lib/app-config';
import { supabase } from '@/lib/supabase';
import { useFocusedRead, type FocusedRead } from '@/lib/use-focused-read';

export type AiClient = { id: string; name: string; allowedAt: string };

type AiClientsLoaded = { status: 'loaded'; aiClients: AiClient[] };

export type AiClientsRead = FocusedRead<AiClientsLoaded>;

async function readAiClients(): Promise<AiClientsLoaded> {
  const { data, error } = await supabase.auth.oauth.listGrants();
  if (error) {
    throw error;
  }
  return {
    status: 'loaded',
    aiClients: data.map((grant) => ({ id: grant.client.id, name: grant.client.name, allowedAt: grant.granted_at })),
  };
}

export function useAiClients() {
  const { read, reload } = useFocusedRead(readAiClients);
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
