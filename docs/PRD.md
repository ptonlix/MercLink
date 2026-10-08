# MercLink PRD v1

状态：v1.10  
日期：2026-05-16  
读者：创始人、首个工程师

v0 草案作废。本版只保留能上线的最小闭环。

---

## 1. 这版做什么

MercLink v1 是一个给 AI 用的商品与下单服务。

商家把管理 Skill 交给自己的 Agent，用 API 建目录、定义字段、建商品和规格、上架和下架。买家侧的 Agent 读购买 Skill，查已上架商品并按下单规格购买。支付走支付宝的 AI 支付能力。

完成标准：

> 商家的 Agent 只读管理 Skill，就能分开建两个目录，在各自目录里定义字段，创建带规格的商品并上架。  
> 另一个 Agent 只读购买 Skill，就能查到已上架商品，按指定规格下单，并在支付宝支付成功后查到已支付状态。

买家首次授权时用手机号注册。商家不能自助注册，由超级管理员开通。人不把长期密钥交给 Agent。

---

## 2. 模块

就这四块，不加第五块。

| 模块           | 做什么                                                                    |
| -------------- | ------------------------------------------------------------------------- |
| 商品管理       | 多个目录、目录内自定义字段、商品和可售规格。商家 Agent 通过 API 完成      |
| 商品下单       | 创建订单，调用支付宝 AI 支付，接收支付结果                                |
| 用户管理       | 超级管理员开通商家。买家在授权页用手机号注册。Agent 用 OAuth 取得短期令牌 |
| 落地页与 Skill | 公开商品页；两份 Skill：商家管理、买家查询和下单                          |

---

## 3. 不做

- 不接 Shopify 或其他电商平台。
- 不做独立站装修、主题、购物车页面、营销页。
- 不做推荐、比较、知识图谱、GEO 监测、评分、广告位和跨店排序。
- 不做优惠券、运费计算、发货拆单、库存同步。订单表允许多行，但 v1 的下单接口只接受一行。
- 买家可以查出所有已上架商品，但跨目录只能按标题和价格过滤。自定义字段过滤必须指定商家目录。
- 不自己实现支付。不保存银行卡和支付宝账号密码。
- 不在 Skill 里写死某一家模型的私有插件格式。Skill 只教 HTTP API 和标准 OAuth。
- 不把长期 API Key 作为 Agent 的认证方式。Key 可以留给服务器脚本，不能出现在对话里。
- 不把商品管理做成人点的后台。商家日常仍由 Agent 完成。唯一保留的人工后台是超级管理员开通和停用商家。

---

## 4. 角色

| 角色       | 能做的事                                                                       |
| ---------- | ------------------------------------------------------------------------------ |
| 超级管理员 | 系统预置的唯一管理员。开通、停用商家，重置商家密码。不能下单，也不能直接改商品 |
| 商家       | 由超级管理员开通。在授权页登录并批准商家 Agent。授权页没有商家注册             |
| 商家 Agent | 用商家令牌定义字段、管商品、上下架、看自己目录里的订单                         |
| 买家       | 授权页用手机号和短信验证码注册，并批准买家 Agent。没有目录，不能管商品         |
| 买家 Agent | 用买家令牌下单、查自己的支付结果。查已上架商品不需要登录                       |
| 付款人     | 在支付宝完成支付。付款身份由支付宝识别，不另建账号                             |

同一个人既卖又买时，仍是两个账号。买家不能升级成商家，也不能在授权页把自己注册成商家。

---

## 5. 主流程

```text
超级管理员开通商家
  → 系统创建商家账号和默认目录
  → 商家把 /merchant/skill.md 交给商家 Agent
  → Agent 打开授权页
  → 商家登录并批准。页面不提供注册

商家 Agent
  → 商品不是同一类时，新建另一个目录
  → 在目标目录定义字段
  → 新建商品，再新建可售规格
  → 上架或下架
  → 需要时查询自己的目录、商品和订单

买家把 /skill.md 交给买家 Agent
  → 需要下单时，Agent 打开授权页
  → 没有账号就用手机号注册：人机验证、短信验证码、设置密码
  → 已有账号用手机号登录
  → 买家点批准

买家 Agent
  → 只能看见已上架、且至少有一个可售规格的商品
  → 按规格调用下单接口，订单记在这个买家账号下
  → 把支付宝返回的支付信息交给付款人
  → 支付宝异步通知本系统
  → 再查订单，状态为已支付
```

