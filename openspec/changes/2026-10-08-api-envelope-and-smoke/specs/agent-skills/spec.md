# Spec Delta

## ADDED Requirements

### Requirement: Skills teach the JSON envelope
Both skills MUST state that `/api/v1` JSON responses use `code`, `message`, `data`, `timestamp`, and `request_id`. They MUST tell the agent to read resource fields from `data` and to compare the numeric `code`, not the `message`. They MUST show the numeric code beside each existing failure name they already document. They MUST NOT tell the agent to read a top-level `error` field or to treat HTTP 200 as the only success signal. They MUST state that HTTP 201 still has body `code` `200`, and that the payment notification response is plain text.

#### Scenario: Buyer skill describes an order error
- **WHEN** a client fetches the buyer skill
- **THEN** the body shows `insufficient_stock` as code `40901` and tells the agent not to branch on `message`

#### Scenario: Merchant skill describes a publish error
- **WHEN** a client fetches the merchant skill
- **THEN** the body tells the agent to read `code` and `message` from the envelope when publish fails
