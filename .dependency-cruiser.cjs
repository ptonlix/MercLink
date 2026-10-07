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
    {
      name: "app-no-domain",
      severity: "error",
      comment: "Pages and route handlers call application services, not domain modules.",
      from: { path: "(^|/)src/app/" },
      to: { path: "(^|/)src/domain/" },
    },
    {
      name: "app-service-no-foreign-domain",
      severity: "error",
      comment: "An application service may import only its own context's domain module.",
      from: { path: "(^|/)src/app-services/([^/]+)/" },
      to: {
        path: "(^|/)src/domain/",
        pathNot: "(^|/)src/domain/$2/",
      },
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
