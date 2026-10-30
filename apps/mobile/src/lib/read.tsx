import {
  callDatabaseFunction,
  type DatabaseFunction,
  type DatabaseFunctionResult,
  type ErrorCodeOf,
  type Refusal,
  type ReplyOf,
  type RequestArguments,
  type RequestOf,
} from '@mtgscan/supabase/database-function';
import {
  focusManager,
  infiniteQueryOptions,
  keepPreviousData,
  QueryClient,
  QueryClientProvider,
  queryOptions,
  skipToken,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
  type Updater,
} from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
}

export function ReadProvider({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!signedIn) {
      queryClient.clear();
    }
  }, [queryClient, signedIn]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

class RefusedRead<Code extends string = string> extends Error {
  constructor(readonly refusal: Refusal<Code>) {
    super(refusal.message);
  }
}

function replyOf<Contract extends DatabaseFunction>(result: DatabaseFunctionResult<Contract>): ReplyOf<Contract> {
  if (result.status === 'replied') {
    return result.reply;
  }
  throw result.status === 'refused' ? new RefusedRead(result.refusal) : result.error;
}

type ServerRead<Reply, Code extends string = never> = {
  key: QueryKey;
  read: () => Promise<Reply>;
  errorCodes?: readonly Code[];
};

export function databaseRead<Contract extends DatabaseFunction>(
  contract: Contract,
  ...request: RequestArguments<Contract>
): ServerRead<ReplyOf<Contract>, ErrorCodeOf<Contract>> {
  return {
    key: [contract.name, ...request],
    read: async () => replyOf(await callDatabaseFunction(supabase, contract, ...request)),
    errorCodes: contract.errorCodes,
  };
}

type Page<Item> = { items: Item[]; next_cursor: string | null };

export type PagedServerRead<FirstPage, Code extends string = never> = {
  key: QueryKey;
  readPage: (cursor: string | null) => Promise<FirstPage>;
  errorCodes?: readonly Code[];
};

export function pagedDatabaseRead<Contract extends DatabaseFunction>(
  contract: Contract,
  request: RequestOf<Contract> & object,
): PagedServerRead<ReplyOf<Contract>, ErrorCodeOf<Contract>> {
  return {
    key: [contract.name, request],
    readPage: async (cursor) => {
      const pageRequest: [RequestOf<Contract>] = [{ ...request, cursor }];
      return replyOf(await callDatabaseFunction(supabase, contract, ...pageRequest));
    },
    errorCodes: contract.errorCodes,
  };
}

export async function everyPage<Item>({ readPage }: PagedServerRead<Page<Item>, string>): Promise<Item[]> {
  const items: Item[] = [];
  let cursor: string | null = null;
  do {
    const page = await readPage(cursor);
    items.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor);
  return items;
}

type Refused<Code extends string> = [Code] extends [never] ? never : { status: 'refused'; code: Code; field: string | null };

type Loaded<Shown> = { status: 'loaded' } & Shown;

export type Read<Shown, Code extends string = never> = { status: 'loading' } | { status: 'failed' } | Refused<Code> | Loaded<Shown>;

type ReadRules<Code extends string> = {
  key?: QueryKey;
  keepsShown?: boolean;
  refused?: readonly Code[];
  whenAppActive?: boolean;
  staleTime?: number;
};

const loading = { status: 'loading' } as const;

const failed = { status: 'failed' } as const;

function readOf<Shown, Code extends string>(
  { data, error }: { data: Loaded<Shown> | undefined; error: unknown },
  refused: readonly Code[] | undefined,
): Read<Shown, Code> {
  if (error instanceof RefusedRead && refused?.some((code) => code === error.refusal.code)) {
    return { status: 'refused', code: error.refusal.code, field: error.refusal.field } as Refused<Code>;
  }
  if (data !== undefined) {
    return data;
  }
  return error ? failed : loading;
}

function ruleOptions<Code extends string>(sourceKey: QueryKey | undefined, noReadKey: QueryKey, rules: ReadRules<Code>) {
  return {
    queryKey: sourceKey ? [...sourceKey, ...(rules.key ?? [])] : noReadKey,
    ...(rules.keepsShown ? { placeholderData: keepPreviousData } : {}),
    ...(rules.whenAppActive ? { refetchOnWindowFocus: true } : {}),
    ...(rules.staleTime === undefined ? {} : { staleTime: rules.staleTime }),
  };
}

const keptWhileHidden = { enabled: false, notifyOnChangeProps: [] };

