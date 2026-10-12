import postcss from 'postcss';
import { registerCSS, setupAllComponents } from 'react-native-css-interop/test';
import tailwindcss from 'tailwindcss';

import tailwindConfig from '../tailwind.config';

let compiledCss: Promise<string> | undefined;

function compileAppCss() {
  compiledCss ??= postcss([tailwindcss(tailwindConfig)])
    .process('@tailwind components; @tailwind utilities;', { from: undefined })
    .then((result) => result.css);
  return compiledCss;
}

export async function registerAppStyles() {
  setupAllComponents();
  registerCSS(await compileAppCss(), { ignorePropertyWarningRegex: ['^--tw-'], grouping: ['^group(/.*)?'] });
}
