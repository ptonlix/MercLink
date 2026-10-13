# Spec Delta

## ADDED Requirements

### Requirement: Bundled object storage uses pinned RustFS
The local and production Compose stacks MUST provide object storage with a pinned `rustfs/rustfs` image. They MUST NOT use the `latest` tag, a MinIO community image, or AIStor. The application MUST continue to reach that store only through the configured S3-compatible endpoint, region, bucket, and credentials. Uploaded image bytes MUST still be written only to that bucket and MUST NOT be written to the application filesystem.

#### Scenario: Production stack starts
- **WHEN** an operator starts the production Compose stack with a reachable RustFS bucket and the required object-storage settings
- **THEN** the application starts and stores uploaded images in that bucket

#### Scenario: Floating tag is not the contract
- **WHEN** the bundled object-storage image is selected for a deployment
- **THEN** the image tag is an explicit RustFS version and is not `latest`

### Requirement: Object-storage console is not public
The bundled RustFS console port MUST NOT be published to the public internet. Only the application may expose product images, and it MUST continue to do so through its own media route.

#### Scenario: Console is not a public endpoint
- **WHEN** the production Compose stack is running
- **THEN** the RustFS console port is not published on a public address

### Requirement: Bucket exists before the application starts
The deployment MUST create the configured bucket before the application process accepts traffic. If the bucket cannot be reached at startup, the application MUST still refuse to start. The bucket creation step MUST NOT depend on the MinIO `mc` client.

#### Scenario: Bucket is created once
- **WHEN** the object-storage service becomes ready and the configured bucket does not yet exist
- **THEN** the deployment creates that bucket before the application serves requests

#### Scenario: Bucket remains unreachable
- **WHEN** the application starts and the configured bucket cannot be reached
- **THEN** startup fails before the application serves requests

### Requirement: Existing MinIO volumes are not reused
A deployment that already stored objects in a MinIO data volume MUST NOT switch the same volume to RustFS in place. A new deployment with no stored images MAY start with an empty RustFS volume. The bundled store MUST use one data disk and MUST NOT claim that disk can later expand in place into a multi-disk pool.

#### Scenario: Fresh deployment
- **WHEN** a new deployment has no stored product images
- **THEN** it starts RustFS with an empty single-disk volume and creates the configured bucket

#### Scenario: Old MinIO volume
- **WHEN** an operator points RustFS at an existing MinIO data volume
- **THEN** that configuration is outside this change and is not a supported migration
