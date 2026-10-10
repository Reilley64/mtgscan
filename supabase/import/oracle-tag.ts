import { importClientFromEnvironment } from './import-client';

const usage = 'Usage: bun import/oracle-tag.ts <disable | enable> <tag UUID>';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const [action, tagId = '', ...rest] = Bun.argv.slice(2);

if ((action !== 'disable' && action !== 'enable') || !uuidPattern.test(tagId) || rest.length > 0) {
  console.error(usage);
  process.exit(2);
}

const client = importClientFromEnvironment();
const { data, error } = await client
  .rpc(action === 'disable' ? 'disable_oracle_tag' : 'enable_oracle_tag', { tag_id: tagId })
  .single();

if (error) {
  console.error(`Could not ${action} the Oracle tag ${tagId}: ${error.message}`);
  process.exit(1);
}

const name = data.slug ? `${data.slug} (${data.id})` : data.id;
console.log(`${data.disabled ? 'Disabled' : 'Enabled'} the Oracle tag ${name}.`);
