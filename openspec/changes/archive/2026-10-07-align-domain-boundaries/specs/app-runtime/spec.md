# Spec Delta

## ADDED Requirements

### Requirement: Architecture checks cover context boundaries
The dependency check MUST fail when a page or route imports a domain module, and when an application service imports another context's domain module. Domain code MUST still be forbidden from importing application, database, or adapter modules.

#### Scenario: Cross-context domain import
- **WHEN** an identity application service imports an access domain module
- **THEN** the dependency check fails
