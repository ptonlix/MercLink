## ADDED Requirements

### Requirement: Identity pages share an accessible presentation
Device-code, buyer-authorization, merchant-authorization, owner-password, and script-account pages MUST use one consistent form presentation with a visible title, purpose, field labels, focus indication, and feedback region. Inputs MUST retain their existing field names, submission targets, and intents. Identity presentation MUST NOT implement a second authorization protocol, create a client-side substitute for server validation, or expose API keys in an agent flow. Error notices MUST be readable, announced with an alert role, and MUST NOT be interpreted as success. Success MUST be based on the existing confirmed server outcome.

#### Scenario: Device-code input
- **WHEN** a reader opens the owned device-code entry page
- **THEN** one labeled short-code input is presented and the existing form submits `user_code` to `/oauth/device`

#### Scenario: Server rejects a form
- **WHEN** an identity page receives an existing error notice
- **THEN** the notice is visible near the form and the UI does not advance to a successful state solely because a button was clicked

### Requirement: Buyer stages remain server-selected
The buyer page MUST present the current `phone`, `code`, `password`, or `approve` stage selected by its server model. Registration MUST keep the captcha, SMS verification, and password order. An SMS control MUST remain disabled until the existing human-verification integration allows it. An existing buyer MUST remain in the login flow. A password stage MUST distinguish setting a new password from entering an existing one. Approval MUST be available only for a pending authorization request. The page MUST NOT collect credentials or verification codes through the agent conversation or offer merchant registration.

#### Scenario: Captcha has not succeeded
- **WHEN** a buyer has not passed the real human-verification integration
- **THEN** the send-SMS action remains unavailable and no client-only state pretends that verification succeeded

#### Scenario: No pending request
- **WHEN** a logged-in buyer has no pending approval
- **THEN** the page provides guidance to start authorization from the agent and does not show an active approval control

### Requirement: Owner presentation enforces the existing boundaries
Merchant login MUST use the owner account and MUST NOT offer registration. When the server indicates that the initial password must change, presentation MUST prioritize that form and MUST NOT offer an enabled approval action until the existing password change succeeds. The owner administration page MUST provide only its existing login and password-change actions and MUST NOT gain product-management, order-management, store-provisioning, or business-metric controls. Role explanations MUST NOT invent client names, requested scopes, or authorization metadata that the current model does not provide.

#### Scenario: Initial owner password
- **WHEN** the merchant page model requires a password change
- **THEN** the change-password form is clearly shown and the UI does not offer an enabled approval action

#### Scenario: Owner management page
- **WHEN** an authenticated owner opens `/admin`
- **THEN** the page provides the existing password-change form and no commerce management controls

### Requirement: Script credentials stay separate
The script-account page MUST identify API keys as credentials for server scripts. It MUST display only existing key prefixes and their active or revoked state except for the current one-time secret returned by the existing action. It MUST retain existing create and revoke actions. It MUST NOT add this credential flow to agent-authorization navigation, store secrets in browser persistence, or copy them into sample HTML.

#### Scenario: Agent authorization page
- **WHEN** a reader follows buyer or merchant authorization
- **THEN** no API-key creation or secret-display control appears in that flow

### Requirement: Design prototype is isolated and honest
The design prototype MUST be stored with the change as a standalone HTML attachment, explicitly label all store and product data as samples, and require no build or external resource downloads. It MUST NOT call production APIs, send SMS, create an account, create an order, initiate payment, or persist entered identity data. Demonstrated identity outcomes MUST be labeled as demonstrations. The preview toolbar and hash routing MUST NOT become production application routes or navigation requirements. Prototype purchase-assistance copies MUST use sample ids only.

#### Scenario: Offline prototype
- **WHEN** the standalone HTML is opened offline
- **THEN** sample store, product, and identity views render with local CSS and vector illustrations without fetching external assets

#### Scenario: Demonstrated approval
- **WHEN** a reader clicks the prototype approval action
- **THEN** the page displays a labeled demonstration outcome and no real authorization, account, or transaction is created
