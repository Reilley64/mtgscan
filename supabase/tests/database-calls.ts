import { z } from 'zod';

import {
  callDatabaseFunction,
  type DatabaseFunction,
  type DatabaseFunctionResult,
  type ReplyOf,
  type RequestArguments,
} from '../database-function';
import type { AppClient } from './local-stack';

export function parsed<Contract extends DatabaseFunction>(
  contract: Contract,
  result: DatabaseFunctionResult<Contract>,
): DatabaseFunctionResult<Contract> {
  if (result.status !== 'replied') {
    return result;
  }
  return { status: 'replied', reply: z.parse<Contract['reply']>(contract.reply, result.reply) };
}

export function expectReplied<Contract extends DatabaseFunction>(result: DatabaseFunctionResult<Contract>): ReplyOf<Contract> {
  if (result.status !== 'replied') {
    throw new Error(`Expected a reply, got ${JSON.stringify(result)}`);
  }
  return result.reply;
}

export async function call<Contract extends DatabaseFunction>(
  client: AppClient,
  contract: Contract,
  ...request: RequestArguments<Contract>
): Promise<DatabaseFunctionResult<Contract>> {
  return parsed(contract, await callDatabaseFunction(client, contract, ...request));
}

export async function replyOf<Contract extends DatabaseFunction>(
  client: AppClient,
  contract: Contract,
  ...request: RequestArguments<Contract>
): Promise<ReplyOf<Contract>> {
  return expectReplied(await call(client, contract, ...request));
}

export function refused(code: string, field?: string | null) {
  return { status: 'refused', refusal: field === undefined ? { code } : { code, field } };
}

export function failed(code: string) {
  return { status: 'failed', error: { code } };
}
