/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "domain-no-app-db-adapters",
      severity: "error",
      comment:
        "Domain code stays free of Next.js routes, the database client, and vendor adapters.",
      from: { path: "(^|/)src/domain/" },
      to: { path: "(^|/)src/(app|db|adapters)/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
  },
};
