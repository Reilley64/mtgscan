export function supabaseUrl() {
  return process.env.EXPO_PUBLIC_SUPABASE_URL!;
}

export function supabasePublishableKey() {
  return process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
}

export function mcpServerUrl() {
  return `${supabaseUrl()}/functions/v1/mcp`;
}