下架商品只有该目录的商家令牌能看见。公开页面和未登录查询都看不到，也不能下单。

---

## 6. 商品管理

### 6.0 目录

目录是一本独立的商品册。字段定义、字段版本、商品都属于某一本目录，不属于商家账号。

一个商家可以有多本目录。鞋和净化器必须分成两本，因为它们的字段不同。超级管理员开通商家时，系统创建一本名为「默认目录」的册子。只卖一类商品的商家不用先理解目录。

v1 不做的目录能力：

- 不把商品从一个目录搬到另一个目录。两边字段不同，搬走会把值带乱。
- 不对齐不同目录的字段。
- 不在一个目录里再分第二套字段。

目录有名称和货币。货币默认 CNY，整本目录使用同一种货币。

### 6.1 字段

系统字段固定，商家不能删：

| 字段     | 属于 | 说明                   |
| -------- | ---- | ---------------------- |
| title    | 商品 | 商品名，必填           |
| status   | 商品 | `on` 上架，`off` 下架  |
| cover    | 商品 | 图片 URL，可空         |
| price    | 规格 | 售价，单位分，必填     |
| stock    | 规格 | 可空。为空表示不限库存 |
| currency | 目录 | 默认 CNY               |

其余字段由商家加在某一本目录上。每个字段有：

- key：英文或拼音，创建后不改
- 名称
- 类型：文本、数字、是否、单选
- 是否必填

这些字段描述整件商品，同一商品的所有规格共用。例如材质、重量、适用面积。会改变价格或库存的差异不要放进目录字段，放进规格。

商家 Agent 通过 API 添加和修改字段。上传 CSV 不是 v1 必需。不自动补空值。

### 6.1.1 字段会变，但一本目录只有一套当前定义

商家一开始定不准字段，这是正常情况。v1 就要允许改，但同一本目录不能同时存在多套生效定义。商品不绑定旧版本。Agent 先选定目录，再读这本目录的当前定义。

版本记的是每一次变更，不是让旧字段继续活在商品上。

每次被接受的变更都让该商家目录的 `schema_revision` 加 1，并写入一条不可改的变更记录。记录里有操作、变更前、变更后、影响的商品数。版本属于目录，不属于登录账号。

字段 key 创建后不能改，停用后也不能再用。要改含义，就新增字段，再停用旧字段。

变更分两类：

| 变更                                                     | 处理                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| 新增可选字段、改显示名、增加单选项、必填改为可选         | 直接生效。已有商品不用填新字段也能保持上架                         |
| 新增必填字段、可选改为必填、删除单选项、改类型、停用字段 | 先返回预览，不改数据。商家 Agent 带 `confirm: true` 再次提交才生效 |

破坏性变更生效时：

- 能安全转换的值留下。例如文本 `"480"` 改成数字，可以变成 `480`。
- 不能转换、缺必填、或仍在使用被删选项的已上架商品，自动下架。
- 停用字段时，从所有商品的当前属性里去掉这个 key。历史订单快照不动。
- 不静默丢商品，也不假装这些商品仍然符合新定义。

购买 API 遇到已停用的 key，返回 `field_retired`，不返回 `unknown_field`。这样 Agent 知道字段曾经存在，而不是自己写错了。

### 6.2 商品和规格

商品是买家看到的一件货。规格是实际可购买的一项，有自己的价格和库存。

没有尺码、颜色这类差异时，系统自动创建一条默认规格。商家 Agent 仍按「建商品」调用，并在请求里带价格和库存。买家只有一个可买规格时，可以只传商品 ID 下单。

有差异时，商家 Agent 先声明规格轴，再创建存在的组合。例如轴是尺码，组合是 40 和 42。不自动生成所有排列组合，没创建的组合就是不卖。

规则：

- 同一商品的规格必须使用同一组轴。不能一条只有尺码，另一条只有颜色。
- 一旦存在带轴的规格，那条没有轴的默认规格不能再卖。上架时发现它还在，就拒绝上架。
- 规格可以单独下架。商品上架后，买家只看到仍可售的规格。
- 商品下架后，下面的规格都不可买。
- 下架不是删除。删除商品是软删除，有订单也可以删，订单保留快照。
- 恢复商品后仍是下架。恢复规格后仍是不可售，不会自动开卖。
- 不提供物理删除。
- 上架时检查目录必填字段，以及至少一条可售规格有价格。已软删除的商品不能上架。

