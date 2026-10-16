export const renewalIssueTitle = 'Renew the Apple web client secret';

const reminderDays = 14;
const dayMilliseconds = 86_400_000;

function daysUntil(expiresOn: string, today: Date) {
  const expiry = Date.parse(expiresOn);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || Number.isNaN(expiry)) {
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

1. On your Mac, in \`supabase\`, run \`bun run apple-web-secret\` with \`APPLE_WEB_KEY_PATH\`, \`APPLE_WEB_KEY_ID\`, \`APPLE_TEAM_ID\`, and \`APPLE_WEB_SERVICES_ID\` set. README.md (Apple web client secret) says what each one is.
2. In the Supabase dashboard, open Authentication, Sign In / Providers, Apple. Paste the secret into **Secret Key (for OAuth)** and save.
3. Run \`gh variable set APPLE_WEB_SECRET_EXPIRES_ON --body <date>\` with the expiry date that the script prints.
4. Start a connection from your AI chat, and sign in with **Continue with Apple** on the consent page.

Then close this issue.
`;
}
