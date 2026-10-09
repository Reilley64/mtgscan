import { resetFakeSupabase } from './fake-supabase';

jest.mock('@/lib/supabase', () => ({
  supabase: jest.requireActual('./fake-supabase').fakeSupabase,
}));

beforeEach(() => {
  resetFakeSupabase();
});
