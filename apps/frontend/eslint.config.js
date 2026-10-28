import js from '@eslint/js'
import tanstackQuery from '@tanstack/eslint-plugin-query'
import vitest from '@vitest/eslint-plugin'
import prettier from 'eslint-config-prettier'
import jsxA11y from 'eslint-plugin-jsx-a11y-x'
import reactHooks from 'eslint-plugin-react-hooks'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const LAYERS = ['domain', 'application', 'adapters', 'ui', 'ds', 'app']

const layers = (...names) => names.map(name => `@/${name}/**`)

const EVERYWHERE = [
  { group: ['cozy-ui', 'cozy-ui/**'], message: 'cozy-ui is never used.' },
  {
    group: ['@linagora/twake-mui/*'],
    message: 'Import from the @linagora/twake-mui entry point.'
  },
  {
    group: ['@sentry/*'],
    message: 'Only adapters/sentry/ imports @sentry/*.'
  },
  {
    group: ['@linagora/twake-feedback/sentry'],
    message: 'Only adapters/sentry/ imports @linagora/twake-feedback/sentry.'
  }
]

const RAW_UI = [
  {
    group: ['@mui/*', '@mui/*/**', '@emotion/*', '@emotion/*/**'],
    message: 'Import from @linagora/twake-mui. Missing UI goes to @/ds/.'
  }
]

const NO_STYLED = {
  name: '@linagora/twake-mui',
  importNames: ['styled'],
  message: 'No styled components outside @/ds/.'
}

const NO_RAW_ICON = {
  name: '@linagora/twake-icons',
  importNames: ['Icon'],
  message: 'Use @/ds/Icon, which hides decorative icons from screen readers.'
}

const FRAMEWORKS = [
  'react',
  'react-dom',
  'react-router',
  'twake-i18n',
  '@tanstack/*',
  '@linagora/*'
]

// The wire format stays in adapters/http/, which maps it to our own types.
const WIRE = {
  group: ['zod', '@twake-tasks/api-contract'],
  message: 'Only adapters/http/ imports the wire format.'
}

const BOUNDARIES = {
  domain: [...layers(...LAYERS.filter(l => l !== 'domain')), ...FRAMEWORKS],
  application: [...layers('adapters', 'ui', 'ds', 'app'), ...FRAMEWORKS],
  adapters: layers('ui', 'ds', 'app'),
  ui: layers('adapters', 'app'),
  ds: [
    ...layers('domain', 'application', 'adapters', 'ui', 'app'),
    'react-router',
    'twake-i18n',
    '@tanstack/*'
  ],
  app: []
}

const restrictImports = (layer, { wire = false } = {}) => {
  const patterns = wire ? [...EVERYWHERE] : [...EVERYWHERE, WIRE]
  if (layer !== 'ds') patterns.push(...RAW_UI)
  if (BOUNDARIES[layer].length > 0) {
    patterns.push({
      group: BOUNDARIES[layer],
      message: `Not allowed from ${layer}/ (hexagonal boundaries).`
    })
  }
  const paths = layer === 'ds' ? [NO_RAW_ICON] : [NO_STYLED, NO_RAW_ICON]
  return ['error', { paths, patterns }]
}

const FORBIDDEN_SYNTAX = [
  {
    selector: 'ExportDefaultDeclaration',
    message: 'Named exports only.'
  },
  { selector: 'TSEnumDeclaration', message: 'Use a string union.' },
  {
    selector: 'JSXAttribute[name.name="style"]',
    message: 'No inline style: use twake-mui props or twake-css classes.'
  },
  {
    selector:
      'TSAsExpression > TSAsExpression[typeAnnotation.type="TSUnknownKeyword"]',
    message: 'No `as unknown as T`.'
  }
]

const NO_SX = {
  selector: 'JSXAttribute[name.name="sx"]',
  message: 'No sx outside @/ds/.'
}

const KEYS_FILE = 'src/ui/queries/keys.ts'

const NO_LITERAL_QUERY_KEY = {
  selector:
    'Property[key.name="queryKey"] > ArrayExpression, Property[key.name="queryKey"] > TSAsExpression > ArrayExpression, CallExpression[callee.property.name=/QueryData$/] > ArrayExpression.arguments:first-child, CallExpression[callee.property.name=/QueryData$/] > TSAsExpression.arguments:first-child > ArrayExpression',
  message: `Query keys come from ${KEYS_FILE}.`
}

const NO_ROLE_COMPARISON = {
  selector:
    'BinaryExpression[operator=/^[!=]==?$/]:matches([left.property.name="role"], [right.property.name="role"], [left.expression.property.name="role"], [right.expression.property.name="role"], [left.name=/[rR]ole$/], [right.name=/[rR]ole$/])',
  message: 'Role rules live in @/domain/board (isEditable, isAdmin, ...).'
}

// May only shrink: a file leaves the list when it is split under the limit.
const OVER_MAX_LINES = [
  'src/ds/Calendar.tsx',
  'src/ds/Columns.tsx',
  'src/ds/RichText.tsx',
  'src/ds/Sharing.tsx',
  'src/ds/SidePanel.tsx',
  'src/ui/agenda/AgendaScreen.tsx',
  'src/ui/agenda/FiltersScreen.tsx',
  'src/ui/boards/Archive.tsx',
  'src/ui/boards/TaskPanel.tsx',
  'src/ui/shell/AppShell.tsx',
  'src/ui/shell/NewTaskDialog.tsx'
]

export default defineConfig(
  { ignores: ['dist/', 'coverage/', 'public/'] },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports' }
      ]
    }
  },
  {
    files: ['*.{js,ts}'],
    languageOptions: { globals: globals.node }
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [jsxA11y.configs.strict],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['info', 'warn', 'error'] }],
      'no-restricted-syntax': [
        'error',
        ...FORBIDDEN_SYNTAX,
        NO_SX,
        NO_LITERAL_QUERY_KEY
      ]
    }
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...FORBIDDEN_SYNTAX,
        NO_SX,
        NO_LITERAL_QUERY_KEY,
        NO_ROLE_COMPARISON
      ]
    }
  },
  {
    files: ['src/ui/**/*.tsx', 'src/ds/**/*.tsx'],
    ignores: ['**/*.spec.tsx', ...OVER_MAX_LINES],
    rules: {
      'max-lines': [
        'error',
        { max: 400, skipBlankLines: true, skipComments: true }
      ]
    }
  },
  {
    files: [KEYS_FILE, 'src/**/*.spec.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', ...FORBIDDEN_SYNTAX, NO_SX] }
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [NO_RAW_ICON], patterns: [WIRE] }
      ]
    }
  },
  ...LAYERS.map(layer => ({
    files: [`src/${layer}/**/*.{ts,tsx}`],
    rules: { 'no-restricted-imports': restrictImports(layer) }
  })),
  {
    files: ['src/adapters/http/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictImports('adapters', { wire: true })
    }
  },
  {
    files: ['src/ds/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', ...FORBIDDEN_SYNTAX] }
  },
  {
    files: ['src/adapters/sentry/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...EVERYWHERE.filter(
              p =>
                !p.group.includes('@sentry/*') &&
                !p.group.includes('@linagora/twake-feedback/sentry')
            ),
            WIRE
          ]
        }
      ]
    }
  },
  ...tanstackQuery.configs['flat/recommended'],
  {
    files: ['src/**/*.spec.{ts,tsx}'],
    ...vitest.configs.recommended
  },
  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
  prettier
)
