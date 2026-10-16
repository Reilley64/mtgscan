import { $ } from 'bun';

import { renewalIssueBody, renewalIssueTitle, renewalReminderDue } from './renewal-reminder';

const expiresOn = process.env.APPLE_WEB_SECRET_EXPIRES_ON ?? '';

const openIssues: { title: string }[] =
  await $`gh issue list --state open --search ${`"${renewalIssueTitle}" in:title`} --json title`.json();

let due: boolean;
try {
  due = renewalReminderDue(expiresOn, new Date(), openIssues.map((issue) => issue.title));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
}

if (due) {
  await $`gh issue create --title ${renewalIssueTitle} --label ready-for-human --body ${renewalIssueBody(expiresOn)}`;
} else {
  console.log(`The Apple web client secret expires on ${expiresOn}. No new reminder is due.`);
}
