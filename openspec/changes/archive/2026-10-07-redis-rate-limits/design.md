# Design

## Context

见 `proposal.md`。`smsSendAllowed` 现在接收已发送时间列表。`requestBuyerSms` 从 `sms_sends` 读出这些时间，供应商发送成功后才插入一行。错误次数在 `registration_challenges.wrong_checks`。验证码参数在 `used_captcha_params`。设备码在 `oidc_records`。

## Goals / Non-Goals

**Goals:**

- 60 秒和 24 小时限制保持不变，占用改为原子操作。
- 短信限流和后续上传限流共用一个 Redis 适配器。
- Redis 故障时不发短信，也不回读 PostgreSQL。

**Non-Goals:**

- 不把注册挑战、验证码去重或设备码搬进 Redis。
- 不改变 `sms_rate_limited` 错误码，也不把短信限制并进上传用的 `rate_limited`。
- 不把 Redis 用作缓存或会话库。

## Decisions

### 只迁移发送计数

限流端口按策略名占用额度，至少支持 `sms-send:60s` 和 `sms-send:24h`。占用必须同时检查两个窗口。供应商失败时释放这次占用。成功后保留。这样并发的第二个请求不能在第一个插入前绕过 60 秒限制。

领域函数继续表达 60 秒和 10 次的规则，供单元测试直接调用。应用层不再把整表时间戳传进去做最终判定。

`sms_sends` 停止读写，并由新迁移删除。它不是审计表。历史行不导入 Redis，因为窗口最长 24 小时，部署时旧窗口可以自然失效；实施时在删除前拒绝启动，直到确认没有需要保留的发送审计。当前代码和 PRD 都没有这个审计要求。

### 和其他状态分开

错误验证次数必须和挑战行一起更新，Redis 丢失或过期会让已作废的挑战复活。验证码参数是一次性凭证，设备码是授权协议状态。它们继续留在 PostgreSQL。

### 一个 Redis 客户端

若 `product-image-storage` 已加入 Redis 适配器，本变更给它增加短信策略，不新建第二个客户端。若尚未加入，本变更创建 `src/adapters/redis` 和 `REDIS_URL` 启动检查，上传变更以后复用。测试注入假端口，不连接真实 Redis。

## Risks / Trade-offs

- [部署瞬间丢失未过期的 PostgreSQL 计数] → 只影响最多 24 小时的发送窗口，不丢账号。发布说明写明切换后旧计数不再生效。
- [占用后进程崩溃，额度被占到窗口结束] → 可接受。比超发短信更安全。
- [Redis 成为注册路径的硬依赖] → 与架构一致。不提供 PostgreSQL 兜底。

## Migration Plan

先部署可达的 Redis，再发布不再读取 `sms_sends` 的版本，最后执行删除该表的迁移。回滚应用版本前，若表已删除，旧版本会因缺表无法发短信。回滚必须先恢复表，或只回滚到仍包含该表的版本之前停止。

## Open Questions

无。
