// ESLint (flat config): базові recommended-набори + правила хуків React.
// Без type-checked правил typescript-eslint — швидкий лінт без tsconfig-проєкту.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Нові компіляторні правила v7 конфліктують з ідіомами проєкту:
      // скидання локального стану інпута через useEffect(setValue) у
      // адмін-табах і Date.now() для ETA в R8FarmPage. Класичні
      // rules-of-hooks/exhaustive-deps лишаються увімкненими.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
    },
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['vite.config.ts', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
);
