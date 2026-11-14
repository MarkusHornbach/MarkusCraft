// ESLint flat config: typescript-eslint rules plus the "pure core" import boundary.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'test-results/', 'playwright-report/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: 'ExportDefaultDeclaration', message: 'Use named exports only.' },
      ],
    },
  },
  {
    // Config files of the tools require a default export.
    files: ['*.config.ts', '*.config.js'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // Pure core: testable in Node, movable to workers later.
    files: [
      'src/world/**',
      'src/player/**',
      'src/util/**',
      'src/actions/**',
      'src/items/**',
      'src/save/**',
      'src/render/textures/tiles.ts',
      'src/render/textures/itemIcons.ts',
      'src/render/textures/cracks.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'three', message: 'The pure core must not import three.' }],
          patterns: [
            { group: ['three/*'], message: 'The pure core must not import three.' },
            {
              group: ['**/render/*', '**/ui/*', '**/input/*', '**/game/*', '!**/game/config'],
              message: 'The pure core must not depend on the browser shell.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'No DOM in the pure core.' },
        { name: 'document', message: 'No DOM in the pure core.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG.' },
        { object: 'Date', property: 'now', message: 'Time must come in as a parameter.' },
      ],
    },
  },
  prettier,
);
