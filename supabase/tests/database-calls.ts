import { expect } from 'bun:test';

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
  if (result.status === 'replied') {
    contract.reply.parse(result.reply);
  }
  return result;
}

export function expectReplied<Contract extends DatabaseFunction>(result: DatabaseFunctionResult<Contract>): ReplyOf<Contract> {
  expect(result).toMatchObject({ status: 'replied' });
  return (result as { reply: ReplyOf<Contract> }).reply;
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
