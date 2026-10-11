# Design

## Context

公开商品由 `toPublic` 组装。它已经读取目录字段定义，但 `publicFields` 只留下键和值。内置商品页和 `/products/{id}.md` 都遍历这个对象，所以人看到的是 `origin` 而不是「产地」。公开 JSON 和筛选协议也使用同一份键。

## Goals / Non-Goals

**Goals:**

- 给人看的内置商品页用显示名做字段标题。
- 商品 Markdown 保留 `键: 值`，并在下一行写 `含义：显示名`。
- 显示名和值来自同一次公开查询，不增加第二次商品读取。
- 公开 JSON 的 `fields` 保持键值对象。

**Non-Goals:**

- 不改 `field.key` 槽位，也不要求已激活的自定义店面改版式。
- 不把显示名放进 JSON-LD 或公开 API。
- 不改规格轴展示。

## Decisions

### 显示名跟公开商品走，但不进 JSON

`PublicProduct` 增加可选的 `fieldLabels`。`toPublic` 用活动字段定义，按与 `publicFields` 相同的键集合填入。没有定义时不编造含义。`publicProductJson` 不输出这个字段，所以 `GET /api/v1/products/{id}` 的 `fields` 形状不变。

页面和 Markdown 只读这份缝。没有标签时，页面退回键，Markdown 不写 `含义：`。

### 页面只替换可见标题

有标签时，`<dt>` 是标签，值的格式不变：布尔仍是「是 / 否」，空值仍是「未填写」。字段列表放进已有的 `.facts` 网格。键不作为标题出现。

### Markdown 注释固定在下一行

```text
- origin: 北海合浦
  - 含义：产地
```

键仍在冒号前，Agent 可以继续按键读取。含义只来自标签，不解释类型或候选项。

### 机器标识只进 Markdown

给人看的商品页删除「商品信息」和「查看结构化商品信息」。商品 ID、目录 ID、整数分、原始可售状态和货币代码改写到 `/products/{id}.md`，整数分必须写成 `价格整数分：`，避免和主币价格混淆。页面仍显示主币价格和「有货 / 缺货」。公开 JSON 和 JSON-LD 不变。

### 买家 Skill 点明不要把显示名当键

Skill 告诉 Agent：商品 Markdown 会注明含义；筛选和写入仍用键。schema 接口仍是字段定义来源，不删除。

## Risks / Trade-offs

- [自定义店面模板仍打印 `field.key`] → 那是页面自己声明的槽位，这次不改。内置页和 Markdown 先对人、对 Agent 分开。
- [标签和键相同] → 仍写 `含义：`，避免 Agent 猜测这一行是否省略了。
