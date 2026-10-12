const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const boundaries = require('eslint-plugin-boundaries');

const levels = ['atom', 'molecule', 'organism', 'template'];

const importsBelow = {
  atom: ['atom', 'shared'],
  molecule: ['molecule', 'atom', 'shared'],
  organism: ['organism', 'molecule', 'atom', 'feature', 'shared'],
  template: [...levels, 'shared'],
  feature: ['organism', 'molecule', 'atom', 'feature', 'shared'],
  'primitive-catalog': [...levels, 'shared'],
  page: [...levels, 'feature', 'primitive-catalog', 'shared'],
  shared: ['shared'],
};

const rawControls = ['Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback', 'Switch', 'Button'];

const rawControlImports = {
  name: 'react-native',
  importNames: rawControls,
  message: 'Use the control atoms in src/components/atoms. To use a native control, wrap it in an atom. See CODING_STANDARDS.md (Atomic Design).',
};

const controlStyleMessage =
  'Controls take their look from the atoms in src/components/atoms. To style a native control, wrap it in an atom. See CODING_STANDARDS.md (Atomic Design).';

const controlStyles = [
  {
    selector: "JSXOpeningElement:has(> JSXAttribute[name.name=/^on(Press|LongPress|ValueChange)$/]) > JSXAttribute[name.name='style']",
    message: controlStyleMessage,
  },
  {
    selector:
      'JSXOpeningElement[name.name=/^(Text|View)$/]:has(> JSXAttribute[name.name=/^on(Press|LongPress)$/]) > JSXAttribute[name.name="className"]',
    message: controlStyleMessage,
  },
];

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'ios/*', 'android/*', '.expo/*'],
  },
  {
    files: ['src/auth/test-sign-in.ts', 'src/app/primitives.tsx', 'src/app/primitives-sheet.tsx'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['src/components/{molecules,organisms,templates}/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', { paths: [rawControlImports] }],
      'no-restricted-syntax': ['error', ...controlStyles],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/components/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [rawControlImports],
          patterns: [
            {
              group: ['@rn-primitives/*'],
              message: 'Screens and features use the primitives in src/components, not @rn-primitives directly.',
            },
          ],
        },
      ],
      'no-restricted-syntax': ['error', ...controlStyles],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { typescript: { project: './tsconfig.json' } },
      'boundaries/include': ['src/**/*'],
      'boundaries/files': [{ category: 'shared', pattern: 'src/*.{ts,css}' }],
      'boundaries/elements': [
        { type: 'atom', pattern: 'src/components/atoms', partialMatch: false },
        { type: 'molecule', pattern: 'src/components/molecules', partialMatch: false },
        { type: 'organism', pattern: 'src/components/organisms', partialMatch: false },
        { type: 'template', pattern: 'src/components/templates', partialMatch: false },
        { type: 'page', pattern: 'src/app', partialMatch: false },
        { type: 'primitive-catalog', pattern: 'src/primitive-catalog', partialMatch: false },
        { type: 'shared', pattern: 'src/lib', partialMatch: false },
        { type: 'feature', pattern: 'src/*', partialMatch: false },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          checkUnknownLocals: true,
          policies: [
            { allow: { to: { file: { categories: 'shared' } } } },
            ...Object.entries(importsBelow).map(([type, allowed]) => ({
              from: { element: { type } },
              allow: { to: { element: { types: allowed } } },
            })),
          ],
        },
      ],
    },
  },
]);