这些动作都走管理 API，不要求人打开后台表单。

### 6.3 查询

两套可见范围：

| 调用方                     | 能看见                                                 |
| -------------------------- | ------------------------------------------------------ |
| 未登录、买家令牌、公开页面 | 所有商家的已上架商品                                   |
| 商家令牌                   | 只能看自己的目录。商品可看 `on`、`off`，也可按状态过滤 |

查询条件：

- 关键词：匹配标题和文本字段。
- 买家跨目录查询时，只能再按价格过滤。价格看可售规格的最低价和最高价。自定义字段必须带 `catalog_id`。
- 指定目录后，数字支持大于、小于、等于；单选和是否支持等于。
- 分页。

未知字段返回错误，不忽略。

---

## 7. 下单与支付

### 7.1 订单

订单分成订单头和订单行。订单头记录买家、总金额和状态。订单行记录买了哪条规格。支付另记在支付记录里，不写进订单头。

v1 的接口只允许一行。多出来的行直接拒绝。表结构不按一行来设计，以后加购物车不用拆表现有订单。

下单输入：一行规格 ID 和数量，以及调用方自己的业务单号。该商品只有一条可售规格时，这一行可以改传商品 ID。业务单号用来防止重复下单。

订单头保存：

- 订单号、买家 ID、授权记录 ID
- 货币、总金额
- 状态：`pending`、`paid`、`closed`
- 创建时间和支付时间

订单行保存：

- 目录 ID、商品 ID、规格 ID
- 标题、规格、单价、自定义字段的快照
- 数量、行金额

规则：

- 只有买家令牌可以下单。商家令牌不能下单。
- 只能买已上架商品里的可售规格。
- 有库存时，扣减这一行对应规格的库存；支付超时关闭后按行加回。v1 超时默认 30 分钟。
- 行金额等于规格快照价格乘数量。调用方不能传入价格。订单总金额等于各行金额之和。
- 同一个买家的同一个业务单号重复请求返回原订单，不新增行。

买家只能看自己的订单。商家只能看订单行属于自己目录的订单，不能替买家改支付状态。

### 7.2 支付宝

支付只使用支付宝官方的 AI 支付能力。本系统负责创建订单和接收结果，不自己做收银台。

