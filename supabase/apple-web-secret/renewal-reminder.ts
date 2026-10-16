export const renewalIssueTitle = 'Renew the Apple web client secret';

const reminderDays = 14;
const renewalStepsUrl = 'https://github.com/Reilley64/mtgscan/blob/main/README.md#apple-web-client-secret';
const dayMilliseconds = 86_400_000;

function daysUntil(expiresOn: string, today: Date) {
  const expiry = Date.parse(expiresOn);
  if (Number.isNaN(expiry) || new Date(expiry).toISOString().slice(0, 10) !== expiresOn) {
    throw new Error(
      `APPLE_WEB_SECRET_EXPIRES_ON must be the date that \`bun run apple-web-secret\` prints, such as 2027-04-16, not "${expiresOn}".`,
    );
  }
  return (expiry - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / dayMilliseconds;
}

export function renewalReminderDue(expiresOn: string, today: Date, openIssueTitles: string[]) {
  return daysUntil(expiresOn, today) < reminderDays && !openIssueTitles.includes(renewalIssueTitle);
}

export function renewalIssueBody(expiresOn: string) {
  return `The Apple web client secret expires on ${expiresOn}. After that, **Continue with Apple** on the consent page stops working.

Renew it with the steps in [README.md (MCP connection, Apple web client secret)](${renewalStepsUrl}). Then close this issue.
`;
}
