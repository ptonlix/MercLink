# Proposal

## Why

短信发送次数现在写在 `sms_sends`，先查出全部时间再在应用里判断。Redis 已经成为限流依赖之后，这类会过期的计数继续占着 PostgreSQL 没有好处，并发下还可能两次都通过检查。

## What Changes

- 同一手机号的短信发送限制改由 Redis 原子计数执行：60 秒一次，24 小时最多 10 次。
- 超限仍返回 `sms_rate_limited`，并且不调用阿里云。
- Redis 不可用时返回 `dependency_unavailable`，不降级回 `sms_sends`，也不发短信。
- 停止读写 `sms_sends`。该表只服务限流，没有订单或审计依赖，迁移后删除。
- 注册挑战、错误验证次数、验证码参数只能使用一次，以及设备码，继续留在 PostgreSQL。

## Capabilities

### New Capabilities

- `sms-send-limit`: 买家短信发送的 Redis 限流、失败关闭，以及不再使用 PostgreSQL 发送记录。

### Modified Capabilities

- 无。`openspec/specs` 还没有已同步的身份规格。

## Impact

- `requestBuyerSms` 不再查询或插入 `sms_sends`。
- 新增或复用限流端口。上传限流和短信限流共用一个 Redis 适配器，不各建一个客户端。
- 领域函数仍判断 60 秒和 10 次规则；原子占用由端口完成。
- `REDIS_URL` 已由架构定为启动必填。本变更不新增第二套限流存储。
