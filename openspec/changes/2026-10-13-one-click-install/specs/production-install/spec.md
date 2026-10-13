# Spec Delta

## ADDED Requirements

### Requirement: The permanent installer is the latest stable release asset
The repository MUST publish `install.sh` as an asset of the GitHub Release created for a version tag. The documented permanent entry MUST be `https://github.com/ptonlix/MercLink/releases/latest/download/install.sh`. A prerelease tag MUST be published as a GitHub prerelease so that this URL does not select it. The asset MUST download `compose.yaml` from that release tag and MUST set the application image to `docker.io/<namespace>/merclink:latest` for a stable release. A prerelease asset MUST keep the versioned image tag, because a prerelease does not move `latest`. The committed script MUST NOT contain a Docker Hub username, token, domain, or generated secret.

#### Scenario: Stable release is the permanent entry
- **WHEN** a stable version tag is published
- **THEN** its GitHub Release is not a prerelease and includes an `install.sh` asset whose image reference is `docker.io/<namespace>/merclink:latest`

#### Scenario: Prerelease does not take the permanent entry
- **WHEN** a prerelease version tag is published
- **THEN** its GitHub Release is marked as a prerelease

#### Scenario: Source does not contain the registry username
- **WHEN** the installer committed to the repository is read
- **THEN** it contains neither a Docker Hub username nor a concrete `docker.io/<namespace>/merclink:<version>` image reference

### Requirement: Install writes a pinned Compose deployment and does not overwrite it
A fresh install MUST create the install directory, download `compose.yaml` from the same git tag, and write `.env` with mode `600`. The image reference MUST be `docker.io/<namespace>/merclink:latest` when the release tag is stable. The operator MUST NOT have to choose a version number. The file MUST set `COMPOSE_PROFILES=caddy`, `APP_BIND=127.0.0.1`, and `APP_BASE_URL` to `https://` plus the chosen hostname. It MUST generate URL-safe database, Redis, object-storage, admin, and signing secrets. It MUST NOT set `MERCLINK_PURCHASE` or `MERCLINK_DEV_STUBS`. It MUST NOT rewrite `compose.yaml`. If `.env` already exists, install MUST exit without changing it. If TCP port 80 or 443 is already in use, install MUST exit before writing `.env`.

#### Scenario: Fresh install pins the release
- **WHEN** an operator runs a fresh install for tag `v1.2.3`
- **THEN** `.env` records `docker.io/<namespace>/merclink:latest`, enables the Caddy profile, binds the app to `127.0.0.1`, and omits purchase and dev-stub switches

#### Scenario: Existing env is kept
- **WHEN** an operator runs install and `.env` already exists
- **THEN** the command fails and the existing file is unchanged

#### Scenario: Occupied public ports stop install
- **WHEN** TCP port 80 or 443 is already listening
- **THEN** install exits before creating `.env`

### Requirement: Upgrade changes only the pinned release
Upgrade MUST require an existing `.env`. It MUST replace only the pinned image and release tag, download `compose.yaml` for that same tag, and run `docker compose pull` followed by `docker compose up -d` without `--build`. It MUST preserve generated secrets and any later operator settings, including `MERCLINK_PURCHASE`. It MUST NOT print stored passwords.

#### Scenario: Upgrade keeps secrets and purchase settings
- **WHEN** an operator upgrades an install that already has generated secrets and `MERCLINK_PURCHASE=1`
- **THEN** the image is `docker.io/<namespace>/merclink:latest`, the release tag matches the script, and the password and purchase setting remain

### Requirement: The installer does not become a package manager
The installer MUST refuse to start when Docker or the Docker Compose plugin is missing. It MUST NOT install operating-system packages, MUST NOT disable TLS verification, and MUST NOT compile the application on the deploy host.

#### Scenario: Docker is missing
- **WHEN** an operator runs the installer on a machine without Docker
- **THEN** the command exits without writing `.env` and without invoking a package manager
