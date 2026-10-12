# Spec Delta

## Purpose

用一个只在启动时读取的开关决定这一家店是否接受买入，使只做商品发现的部署不必配置买家登录、图形验证、短信和支付商户。

## ADDED Requirements

### Requirement: Purchase mode is a startup switch
The process MUST read `MERCLINK_PURCHASE` only at startup. The exact value `1` MUST enable purchase. An absent value, an empty value, and `0` MUST disable purchase. Any other value MUST prevent the process from listening and MUST NOT be treated as enabled. The process MUST NOT reread the variable per request, and MUST NOT store a second switch in the database that can override it. Disabling purchase MUST NOT remove the existing startup requirements for the database, the initial store-owner credentials, the authorization signing secret, the public base URL, Redis, or object storage.

#### Scenario: Variable is absent
- **WHEN** the process starts without `MERCLINK_PURCHASE`
- **THEN** purchase is disabled and the process does not require captcha, SMS, or payment-merchant credentials

#### Scenario: Purchase is explicitly enabled
- **WHEN** the process starts with `MERCLINK_PURCHASE=1`
- **THEN** purchase is enabled for the life of that process

#### Scenario: Value is not recognized
- **WHEN** the process starts with `MERCLINK_PURCHASE` set to `true`
- **THEN** it exits before accepting requests and does not print a secret

### Requirement: Disabled purchase hides the buy bundle
When purchase is disabled, the deployment MUST NOT require or present buyer login, buyer registration, human-verification configuration, SMS configuration, or payment-merchant configuration. It MUST continue to serve published product discovery, merchant agent authorization, store-owner password change, catalog management, product images, and the store profile. It MUST NOT add GEO monitoring, recommendations, or a second product catalog.

#### Scenario: Discovery deployment starts
- **WHEN** purchase is disabled and a client fetches the landing page, `/products`, `/llms.txt`, and `/merchant/skill.md`
- **THEN** those responses succeed without captcha, SMS, or payment-merchant credentials having been configured

#### Scenario: Merchant authorization remains
- **WHEN** purchase is disabled and an agent requests a catalog-management scope
- **THEN** the merchant login and approval page is still offered and does not become a buyer registration page
