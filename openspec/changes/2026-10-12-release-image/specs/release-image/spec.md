# Spec Delta

## Purpose

在版本 tag 上发布可部署的应用镜像，并使生产部署拉取该镜像，而不是在部署机编译应用。

## ADDED Requirements

### Requirement: Release workflow runs only for version tags

The release workflow MUST be triggered by a version-shaped git tag and MUST NOT run for a branch push. GitHub tag filters are globs, so the trigger MAY be broader than a semantic-version regular expression. Before registry login, the workflow MUST reject any ref that is not `vMAJOR.MINOR.PATCH` or that version plus a prerelease suffix such as `v1.2.3-rc.1`. It MUST NOT use the result of the parallel CI workflow as its publish gate. It MUST run checks equivalent to `pnpm run check` in the release workflow before any registry login.

#### Scenario: Branch push does not publish

- **WHEN** a commit is pushed to a branch and no version tag is pushed
- **THEN** the release workflow does not log in to Docker Hub and does not push an image

#### Scenario: Non-version ref does not log in

- **WHEN** a tag reaches the publish job but is not `vMAJOR.MINOR.PATCH` or a prerelease suffix of that form
- **THEN** the workflow exits before logging in to Docker Hub and does not push an image

#### Scenario: Check failure stops before login

- **WHEN** a version tag is pushed and the release workflow's `pnpm run check` fails
- **THEN** the workflow does not log in to Docker Hub and does not push an image

### Requirement: Stable tags publish the version and latest

A stable tag `vMAJOR.MINOR.PATCH` MUST publish `docker.io/${DOCKERHUB_USERNAME}/merclink:MAJOR.MINOR.PATCH` and `docker.io/${DOCKERHUB_USERNAME}/merclink:latest`. `DOCKERHUB_USERNAME` MUST come from the GitHub Actions variable of that name. The Docker Hub token MUST come from the `DOCKERHUB_TOKEN` secret. The repository MUST NOT hardcode a Docker Hub username, token, or password. The image MUST be built from the existing Dockerfile for `linux/amd64` only.

#### Scenario: Stable tag v1.2.3

- **WHEN** the tag `v1.2.3` is pushed and the release checks pass
- **THEN** the workflow pushes `docker.io/${DOCKERHUB_USERNAME}/merclink:1.2.3` and `docker.io/${DOCKERHUB_USERNAME}/merclink:latest`

### Requirement: Prerelease tags do not move latest

A prerelease tag MUST publish only the version label without the leading `v`. It MUST NOT push the stable version tag and MUST NOT push or move `latest`.

#### Scenario: Prerelease tag v1.2.3-rc.1

- **WHEN** the tag `v1.2.3-rc.1` is pushed and the release checks pass
- **THEN** the workflow pushes `docker.io/${DOCKERHUB_USERNAME}/merclink:1.2.3-rc.1`, does not push `1.2.3`, and does not move `latest`

### Requirement: Image build receives no deployment secrets

The image build MUST NOT receive payment secrets, `MERCLINK_PURCHASE`, `APP_BASE_URL`, or any `.env` file as a build argument, secret mount, or copied build-context file. PostgreSQL, Redis, and MinIO MUST remain separate Compose images and MUST NOT be installed into the application image.

#### Scenario: Release build starts

- **WHEN** the release workflow builds the application image
- **THEN** the build uses the repository Dockerfile, targets only `linux/amd64`, and does not pass payment secrets, `MERCLINK_PURCHASE`, `APP_BASE_URL`, or `.env`

### Requirement: Build context excludes secrets and keeps migrations

The Docker build context MUST exclude `.git`, `.env`, `.env.*`, `node_modules`, `.next`, test outputs, and local editor directories. It MUST NOT exclude `src/db/migrations`.

#### Scenario: Ignore file is applied

- **WHEN** the application image is built from the repository context
- **THEN** `.env` files and `.git` are outside the context, and `src/db/migrations` remains available to the Dockerfile

### Requirement: Production deploy pulls the published image

When `MERCLINK_IMAGE` names a published remote image, `docker compose pull && docker compose up -d` MUST pull that application image and the fixed Postgres, Redis, and MinIO images, and MUST NOT compile the application on the deploy machine. The documented production command MUST NOT be `docker compose up -d --build`. The production Compose file MUST NOT include an application `build` section that this command would use. A local build MUST remain possible through an explicit extra Compose file that the production command does not load.

#### Scenario: Remote image is deployed

- **WHEN** `MERCLINK_IMAGE` is `docker.io/<DOCKERHUB_USERNAME>/merclink:1.2.3` and the operator runs `docker compose pull && docker compose up -d`
- **THEN** Compose pulls the published application image and does not compile the application

#### Scenario: Local build is explicit

- **WHEN** an operator needs to build an application image without a published remote image
- **THEN** the local command must name the extra Compose file, and the documented production command still does not build

### Requirement: latest is not a rollback target

A new stable release MUST overwrite `latest`. Production rollback MUST set `MERCLINK_IMAGE` to a version tag and pull that tag. Operators MUST NOT treat `latest` as reversible.

#### Scenario: Rollback after a newer stable release

- **WHEN** `latest` has moved from `1.2.3` to `1.2.4` and the operator must return to `1.2.3`
- **THEN** the operator sets `MERCLINK_IMAGE` to the `1.2.3` tag and pulls that tag, instead of expecting `latest` to point back to `1.2.3`
