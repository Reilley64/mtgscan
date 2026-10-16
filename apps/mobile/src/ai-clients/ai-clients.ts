import type { OAuthGrant } from '@supabase/supabase-js';
import * as Clipboard from 'expo-clipboard';

import { mcpServerUrl } from '@/lib/app-config';
import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';

export type AiClient = OAuthGrant;

async function readAiClients(): Promise<{ status: 'failed' } | { status: 'loaded'; aiClients: AiClient[] }> {
  const { data, error } = await supabase.auth.oauth.listGrants();
  return error ? { status: 'failed' } : { status: 'loaded', aiClients: data };
}

export function useAiClients() {
  return useFocusedRead(readAiClients);
}

export async function revokeAiClient(aiClient: AiClient): Promise<boolean> {
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId: aiClient.client.id });
  return !error;
}

export function copyMcpServerUrl(): Promise<boolean> {
  return Clipboard.setStringAsync(mcpServerUrl);
}
