import { SQL } from 'bun';
import { describe, expect, setDefaultTimeout, test } from 'bun:test';

import { claimsOf, connectAiClient, mcpServerUrl } from './ai-clients';
import {
  anonymousClient,
  asDatabaseOwner,
  asDatabaseRole,
  localStackUrl,
  signUpNewUser,
  tokenClient,
  type TestUser,
} from './local-stack';

setDefaultTimeout(60_000);

type Claims = Record<string, string | string[]>;

function tokenEvent(claims: Record<string, unknown>) {
  return {
    user_id: crypto.randomUUID(),
    authentication_method: 'oauth_provider/authorization_code',
    claims: {
      iss: `${localStackUrl}/auth/v1`,
      aud: 'authenticated',
      sub: crypto.randomUUID(),
      role: 'authenticated',
      session_id: crypto.randomUUID(),
      ...claims,
    },
  };
}

async function hookAnswer(event: object) {
  const auth = new SQL('postgresql://supabase_auth_admin:postgres@127.0.0.1:54322/postgres');
  try {
    const [{ answer }] = await auth`select public.set_mcp_audience(${event}::jsonb) as answer`;
    return answer;
  } finally {
    await auth.close();
  }
}

async function aiClientClaims(user: TestUser): Promise<Claims> {
  return claimsOf((await connectAiClient(user)).token) as Claims;
}

function beginMcpCalls(claims: Claims, count: number) {
  return asDatabaseRole('authenticated', claims, async (database) => {
    for (let call = 1; call <= count; call += 1) {
      try {
        await database.savepoint((call) => call`select public.begin_mcp_call('get_deck')`);
      } catch (error) {
        return { call, error: JSON.parse((error as Error).message) };
      }
    }
    return { call: count, error: null };
  });
}

function seedDayCount(user: TestUser, count: number) {
  return asDatabaseOwner(
    (database) => database`
      insert into public.mcp_call_counts (user_id, period, period_start, count)
      values (${user.userId}, 'day', date_trunc('day', now(), 'UTC'), ${count})
    `,
  );
}

describe('the access token hook', () => {
  test("adds the MCP server URL to the audience of an AI client's token", async () => {
    const event = tokenEvent({ client_id: crypto.randomUUID() });

    expect(await hookAnswer(event)).toEqual({ ...event, claims: { ...event.claims, aud: ['authenticated', mcpServerUrl] } });
  });

  test("leaves the app's token unchanged", async () => {
    const event = tokenEvent({});

    expect(await hookAnswer(event)).toEqual(event);
  });

  test("Supabase Auth issues an AI client's token with the MCP server URL in its audience and the app's token without it", async () => {
    const user = await signUpNewUser();
    const { data } = await user.client.auth.getSession();

    expect((await aiClientClaims(user)).aud).toEqual(['authenticated', mcpServerUrl]);
    expect(claimsOf(data.session!.access_token).aud).toBe('authenticated');
  });
});

describe('beginning an MCP call', () => {
  test("refuses the app's token", async () => {
    const user = await signUpNewUser();

    expect((await user.client.rpc('begin_mcp_call', { tool: 'get_deck' })).error).toMatchObject({
      code: 'unauthorized',
      message: "Only an AI client's token can call the MCP server.",
    });
  });

  test("accepts an AI client's token and refuses it once the user revokes the AI client", async () => {
    const user = await signUpNewUser();
    const aiClient = await connectAiClient(user);
    const dataApi = tokenClient(aiClient.token);

    expect((await dataApi.rpc('begin_mcp_call', { tool: 'get_deck' })).error).toBeNull();
    expect((await user.client.auth.oauth.revokeGrant({ clientId: aiClient.clientId })).error).toBeNull();
    expect((await dataApi.rpc('begin_mcp_call', { tool: 'get_deck' })).error).toMatchObject({
      code: 'unauthorized',
      message: "This AI client's session has ended. Connect it again in your AI chat.",
    });
  });

  test('refuses the 121st tool call in a minute and says how long to wait', async () => {
    const user = await signUpNewUser();

    const { call, error } = await beginMcpCalls(await aiClientClaims(user), 121);

    expect(call).toBe(121);
    expect(error).toMatchObject({ code: 'rate_limited', message: 'You can make 120 tool calls a minute. Wait, then try again.' });
    expect(JSON.parse(error.details).retry_after_seconds).toBeWithin(1, 61);
  });

  test('refuses the 2,001st tool call in a day and says how long to wait', async () => {
    const user = await signUpNewUser();
    const claims = await aiClientClaims(user);
    await seedDayCount(user, 1999);

    const { call, error } = await beginMcpCalls(claims, 2);

    expect(call).toBe(2);
    expect(error).toMatchObject({ code: 'rate_limited', message: 'You can make 2000 tool calls a day. Wait, then try again.' });
    expect(JSON.parse(error.details).retry_after_seconds).toBeWithin(1, 86_401);
  });

  test("counts each user's tool calls apart", async () => {
    const limited = await signUpNewUser();
    const other = await signUpNewUser();
    await seedDayCount(limited, 2000);

    expect((await beginMcpCalls(await aiClientClaims(limited), 1)).error).toMatchObject({ code: 'rate_limited' });
    expect((await beginMcpCalls(await aiClientClaims(other), 120)).error).toBeNull();
  });

  test('checks the session of a request that is not a tool call but does not count it', async () => {
    const user = await signUpNewUser();
    const claims = await aiClientClaims(user);
    await seedDayCount(user, 2000);

    const counted = await asDatabaseRole('authenticated', claims, (database) => database`select public.begin_mcp_call(null)`);

    expect(counted).toHaveLength(1);
  });

  test('only the user reads their MCP call counts, and nobody writes them directly', async () => {
    const user = await signUpNewUser();
    const other = await signUpNewUser();
    await seedDayCount(user, 5);

    expect((await user.client.from('mcp_call_counts').select('period, count')).data).toEqual([{ period: 'day', count: 5 }]);
    expect((await other.client.from('mcp_call_counts').select()).data).toEqual([]);
    expect((await anonymousClient().from('mcp_call_counts').select()).error?.code).toBe('42501');
    expect(
      (await user.client.from('mcp_call_counts').insert({ user_id: user.userId, period: 'minute', period_start: new Date().toISOString(), count: 0 }))
        .error?.code,
    ).toBe('42501');
  });
});
