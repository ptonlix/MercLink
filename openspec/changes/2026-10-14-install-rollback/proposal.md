# Proposal

## Why

安装和升级中途按 Ctrl+C，或升级没有完成时，现在会留下半份部署文件。新机器在写出配置前取消，应该像没运行过。已经安装过的机器升级失败时，应该回到升级前的部署文件和版本号。

## What Changes

- 第一次安装在 `.env` 写好之前取消或失败，删除这次新建的空目录和尚未提交的 `compose.yaml`。
- `.env` 一旦写好，取消或启动失败都不再删除它，也不删除数据卷。
- 升级先复制现有 `compose.yaml` 和版本号。下载、替换或启动没有完成时，把这两项还原。不自动把已经换上的容器退回旧镜像。
- 不新增卸载命令，不改安装提问，不安装系统包。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `production-install`: 安装和升级在未完成时按阶段回滚。

## Impact

- `scripts/install.sh`、安装验收测试、README、`docs/ARCHITECTURE.md`。
- 不改应用、支付、授权或数据库。
