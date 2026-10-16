import { expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';

import { problemKinds, problemTypeBase } from '@mtgscan/supabase/mcp-problems';

const siteDirectory = new URL('../', import.meta.url);
const problemNames = Object.keys(problemKinds) as (keyof typeof problemKinds)[];

function pagePath(name: string) {
  return `.${new URL(problemTypeBase + name).pathname}.html`;
}

async function problemPage(name: string) {
  const html = await Bun.file(new URL(pagePath(name), siteDirectory)).text();
  return new DOMParser().parseFromString(html, 'text/html');
}

test.each(problemNames)('the %s problem type has a page in the site style with its title, what it means, and what to do next', async (name) => {
  const page = await problemPage(name);
  const { title } = problemKinds[name];

  expect(page.querySelector('link[rel="stylesheet"]')?.getAttribute('href')).toBe('/styles.css');
  expect(page.querySelectorAll('script, style, [style]')).toHaveLength(0);
  expect(page.title).toBe(`${title} · mtgscan`);
  expect(page.querySelector('h1')?.textContent).toBe(title);
  expect([...page.querySelectorAll('h2')].map((heading) => heading.textContent)).toEqual([
    'What it means',
    'What to do next',
  ]);
});

test('every problem page is a problem type of the MCP server', async () => {
  const pages = await readdir(new URL('./problems/', siteDirectory));

  expect(pages.toSorted()).toEqual(problemNames.map((name) => `${name}.html`).toSorted());
});
