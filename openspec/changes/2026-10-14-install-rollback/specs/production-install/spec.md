# Spec Delta

## ADDED Requirements

### Requirement: An unfinished install leaves no configuration
Before the installer moves `.env` into the install directory, cancelling with SIGINT or failing MUST remove files created by that attempt. A directory created by that attempt MUST be removed when it is empty. An existing `.env` MUST NOT be deleted. After `.env` has been moved into place, SIGINT MUST NOT delete `.env`, `compose.yaml`, or data volumes.

#### Scenario: Interrupt before configuration is committed
- **WHEN** the operator interrupts a fresh install before `.env` exists
- **THEN** the install directory contains no `.env` and no `compose.yaml` written by that attempt

#### Scenario: Interrupt after configuration is committed
- **WHEN** the operator interrupts a fresh install after `.env` has been written
- **THEN** `.env` remains and the command tells the operator not to delete it

### Requirement: A failed upgrade restores the previous release pin
Before changing an existing install, upgrade MUST remember the current `compose.yaml` and the `MERCLINK_IMAGE` and `MERCLINK_RELEASE_TAG` values. If download, replacement, pull, or startup does not finish, including when the operator sends SIGINT, upgrade MUST restore those three values and MUST NOT delete other `.env` settings. It MUST NOT delete data volumes. It MUST NOT automatically recreate containers with the restored image.

#### Scenario: Upgrade pull fails
- **WHEN** upgrade has replaced the release pin and image pull then fails
- **THEN** `compose.yaml` and the image and release tag return to their previous values, and purchase settings remain

#### Scenario: Replaced containers stay running
- **WHEN** upgrade is cancelled after a container has already been recreated from the new image
- **THEN** the files are restored and the command reports that those containers are not rolled back automatically
