import tanstackQuery from '@tanstack/eslint-plugin-query'
import vitest from '@vitest/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'
import { define } from 'rstack'

const FRONTEND = 'apps/frontend'

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

// The React Compiler rules of eslint-plugin-react-hooks, which Rslint does not
// port. Rslint reserves the react-hooks prefix for its own rules.
const reactCompilerRules = Object.fromEntries(
  Object.entries(reactHooks.configs['recommended-latest'].rules)
    .filter(([rule]) => !/\/(rules-of-hooks|exhaustive-deps)$/.test(rule))
    .map(([rule, level]) => [
      rule.replace('react-hooks/', 'react-compiler/'),
      level
    ])
)

// Rslint's no-restricted-syntax does not match TypeScript nodes such as
// TSAsExpression. ESLint's rule runs those selectors, through the JS plugins.
const TS_NODE = /\bTS(?!EnumDeclaration)/

const tsSyntax = {
  rules: {
    'no-restricted-syntax': {
      meta: { schema: false },
      create: context =>
        Object.fromEntries(
          context.options.map(({ selector, message }) => [
            selector,
            node => context.report({ node, message })
          ])
        )
    }
  }
}

// Splits "a, b" at the commas outside brackets, parentheses and quotes
const splitSelector = selector => {
  const parts = []
  let depth = 0
  let quote = null
  let start = 0
  for (let i = 0; i < selector.length; i++) {
    const char = selector[i]
    if (quote) {
      if (char === quote) quote = null
    } else if (char === '"' || char === "'") quote = char
    else if (char === '(' || char === '[') depth++
    else if (char === ')' || char === ']') depth--
    else if (char === ',' && depth === 0) {
      parts.push(selector.slice(start, i).trim())
      start = i + 1
    }
  }
  return [...parts, selector.slice(start).trim()]
}

const splitRestrictedSyntax = ([level, ...restrictions]) => {
  const native = []
  const ts = []
  for (const { selector, message } of restrictions) {
    const parts = splitSelector(selector)
    const nativeParts = parts.filter(part => !TS_NODE.test(part))
    const tsParts = parts.filter(part => TS_NODE.test(part))
    if (nativeParts.length > 0) {
      native.push({ selector: nativeParts.join(', '), message })
    }
    if (tsParts.length > 0) ts.push({ selector: tsParts.join(', '), message })
  }
  return {
    'no-restricted-syntax': [level, ...native],
    'ts-syntax/no-restricted-syntax': [level, ...ts]
  }
}

// Paths below are relative to the repository root, whichever workspace runs
// the lint with --config.
const frontend = ({ rules, ...entry }) => ({
  ...entry,
  files: entry.files.map(file => `${FRONTEND}/${file}`),
  ...(entry.ignores && {
    ignores: entry.ignores.map(file => `${FRONTEND}/${file}`)
  }),
  ...(rules && {
    rules: rules['no-restricted-syntax']
      ? { ...rules, ...splitRestrictedSyntax(rules['no-restricted-syntax']) }
      : rules
  })
})

// The handlers of eslint-plugin-jsx-a11y's strict preset
const HANDLERS = [
  'onFocus',
  'onBlur',
  'onKeyDown',
  'onKeyPress',
  'onKeyUp',
  'onClick',
  'onContextMenu',
  'onDblClick',
  'onDoubleClick',
  'onDrag',
  'onDragEnd',
  'onDragEnter',
  'onDragExit',
  'onDragLeave',
  'onDragOver',
  'onDragStart',
  'onDrop',
  'onMouseDown',
  'onMouseEnter',
  'onMouseLeave',
  'onMouseMove',
  'onMouseOut',
  'onMouseOver',
  'onMouseUp'
]

const frontendConfig = ({ jsxA11yPlugin }) => [
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Turned off by eslint-config-prettier
      'no-unexpected-multiline': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports' }
      ]
    }
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: ['jsx-a11y', 'react-hooks'],
    rules: {
      ...jsxA11yPlugin.configs.recommended.rules,
      // eslint-plugin-jsx-a11y's strict preset, where it differs from the
      // recommended one
      'jsx-a11y/interactive-supports-focus': [
        'error',
        {
          tabbable: [
            'button',
            'checkbox',
            'link',
            'progressbar',
            'searchbox',
            'slider',
            'spinbutton',
            'switch',
            'textbox'
          ]
        }
      ],
      'jsx-a11y/no-interactive-element-to-noninteractive-role': 'error',
      'jsx-a11y/no-noninteractive-element-interactions': [
        'error',
        {
          handlers: [...HANDLERS, 'onLoad', 'onError'],
          body: ['onError', 'onLoad'],
          iframe: ['onError', 'onLoad'],
          img: ['onError', 'onLoad']
        }
      ],
      'jsx-a11y/no-noninteractive-element-to-interactive-role': 'error',
      'jsx-a11y/no-noninteractive-tabindex': ['error', { roles: [], tags: [] }],
      'jsx-a11y/no-static-element-interactions': [
        'error',
        { handlers: HANDLERS }
      ],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
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
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-compiler': reactHooks },
    rules: reactCompilerRules
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'ts-syntax': tsSyntax }
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
    files: ['src/adapters/http/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...FORBIDDEN_SYNTAX,
        NO_SX,
        NO_LITERAL_QUERY_KEY,
        {
          selector: 'TSAsExpression',
          message:
            'No cast on what the backend answers: parse it with its schema.'
        }
      ]
    }
  },
  {
    files: ['src/testing/fakeBoardsApi.contract.spec.ts'],
    rules: { 'no-restricted-imports': ['error', { paths: [NO_RAW_ICON] }] }
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
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: { '@tanstack/query': tanstackQuery },
    rules: tanstackQuery.configs['flat/recommended'][0].rules
  },
  {
    files: ['src/**/*.spec.{ts,tsx}'],
    plugins: { vitest },
    rules: vitest.configs.recommended.rules
  }
]

const config = lint => [
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      'apps/backend/drizzle/**',
      `${FRONTEND}/public/**`
    ]
  },
  lint.js.configs.recommended,
  ...lint.ts.configs.strictTypeChecked,
  {
    files: [`${FRONTEND}/**/*.{ts,tsx}`],
    rules: lint.ts.configs.stylisticTypeChecked.at(-1).rules
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      // Rslint's preset ignores the names that start with an underscore
      '@typescript-eslint/no-unused-vars': ['error', {}]
    }
  },
  {
    // ESLint's recommended preset has it, Rslint's does not
    files: ['**/*.{js,mjs,cjs}'],
    rules: { 'no-undef': 'error' }
  },
  {
    files: ['apps/backend/src/modules/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='app'][callee.property.name=/^(get|post|put|patch|delete|route)$/]",
          message:
            'Declare the route with defineRoute, so permissions.test.ts checks its access.'
        }
      ]
    }
  },
  ...frontendConfig(lint).map(frontend)
]

define.lint(lint =>
  config(lint).map(entry => ({ ...entry, basePath: import.meta.dirname }))
)

define.fmt({
  semi: false,
  singleQuote: true,
  trailingComma: 'none',
  printWidth: 80,
  arrowParens: 'avoid',
  ignorePatterns: [
    'apps/backend/drizzle/',
    'apps/backend/**/*.md',
    `${FRONTEND}/**/*.md`
  ]
})