实现时以当时的官方文档为准。国内商户用支付宝面向 AI / 智能体的支付产品。若账号是国际 Alipay+ 商户，则用官方 Agent 支付接口，对应能力至少包括创建支付、查询支付、取消支付和支付结果通知。官方已有的参考实现是 [AlipayPlus MCP](https://github.com/alipay/global-alipayplus-mcp)，其中 `create_payment`、`query_payment`、`cancel_payment` 和支付回调就是这一层。商户私钥只放在服务端。

v1 要接上的动作：

1. 创建订单后，向支付宝创建支付。
2. 把支付链接或支付参数返回给调用方。
3. 接收支付宝异步通知，验签后把支付记录改为 `paid`，再把订单头改为 `paid`。
4. 调用方可以主动查询订单；订单仍是 `pending` 时，向支付宝再查一次，并以支付记录为准更新订单头。
5. 超时未支付则关闭支付记录和订单头，并调用支付宝取消支付。

v1 不做退款。一笔订单 v1 只创建一条支付记录。换支付方式时新增支付记录，不往订单头加字段。

两份 Skill 都必须写明：只有订单状态为 `paid` 才算支付成功。支付链接被打开，不等于成功。

---

## 8. 用户与 Agent 认证

超级管理员、商家、买家是三套账号。买家不能变成商家。商家不能在页面上自己注册。

### 8.1 超级管理员与商家

系统首次部署时，用环境变量创建唯一的超级管理员，不把初始密码写进代码仓库。首次登录必须修改密码，改完之前不能开通商家。

超级管理员在管理页开通商家：填写商家名称、手机号和初始密码。开通时创建默认目录。商家首次登录必须修改密码。

超级管理员可以停用商家、重置密码。停用后，该商家已发出的令牌立即失效，不能再批准新的 Agent。已有订单保留。

商家授权页只有登录和批准，没有注册按钮。没有账号时，页面写明「请联系管理员开通」。Agent 不得引导用户自行注册商家。

### 8.2 买家注册

买家授权页可以注册。手机号是登录标识，必填且唯一。邮箱只是可选资料，不能用来登录，也不要求验证。

注册顺序不能颠倒：

1. 页面加载阿里云验证码 2.0。用户完成人机验证后，前端拿到验证参数。
2. 服务端调用 `VerifyIntelligentCaptcha` 校验。未通过就不发短信。验证参数只能使用一次。
3. 校验通过后，服务端调用号码认证服务的 `SendSmsVerifyCode` 发送短信。签名和模板优先使用控制台赠送的签名和模板。阿里云密钥只放在服务端。
4. 用户提交短信验证码。服务端调用 `CheckSmsVerifyCode` 核验。不在本地保存或比对验证码。
5. 核验通过后，用户设置登录密码，完成本次注册，并留在授权页批准 Agent。

同一手机号已注册时，不新建账号，页面改为登录。登录可以用密码，也可以再次经过验证码 2.0 和短信验证码。两次都要先过人机验证，避免短信接口被刷。

发送限制：同一手机号 60 秒内只能发送一次；24 小时内有次数上限。超过上限直接拒绝，不再请求阿里云。验证码错误多次后，本次注册作废，必须重新做人机验证。

### 8.3 Agent 授权

Agent 不使用长期 API Key。v1 用 OAuth 2.1：用户在自己的浏览器里登录并批准，Agent 只拿到短期访问令牌和可轮换的刷新令牌。

接口返回 `WWW-Authenticate`，并公布 `/.well-known/oauth-protected-resource`。不使用密码模式，不使用隐式模式。

Agent 默认使用设备码。Agent 运行在内网，没有独立的公网回调服务，不能把授权码重定向到公网地址。Agent 申请短码并轮询令牌端点，用户在自己的浏览器里确认短码、登录或注册并批准。短码几分钟失效，不是长期密钥。

商家授权页不提供注册。买家授权页提供第 8.2 节的手机号注册。Agent 请求的权限决定打开哪一种页面，用户不能在购物授权里注册成商家。

Skill 必须写明：不要向用户索要密码、短信验证码或 API Key。买家没有账号时，打开授权页即可注册。

令牌规则：

- 访问令牌约 15 分钟。过期后用刷新令牌换新的，旧刷新令牌立即失效。
- 刷新令牌只存哈希。用户可以撤销某一个 Agent，不影响其他 Agent。
- 商家批准的权限：`field:write`、`product:write`、`product:read`、`order:read`。
- 买家批准的权限：`order:write`、`order:read`。已上架商品查询公开，不需要令牌。
- 商家令牌调用下单，或买家令牌调用上下架，返回无权限。
- 令牌不放进 Skill 示例，也不由用户复制给 Agent。

API Key 只留给没有浏览器的服务器脚本，在登录后的页面创建。Agent 流程不提供 Key。不做子账号和第三方登录。

令牌规则：

- 访问令牌约 15 分钟。过期后用刷新令牌换新的，旧刷新令牌立即失效。
- 刷新令牌只存哈希。用户可以在账号页撤销某一个 Agent，不影响其他 Agent。
- 商家批准的权限：`field:write`、`product:write`、`product:read`、`order:read`。
- 买家批准的权限：`order:write`、`order:read`。已上架商品查询公开，不需要令牌。
- 商家令牌调用下单，或买家令牌调用上下架，返回无权限。
- 令牌不放进 Skill 示例，也不由用户复制给 Agent。

API Key 只留给没有浏览器的服务器脚本，在登录后的页面创建。Agent 流程不提供 Key。不做组织、子账号和第三方登录。

---

## 9. 落地页与 Skill

### 9.1 总落地页

`/` 是整站的公开入口，给人、搜索引擎和 Agent 看同一份内容。它不是营销活动页，也不另建一套文案系统。

页面必须包含：

- 这个服务是什么：给 Agent 查询已上架商品并下单的商品服务。
- 买家和 Agent 怎么开始：商品列表、购买 Skill、API 根地址。
- 商家怎么开始：商家 Skill。页面写明商家不能自助注册，需要管理员开通。
- 当前已上架商品的摘要列表，数据来自商品查询，不手工挑选。
- 发现文件的地址：`/llms.txt`、`/sitemap.xml`。

页面由服务端直接输出 HTML。标题、描述、规范链接和 JSON-LD 与正文一致。不依赖前端脚本才出现主要内容。

### 9.2 公开页面

| 路径                 | 谁来读              | 内容                                               |
| -------------------- | ------------------- | -------------------------------------------------- |
| `/`                  | 人、搜索引擎、Agent | 总落地页                                           |
| `/products`          | 人、搜索引擎、Agent | 当前已上架商品列表                                 |
| `/products/{id}`     | 人、搜索引擎、Agent | 单个已上架商品的全部已公开字段和可售规格           |
| `/skill.md`          | 购买 Agent          | 如何查商品、下单、查支付结果                       |
| `/merchant/skill.md` | 商家 Agent          | 如何建目录、定义字段、建商品和规格、上下架、查订单 |
| `/llms.txt`          | Agent               | 指向总落地页、商品列表、两份 Skill 和 API          |
| `/sitemap.xml`       | 搜索引擎            | 总落地页、商品列表、已上架商品、两份 Skill         |
| `/robots.txt`        | 搜索引擎            | 允许公开页面，不收录授权页、超管页和 API           |

商品页从商品记录渲染。不另写一套文案。HTML 里同时给一段 JSON，字段与 API 一致。下架、删除和不可售商品不进入站点地图，并返回不可收录状态。

这些公开文档都不需要登录。管理 Skill 只讲调用方法，不包含任何商家的商品数据。

搜索优化只做这些，不做排名监测，也不为每个商品写营销稿：

- 每个公开页面有稳定规范链接、标题和一段从事实生成的描述。
- 总落地页使用 `Organization` 结构。商品列表使用 `ItemList`。商品页使用 `Product` 和 `Offer`，价格、货币和库存状态与 API 一致。
- `llms.txt` 只给地址和一句说明，不复制全部商品。

### 9.3 购买 Skill

`/skill.md` 必须包含：

1. 能做什么：查已上架商品，创建订单，查询支付结果。
2. 认证：未登录可以查已上架商品。下单前申请设备码，让用户打开返回的确认地址。没有账号就在随后的页面用手机号、人机验证和短信验证码注册。不要向用户索要验证码、密码或 API Key，也不要使用公网回调。
3. 查询商品的方法和参数。返回里怎么区分商品和可售规格。
4. 下单必须用规格 ID。只有一条可售规格时才可以只传商品 ID。价格单位是分。幂等业务单号、支付信息怎么用。
5. 查询订单状态。
6. 限制：不能查下架商品，不能改商品，不能自己传价格，不能把未支付当成成功。
7. 错误示例：商品不存在、已下架、库存不足、Key 无效、字段不存在、权限不足。

### 9.4 商家 Skill

`/merchant/skill.md` 是商家 Agent 的入口，必须包含：

1. 能做什么：建目录，定义字段，新建和编辑商品与规格，上架，下架，查看订单。
2. 认证：申请设备码，让已开通的商家打开返回的确认地址并批准。不要引导用户自助注册商家，不要索要密码或 API Key，也不要使用公网回调。
3. 先列目录。不是同一类商品时新建目录，不要把另一类的必填字段加进当前目录。
4. 字段的新增、列表，以及变更预览和确认。目录字段描述整件商品；规格轴只描述可售差异。
5. 新建商品、规格、上架、下架、软删除和恢复的方法和示例。写明下架、软删除、字段停用不是一回事。价格单位是分。
6. 上架失败，或破坏性变更导致商品被下架时，怎么读错误。
7. 限制：不能修改其他商家的数据，不能把订单标成已支付，不能用买家令牌调用这些接口，也不能用商家令牌下单。
8. 管理 Skill 地址本身可以公开，商品数据不能公开。

Skill 与真实 API 不一致时，以 API 为准，并在同一天改 Skill。验收时各用一个没有看过后台的 Agent，只给对应的 Skill URL。授权必须通过浏览器或设备码完成，不能把令牌写进对话。

---

## 10. API

基础路径：`/api/v1`  
需要登录的接口：`Authorization: Bearer <访问令牌>`。没有令牌时返回 401，并带 `WWW-Authenticate` 和资源元数据地址。  
错误体：`{ "error": "<code>", "message": "<可读说明>" }`

### 购买侧

```http
GET /api/v1/products?q=关键词&limit=20
GET /api/v1/products/{id}
GET /api/v1/catalogs/{id}/schema
POST /api/v1/orders
GET /api/v1/orders/{id}
```

过滤示例：

```http
GET /api/v1/products?field.weight_g.lte=500
```

`field` 过滤必须同时带 `catalog_id`。购买侧只返回已上架、且有可售规格的商品。商品详情里的 `variants` 只含可售规格。

创建订单。v1 的 `items` 只能有一项：

```json
{
  "client_order_no": "agent-20260516-001",
  "items": [{ "variant_id": "var_42", "qty": 1 }]
}
```

返回：

```json
{
  "id": "ord_123",
  "status": "pending",
  "amount": 159900,
  "currency": "CNY",
  "items": [
    {
      "id": "oli_1",
      "variant_id": "var_42",
      "qty": 1,
      "amount": 159900
    }
  ],
  "payment": {
    "id": "pay_1",
    "provider": "alipay",
    "status": "pending",
    "action": "https://..."
  }
}
```

`payment.action` 是支付宝返回给付款人完成支付的链接或参数。具体形状跟官方接口走，Skill 里按实际返回写。

### 商家侧

商家令牌才能调用：

```http
GET /api/v1/catalogs
POST /api/v1/catalogs
GET /api/v1/catalogs/{id}/schema
GET /api/v1/catalogs/{id}/fields
POST /api/v1/catalogs/{id}/fields
POST /api/v1/catalogs/{id}/fields/changes
GET /api/v1/catalogs/{id}/products?status=on|off
POST /api/v1/catalogs/{id}/products
PATCH /api/v1/catalogs/{id}/products/{product_id}
POST /api/v1/catalogs/{id}/products/{product_id}/publish
POST /api/v1/catalogs/{id}/products/{product_id}/unpublish
DELETE /api/v1/catalogs/{id}/products/{product_id}
POST /api/v1/catalogs/{id}/products/{product_id}/restore
POST /api/v1/catalogs/{id}/products/{product_id}/axes
POST /api/v1/catalogs/{id}/products/{product_id}/variants
PATCH /api/v1/catalogs/{id}/variants/{variant_id}
DELETE /api/v1/catalogs/{id}/variants/{variant_id}
GET /api/v1/manage/orders?catalog_id=
```

商家接口都要带目录 ID。令牌只能访问自己的目录。变更记录只有该目录的商家令牌能读。

新建字段：

```json
{
  "key": "weight_g",
  "label": "重量",
  "type": "number",
  "required": false
}
```

新建目录：

```json
{
  "name": "跑鞋",
  "currency": "CNY"
}
```

没有规格差异的商品，价格和库存写在商品上，系统创建默认规格：

```json
{
  "title": "示例商品",
  "price": 159900,
  "stock": 10,
  "fields": {
    "weight_g": 480
  }
}
```

有规格差异时，先声明轴，再创建实际出售的组合：

```json
{
  "key": "size",
  "label": "尺码"
}
```

```json
{
  "option_values": { "size": "42" },
  "price": 159900,
  "stock": 4
}
```

新建后商品默认下架，规格默认可售。商家 Agent 确认后再调用 `publish`。

破坏性变更先预览：

```json
{
  "op": "make_required",
  "key": "weight_g"
}
```

返回是否破坏兼容、将下架的商品数和原因，此时不改数据。确认时用同一次操作加上 `"confirm": true`。

商家侧订单列表只读。没有“标记已支付”接口。

---

## 11. 数据

一本目录只有一套当前字段定义。商品上的值跟着这本目录的当前定义走。版本不拆成多套并行 Schema，而是一条变更记录加订单快照。

`schema_revisions` 不挂在账号上。字段版本属于目录。买家没有目录，也没有字段版本。

```text
merchants                     商家账号
  └── catalogs                注册时有一本，之后可以有多本
        └── schema_revisions  每次字段变更一条，只追加
        └── product_fields    这本目录的字段；停用的也留着，防止 key 被复用
        └── products          商品，fields 是整件商品共用的属性
              └── product_axes   规格轴，例如尺码、颜色
              └── variants          可售规格，各自有价格和库存
        └── order_items       这个目录卖出的订单行

buyers                        买家账号，没有目录
  └── api_keys
  └── orders                  订单头
        └── order_items       买了哪些规格
        └── payments          支付记录，不写在订单头上
```

```text
admins
  id, phone, password_hash, must_change_password,
  created_at, updated_at, deleted_at

merchants
  id, name, phone, email, password_hash, status, created_by,
  must_change_password, created_at, updated_at, deleted_at
  status = active | disabled
  created_by -> admins.id
  unique(phone) where deleted_at is null

buyers
  id, phone, email, password_hash, phone_verified_at,
  created_at, updated_at, deleted_at
  unique(phone) where deleted_at is null

catalogs
  id, merchant_id, name, currency, schema_revision,
  created_at, updated_at, deleted_at
  merchant_id -> merchants.id

api_keys
  id, owner_type, owner_id, prefix, hash, scopes,
  created_at, updated_at, revoked_at
  owner_type = merchant | buyer

oauth_grants
  id, owner_type, owner_id, client_name, scopes, refresh_hash,
  created_at, updated_at, revoked_at
  owner_type = merchant | buyer

schema_revisions
  id, catalog_id, revision, op, before, after, affected_count, created_at
  unique(catalog_id, revision)
  catalog_id -> catalogs.id

product_fields
  id, catalog_id, key, label, type, required, choices, status,
  created_at, updated_at, retired_at
  status = active | retired
  unique(catalog_id, key)
  catalog_id -> catalogs.id

products
  id, catalog_id, title, status, cover, fields, schema_revision,
  created_at, updated_at, deleted_at
  catalog_id -> catalogs.id

product_axes
  id, product_id, key, label, position, created_at, updated_at
  unique(product_id, key)
  product_id -> products.id

variants
  id, catalog_id, product_id, sku, option_values, price, stock, status, cover,
  created_at, updated_at, deleted_at
  catalog_id -> catalogs.id
  product_id -> products.id
  status = on | off
  unique(catalog_id, sku) where sku is not null and deleted_at is null

orders
  id, buyer_id, oauth_grant_id, client_order_no, currency, amount, status,
  created_at, updated_at, paid_at, expires_at
  buyer_id -> buyers.id
  status = pending | paid | closed
  unique(buyer_id, client_order_no)

order_items
  id, order_id, catalog_id, product_id, variant_id,
  title_snapshot, variant_snapshot, price_snapshot, fields_snapshot, schema_revision,
  qty, amount, created_at
  order_id -> orders.id
  catalog_id -> catalogs.id
  product_id -> products.id
  variant_id -> variants.id

payments
  id, order_id, provider, provider_trade_no, status, amount, currency,
  created_at, updated_at, paid_at
  order_id -> orders.id
  status = pending | paid | closed
```

`fields` 是 JSON 对象，例如 `{ "weight_g": 480, "color": "黑" }`。不再为每个值单独建一行，也不为文本、数字、是否各留一个空列。

约束：

- 写入 `fields` 时，key 必须是该目录的 `active` 字段。类型必须匹配。单选值必须在 `choices` 里。
- 可选字段可以不出现在 `fields` 里。这表示没填，不是字段不存在。
- 上架时按当前 `required` 字段检查商品 `fields`。价格和库存不在 `fields` 里。
- `option_values` 的 key 必须是该商品已声明的规格轴。同一商品的未删除规格，组合不能重复。
- 快照写在订单行上，不写在订单头上。`fields_snapshot` 保存下单时的目录字段。`variant_snapshot` 保存规格轴和 SKU。之后改字段或规格，旧订单行仍按快照解释。
- 价格用整数分，记在规格上。订单行复制单价和行金额。订单头只保存各行合计。
- 货币来自规格所属目录。v1 只有一行，所以订单头货币就是这一行的货币。
- 支付结果以 `payments` 为准。订单头的 `paid` 只是便于查询的副本，不能由商家接口直接修改。

### 11.1 更新时间

会变化的记录都有 `created_at` 和 `updated_at`。插入时两者相同。之后只要业务内容变化，就更新 `updated_at`，包括改价、上下架、软删除、作废 Key、订单变为已支付或关闭。

`schema_revisions` 是只追加的变更记录，写入后不能改，所以只有 `created_at`。

管理接口返回商品和订单时带上 `updated_at`，方便 Agent 判断数据有没有变过。

### 11.2 软删除

软删除用 `deleted_at`。为空表示还在。普通查询默认不返回已软删除的数据。

不是所有表都软删除。已经有专门状态的，不另加一套删除标记：

| 数据                                   | 怎么处理          | 原因                                                            |
| -------------------------------------- | ----------------- | --------------------------------------------------------------- |
| 商家、买家、目录                       | `deleted_at`      | 账号或目录关闭后不能再登录和交易，但历史订单还要能对上          |
| 商品、规格、目录                       | `deleted_at`      | 和下架分开。下架仍可管理，删除是从正常列表拿掉                  |
| 字段                                   | 沿用 `retired_at` | 停用已经是字段的软删除。key 必须继续占着，不能再加 `deleted_at` |
| API Key、OAuth 授权                    | 沿用 `revoked_at` | 作废后对应令牌立即失效                                          |
| 订单头、订单行、支付记录、字段变更记录 | 不删除            | 这是交易和字段变更的证据。软删除会让对账和幂等失效              |

规则：

- 唯一约束只约束未删除的数据。商家或买家软删除后，同一个手机号可以再次开通或注册。
- 买家邮箱可空、可重复，不能作为登录标识。
- 商品或规格软删除后，公开页面、买家查询和下单都视为不存在。商家要用 `deleted=true` 才能在管理接口看到。
- 商品有订单也可以软删除。订单不跟着消失，继续用自己的快照。
- 恢复商品只清掉商品的 `deleted_at`，状态保持下架。规格不自动恢复为可售。
- 商家被软删除时，他的目录一起标上 `deleted_at`。下面的商品不逐条改，查询时目录已删除就不可见。订单保留。

---

## 12. 验收

1. 商家 Agent 只读 `/merchant/skill.md`，能创建第二本目录，两本目录的必填字段互不影响。它能在其中一本添加数字字段和单选字段，创建商品并上架。
2. 同一商品能有两条规格，价格和库存不同。买其中一条只扣这一条的库存。
3. 同一个 Agent 能把该商品下架。下架后，公开页面和购买 API 都不再返回它，下单被拒绝。下架商品仍出现在商家的正常列表里。
4. 有订单的商品可以软删除。删除后买家看不到，订单快照还在。恢复后商品是下架，不是上架。
5. 新增一个可选字段后，原来已上架的商品保持上架。把它改成必填时，不带确认的请求不改数据；确认后，没填该字段的已上架商品变为下架。
6. 字段停用后，key 不能再建。停用前生成的订单仍能从快照读到旧值。购买 API 用这个 key 过滤时返回 `field_retired`。
7. 买家令牌调用建目录、上下架、新建商品或字段变更时被拒绝。商家令牌调用下单时被拒绝。
8. 购买 Agent 只读 `/skill.md`，能按规格完成查询和下单。商品有多条可售规格时，只传商品 ID 被拒绝。
9. 下单请求里的 `items` 多于一项时被拒绝。通过时，行金额等于该规格价格乘数量，订单金额等于行金额，调用方改不了价。
10. 支付宝沙箱或正式测试支付成功后，通知到达，订单变为 `paid`。
11. 未支付订单在超时后变为 `closed`，库存加回对应规格。
12. 一个商家的令牌不能读到或修改另一个商家的目录、商品和订单。一个买家的令牌不能查看另一个买家的订单。撤销一个 Agent 的授权后，它的刷新令牌立即失效。
13. 商家授权页没有注册入口。未开通的手机号不能登录商家。买家未通过验证码 2.0 时不会发送短信；短信未核验通过时不能完成注册。
14. 重复提交同一个 `client_order_no` 不会创建第二张订单。

---

## 13. 顺序

1. 超级管理员开通商家、商家登录授权、买家手机号注册、验证码 2.0、短信核验、设备码和令牌撤销。
2. 商家管理 API：多目录、字段、变更预览和确认、商品、规格、上下架、软删除和恢复。
3. `/`、`/merchant/skill.md`、商品页、`/skill.md`。
4. 下单、订单行、支付宝支付记录、通知和查单。
5. 用两个外部 Agent 分别按两份 Skill 跑通第 12 节。

买家注册未通过验证码 2.0 时，不得调用短信发送接口。商家授权页不得出现注册入口。

前一步没有真实数据跑通，不开始下一步。支付文档如果和本文档的返回示例不一致，改文档和 Skill，不自己发明支付协议。
