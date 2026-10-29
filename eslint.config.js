import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/drizzle/**'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  { files: ['**/*.js'], ...tseslint.configs.disableTypeChecked },
  {
    files: ['apps/backend/src/modules/**/*.ts'],
    // A stream, and a call from the identity provider, not declared yet.
    ignores: [
      '**/*.test.ts',
      'apps/backend/src/modules/boards/liveRoutes.ts',
      'apps/backend/src/modules/auth/routes.ts'
    ],
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
  }
)
