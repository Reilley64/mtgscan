import type { z } from 'zod';

import type { Database } from './database.types.ts';

type Functions = Database['public']['Functions'];

type DatabaseFunctionError = { code: string; message: string; details: string; hint: string };

type DatabaseFunctionResponse = { data: unknown; error: DatabaseFunctionError | null };

export type DatabaseClient = { rpc(name: string, args: object): PromiseLike<DatabaseFunctionResponse> };

type ArgumentKey = 'query' | 'request' | 'batch';

type ArgumentOf<Name extends keyof Functions> = Name extends keyof Functions
  ? [Extract<keyof Functions[Name]['Args'], ArgumentKey>] extends [never]
    ? null
    : Extract<keyof Functions[Name]['Args'], ArgumentKey>
  : never;

export type DatabaseFunction<
  Name extends keyof Functions = keyof Functions,
  Request extends z.ZodType = z.ZodType,
  Reply extends z.ZodType = z.ZodType,
  Code extends string = string,
> = {
  name: Name;
  argument: ArgumentOf<Name>;
  request: Request;
  reply: Reply;
  errorCodes: readonly Code[];
};

export type RequestOf<Contract extends DatabaseFunction> = z.input<Contract['request']>;

export type ReplyOf<Contract extends DatabaseFunction> = z.output<Contract['reply']>;

export type ErrorCodeOf<Contract extends DatabaseFunction> = Contract['errorCodes'][number];

export type Refusal<Code extends string = string> = {
  code: Code;
  message: string;
  field: string | null;
};

export type DatabaseFunctionResult<Contract extends DatabaseFunction> =
  | { status: 'replied'; reply: ReplyOf<Contract> }
  | { status: 'refused'; refusal: Refusal<ErrorCodeOf<Contract>> }
  | { status: 'failed'; error: DatabaseFunctionError };

export type RequestArguments<Contract extends DatabaseFunction> = undefined extends RequestOf<Contract>
  ? [request?: RequestOf<Contract>]
  : [request: RequestOf<Contract>];

export function databaseFunction<
  const Name extends keyof Functions,
  Request extends z.ZodType,
  Reply extends z.ZodType,
  const Code extends string,
>(contract: DatabaseFunction<Name, Request, Reply, Code>): DatabaseFunction<Name, Request, Reply, Code> {
  return contract;
}

export async function callDatabaseFunction<Contract extends DatabaseFunction>(
  client: DatabaseClient,
  contract: Contract,
  ...[request]: RequestArguments<Contract>
): Promise<DatabaseFunctionResult<Contract>> {
  const args = contract.argument === null || request === undefined ? {} : { [contract.argument]: request };
  return databaseFunctionResult(contract, await client.rpc(contract.name, args));
}

export function databaseFunctionResult<Contract extends DatabaseFunction>(
  contract: Contract,
  { data, error }: DatabaseFunctionResponse,
): DatabaseFunctionResult<Contract> {
  if (!error) {
    return { status: 'replied', reply: data as ReplyOf<Contract> };
  }
  const refusal = refusalOf<ErrorCodeOf<Contract>>(error, contract.errorCodes);
  return refusal ? { status: 'refused', refusal } : { status: 'failed', error };
}

export function refusalOf<Code extends string>(error: DatabaseFunctionError, codes: readonly Code[]): Refusal<Code> | null {
  const code = codes.find((each) => each === error.code);
  return code === undefined ? null : { code, message: error.message, field: error.details || null };
}