function useOneRead<Reply, Shown, Code extends string, Refusable extends Code>(
  source: ServerRead<Reply, Code> | null,
  shown: (reply: Reply) => Shown,
  rules: ReadRules<Refusable>,
  subscribed: boolean,
) {
  const queryClient = useQueryClient();
  const select = useCallback((reply: Reply): Loaded<Shown> => ({ status: 'loaded', ...shown(reply) }), [shown]);
  const options = queryOptions({ ...ruleOptions(source?.key, ['no read'], rules), queryFn: source ? source.read : skipToken, select });
  const query = useQuery({ ...options, subscribed });
  useQuery({ ...options, ...keptWhileHidden });
  const { refetch } = query;
  const reload = useCallback(async () => {
    const next = await refetch();
    return next.isSuccess ? next.data : null;
  }, [refetch]);
  const replaceReply = (update: Updater<Reply | undefined, Reply | undefined>) => queryClient.setQueryData(options.queryKey, update);
  return { read: readOf(query, rules.refused), reload, replaceReply };
}

export function useScreenRead<Reply, Shown, Code extends string, const Refusable extends Code = never>(
  source: ServerRead<Reply, Code> | null,
  shown: (reply: Reply) => Shown,
  rules: ReadRules<Refusable> = {},
) {
  return useOneRead(source, shown, rules, useIsFocused());
}

export function useAppRead<Reply, Shown, Code extends string, const Refusable extends Code = never>(
  source: ServerRead<Reply, Code> | null,
  shown: (reply: Reply) => Shown,
  rules: ReadRules<Refusable> = {},
) {
  return useOneRead(source, shown, rules, true);
}

export function useFetchRead() {
  const queryClient = useQueryClient();
  return useCallback(
    <Reply,>(source: ServerRead<Reply, string>) => queryClient.fetchQuery({ queryKey: source.key, queryFn: source.read }),
    [queryClient],
  );
}

type LoadedPages<FirstPage extends Page<unknown>> = {
  firstPage: FirstPage;
  items: FirstPage['items'];
  nextCursor: string | null;
  loadingMore: boolean;
};

export type PagedRead<FirstPage extends Page<unknown>, Code extends string = never> = Read<LoadedPages<FirstPage>, Code>;

function loadedPages<FirstPage extends Page<unknown>>({ pages }: InfiniteData<FirstPage>): Loaded<LoadedPages<FirstPage>> {
  return {
    status: 'loaded',
    firstPage: pages[0]!,
    items: pages.flatMap((page) => page.items),
    nextCursor: pages.at(-1)!.next_cursor,
    loadingMore: false,
  };
}

function isExpiredCursor(error: unknown) {
  return error instanceof RefusedRead && error.refusal.code === 'invalid_cursor';
}

type PagedReadRules<Code extends string> = ReadRules<Code> & {
  restartsOnFocus?: boolean;
};

export function usePagedScreenRead<FirstPage extends Page<unknown>, Code extends string, const Refusable extends Code = never>(
  source: PagedServerRead<FirstPage, Code> | null,
  { restartsOnFocus = false, ...rules }: PagedReadRules<Refusable> = {},
) {
  const queryClient = useQueryClient();
  const focused = useIsFocused();
  const options = infiniteQueryOptions({
    ...ruleOptions(source?.key, ['no paged read'], rules),
    ...(restartsOnFocus ? { refetchOnMount: false } : {}),
    queryFn: source ? ({ pageParam }) => source.readPage(pageParam) : skipToken,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    select: loadedPages,
  });
  const query = useInfiniteQuery({ ...options, subscribed: focused });
  useInfiniteQuery({ ...options, ...keptWhileHidden });

  const restart = useEffectEvent(() => {
    if (source) {
      void queryClient.infiniteQuery({ ...options, pages: 1, staleTime: 0 }).catch(() => {});
    }
  });

  useEffect(() => {
    if (restartsOnFocus && focused) {
      restart();
    }
  }, [restartsOnFocus, focused]);

  const { data, error, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } = query;

  const read: PagedRead<FirstPage, Refusable> = readOf(
    { data: data && { ...data, loadingMore: isFetchingNextPage }, error },
    rules.refused,
  );

  const reload = useCallback(() => void refetch(), [refetch]);

  const loadMore = useCallback(() => {
    if (!hasNextPage) {
      return;
    }
    void fetchNextPage({ cancelRefetch: false }).then((next) => {
      if (isExpiredCursor(next.error)) {
        void refetch();
      }
    });
  }, [fetchNextPage, hasNextPage, refetch]);

  return { read, reload, loadMore };
}

export function useReadAgain() {
  const queryClient = useQueryClient();
  return useCallback((key: QueryKey) => void queryClient.invalidateQueries({ queryKey: key }), [queryClient]);
}

const typingPause = 300;

export function useTypingPause(text: string) {
  const [pausedText, setPausedText] = useState(text);

  if (text === '' && pausedText !== '') {
    setPausedText('');
  }

  useEffect(() => {
    const pause = setTimeout(() => setPausedText(text), typingPause);
    return () => clearTimeout(pause);
  }, [text]);

  return [pausedText, setPausedText] as const;
}
