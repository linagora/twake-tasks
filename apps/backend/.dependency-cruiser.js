/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
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
