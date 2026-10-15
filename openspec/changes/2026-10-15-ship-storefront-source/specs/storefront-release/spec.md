# Spec Delta

## ADDED Requirements

### Requirement: Production image ships the storefront source directory

The production image MUST place the repository `storefront` directory at the process working directory. The Docker build context MUST NOT exclude that directory. The runner MUST NOT depend on Next.js standalone file tracing to include it. Before any release is accepted, packing the shipped source MUST read that directory from the working directory.

#### Scenario: Image contains the shipped directory

- **WHEN** the production image is built from the repository Dockerfile
- **THEN** the runner stage copies `storefront` into the `/app` workdir, and `.dockerignore` does not exclude it

#### Scenario: First download packs the shipped directory

- **WHEN** no storefront release has been accepted and a merchant downloads the source
- **THEN** the archive is packed from the `storefront` directory in the process working directory
