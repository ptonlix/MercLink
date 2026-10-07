# Spec Delta

## ADDED Requirements

### Requirement: Public and merchant product names match
Public product JSON and merchant product JSON MUST use `fields` for custom values, `axes` for declared axes, and `option_values` for variant combinations. They MUST NOT return `attrs` or an `options` key for any of those three concepts.

#### Scenario: Public product uses the shared names
- **WHEN** a published product is returned by the public query
- **THEN** its custom values are under `fields` and its sellable combinations are under `option_values`
