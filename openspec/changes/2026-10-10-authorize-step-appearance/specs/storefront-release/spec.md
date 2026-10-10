# storefront-release Specification

## ADDED Requirements

### Requirement: Authorization appearance replaces one step
An active release MAY declare `authorize_buyer` or `authorize_merchant` as an uploaded HTML file. `/authorize/buyer` and `/authorize/merchant` MUST remain the server authorization pages and MUST NOT redirect to that file. The server MUST choose the current step with the existing page rules: buyer `phone`, `code`, `password`, or `approve`; merchant login when no merchant session exists, password change when `mustChangePassword` is set, otherwise approval. It MUST render only the matching template from the declared file. The template names MUST be `authorize.phone`, `authorize.code`, `authorize.password`, `authorize.approve`, `authorize.merchant.login`, `authorize.merchant.change-password`, and `authorize.merchant.approve`, written as `<template data-merclink="authorize.phone">`.

If the release does not declare an entry, the file is missing, the step template is missing, or that template contains no form, the step MUST use the built-in buyer or merchant authorization view. That fallback MUST NOT stop login or approval. The server MUST parse the selected template into an allowlist fragment before rendering. If that fragment cannot be strictly parsed, or it contains a script, iframe, base, object, embed, meta refresh, event handler, dangerous URL, or other markup outside the tags and attributes used by the built-in authorize templates, the step MUST use the built-in view. The server MUST NOT strip those constructs and continue with the remaining document. The buyer phone step MUST use a custom template only when the template contains exactly one empty `<merclink-slot name="authorize.captcha"></merclink-slot>` inside the form that submits. The server MUST inject the existing captcha control into that slot. A duplicate captcha slot, a captcha mount outside that form, or a missing slot MUST use the built-in view so a custom form cannot send SMS before human verification. Server-owned `phone`, `code`, `intent`, and `captchaVerifyParam` values MUST be submitted from that form. A comment, textarea, select, or button MUST NOT count as that binding, and a template MUST NOT be able to place an attacker value of those names ahead of the server value.

A rendered step's forms MUST submit to `/authorize/buyer/submit` or `/authorize/merchant/submit`. The server MUST NOT execute scripts in the template. Notice, phone, and logged-in account facts MUST be filled by the server through `authorize.notice`, `authorize.phone`, `authorize.account.name`, and `authorize.account.phone` slots. The server MUST NOT treat a verification code or success sentence written in the template as the notice, the SMS code, or a completed authorization. On buyer code and password steps, the submitted phone MUST be the server-known phone.

`/account/buyer.html` and `/account/merchant.html` MAY still be opened as static files and MUST NOT replace the authorization flow. The shipped authorize shell MUST include every step template above and MUST be generated from the same authorization components. It MUST NOT restore a hand-written `storefront/static/account` directory. Order-status slot rendering for `pay/result.html` MUST stay unchanged.

#### Scenario: Declared appearance does not replace the flow
- **WHEN** an active release declares `authorize_buyer` and a buyer opens `/authorize/buyer`
- **THEN** the response is the server page for the current step and is not a redirect to the static authorize file

#### Scenario: Phone step without a captcha slot uses the built-in view
- **WHEN** the declared buyer file has an `authorize.phone` template without an `authorize.captcha` slot
- **THEN** the phone step renders the built-in buyer authorization view and SMS is not sent without captcha verification

#### Scenario: Unsafe markup uses the built-in view
- **WHEN** the selected step template contains a script, an event handler such as `svg/onload` or `img/onerror`, or a `javascript:` URL including an HTML-entity colon
- **THEN** that step renders the built-in authorization view and does not insert a stripped copy of the template

#### Scenario: Captcha mount outside the submitting form uses the built-in view
- **WHEN** the captcha slot or `merclink-authorize-captcha` mount is outside the form that submits, or the mount is duplicated
- **THEN** the phone step renders the built-in buyer authorization view

#### Scenario: A comment does not bind a server field
- **WHEN** a template comment contains a phone or intent control and the server owns that field
- **THEN** the submitted value is the server-owned value, not the value written in the comment

#### Scenario: A later step keeps the server phone and submit path
- **WHEN** the buyer reaches code or password and the declared file has that step template
- **THEN** the step renders that template, the form posts to `/authorize/buyer/submit`, and the submitted phone is the server-known phone rather than a phone written in the template

#### Scenario: Static authorize file stays a file
- **WHEN** a client requests `/account/buyer.html` from an active release that contains that file
- **THEN** the response is that static file and `/authorize/buyer` remains the authorization flow
