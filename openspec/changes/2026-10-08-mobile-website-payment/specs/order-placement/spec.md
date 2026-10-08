# Spec Delta

## ADDED Requirements

### Requirement: Payment channel is chosen once
The order request MAY include `payment_channel` with value `desktop` or `mobile`. An omitted channel MUST be stored as `desktop`. Any other value MUST be rejected with `validation_error` and MUST NOT create an order or change stock. The accepted channel MUST be stored on the payment record in the same transaction as the order header and line, not on the order header. Repeating the same buyer and `client_order_no` MUST keep the original channel even when the new request asks for the other one. The order response MUST include `payment.channel` with the stored value.

#### Scenario: Omitted channel
- **WHEN** a buyer places an order without `payment_channel`
- **THEN** the payment record channel is `desktop` and no second payment record is created

#### Scenario: Unknown channel
- **WHEN** a buyer sends `payment_channel` with a value other than `desktop` or `mobile`
- **THEN** the error is `validation_error` and no order or stock change is saved

#### Scenario: Repeat asks for the other channel
- **WHEN** the same buyer repeats a `client_order_no` whose payment channel is `mobile` and the new request says `desktop`
- **THEN** the original order is returned, stock is unchanged, and `payment.channel` is `mobile`
