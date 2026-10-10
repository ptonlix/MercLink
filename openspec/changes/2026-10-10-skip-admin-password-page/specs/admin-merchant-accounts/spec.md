## ADDED Requirements

### Requirement: Changed password does not reopen the admin password page
After the store owner password has changed, `must_change_password` is false. A later admin login MUST NOT present the password change form. A login that names a same-site admin return path MUST return there. A login without that path MUST show a signed-in admin page that does not contain the password form. The password form MUST still appear when `must_change_password` is true, and when the owner explicitly asks to change the password.

#### Scenario: Login from reset approval after the password changed
- **WHEN** the owner logs in from a storefront reset approval page and the password has already changed
- **THEN** the browser returns to that approval page and does not show the password change form

#### Scenario: Direct admin visit after the password changed
- **WHEN** the owner opens the admin page after the password has changed and does not ask to change it
- **THEN** the page does not show the password change form
