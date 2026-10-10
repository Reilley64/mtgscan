import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from 'npm:@supabase/server@^1';

const maxTextLength = 200;
const session = new Supabase.ai.Session('gte-small');

function invalidText(message: string): Response {
  return Response.json({ code: 'invalid_argument', message, field: 'text' }, { status: 400 });
}

export default {
  fetch: withSupabase({ auth: 'secret' }, async (request) => {
    const body = await request.json().catch(() => null);
    const text = body?.text;
    if (typeof text !== 'string' || text.trim().length === 0 || text.length > maxTextLength) {
      return invalidText(`Send text of 1 to ${maxTextLength} characters.`);
    }
    const embedding = await session.run(text, { mean_pool: true, normalize: true });
    return Response.json({ embedding });
  }),
};
