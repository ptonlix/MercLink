# Design

## Context

重置请求存在 `storefront_reset_requests`。创建只插入 `pending`。执行入口只有管理页批准路由，应用服务再用 `resetExecutionAllowed` 拒绝 Agent。原先对象删除失败被吞掉，随后仍 `clearReleases` 并本地拼一份 `executed` 响应，即使 `UPDATE` 没有改到行。

## Goals / Non-Goals

**Goals:**

- 删除失败时数据库保持原样，请求仍是 `pending`。
- 删除成功后，清空指针、删除发布行、标记 `executed` 在同一个事务里完成。
- 标记影响 0 行就回滚，成功响应只来自写完之后的状态。

**Non-Goals:**

- 不新增 Agent 执行路由。
- 不把对象删除放进 SQL 事务。对象存储没有和 PostgreSQL 共用的事务。
- 不改创建请求的响应形状。

## Decisions

### 先删对象，失败则不动数据库

执行前列出发布源和文件对象键。任一 `delete` 抛错就返回 `dependency_unavailable`，不调用清空。已经删掉的对象无法随数据库回滚，所以失败路径不得再改指针或状态，避免把仍被指针引用的发布标成已执行。

### 数据库改动放在一个事务

对象全部删除成功后，同一事务按外键顺序：把 `storefront_pointer` 的 active 和 previous 置空，删除 `storefront_files`，删除 `storefront_releases`，再 `UPDATE storefront_reset_requests ... WHERE id = $id AND status = 'pending'`。更新计数不是 1 就抛错，由事务回滚指针和删除。调用方看到 false 或异常时不得返回成功。

成功后再读请求和指针。只有状态是 `executed`，且指针不再指向删除前的发布，才返回成功。不在内存里把未标记的请求改写成已执行。

### Agent 仍不能执行

领域规则保持 `actor === "admin" && status === "pending"`。不增加执行路由。创建接口继续只插入 `pending`。

## Risks / Trade-offs

- [部分对象已删除，后续删除失败] → 数据库不改，请求保持 `pending`。重试会再删剩余对象。不能把这种失败报成已执行。
- [标记与清空分成两次提交] → 拒绝。0 行更新必须连同指针清空一起回滚。

## Migration Plan

不改表，不改已应用的迁移。已有 `pending` 请求按新执行语义处理。

## Open Questions

无。
