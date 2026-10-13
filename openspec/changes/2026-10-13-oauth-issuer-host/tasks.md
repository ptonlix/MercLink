# Tasks

## 1. 授权请求主机

- [x] 1.1 让 `dispatchOidc` 用 `provider.issuer` 设置协议和 Host，并丢掉转发的主机头。
- [x] 1.2 验证监听地址上的发现文档和设备码确认表单都不含 `0.0.0.0`，绝对地址使用 issuer 源站。
