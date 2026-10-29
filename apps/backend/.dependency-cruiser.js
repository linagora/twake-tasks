const CLOSED_MODULES = ['kernel', 'notifications', 'views', 'collaboration']

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    ...CLOSED_MODULES.map(name => ({
      name: `${name}-through-index`,
      severity: 'error',
      from: { pathNot: `^src/modules/${name}/` },
      to: {
        path: `^src/modules/${name}/`,
        pathNot: `^src/modules/${name}/index\\.ts$`
      }
    })),
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true }
    },
    {
      name: 'no-circular-folders',
      severity: 'warn',
      scope: 'folder',
      from: {},
      to: { circular: true }
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      from: { orphan: true },
      to: {}
    }
  ],
  options: {
    exclude: { path: '\\.test\\.ts$|(^|/)testing(/|\\.ts$)' },
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true
  }
}
