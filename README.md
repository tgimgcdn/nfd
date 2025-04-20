## 更新

欢迎使用我们NFD2.0项目🎉，1分钟内快速搭建教程：

> 用户先去[@BotFather](https://t.me/NodeForwardBot/BotFather)，输入 `/newbot` ，按照指引输入你要创建的机器人的昵称和名字，点击复制机器人吐出的token
> 
> 然后到[@NodeForwardBot](https://t.me/NodeForwardBot)粘贴，完活。
> 
> 详细信息可以参考：[https://www.nodeseek.com/post-286885-1](https://www.nodeseek.com/post-286885-1)

NFD2.0拥有无限配额（自建有每日1k消息上限），且托管在[cloudflare snippets](https://developers.cloudflare.com/rules/snippets/)，理论上不会掉线。如果需要自建，参考下面的自建教程。

# NFD
No Fraud / Node Forward Bot

一个基于cloudflare worker的telegram 消息转发bot，集成了反欺诈功能

## 特点
- 基于cloudflare worker搭建，能够实现以下效果
    - 搭建成本低，一个js文件即可完成搭建
    - 不需要额外的域名，利用worker自带域名即可
    - 基于worker kv实现永久数据储存
    - 稳定，全球cdn转发
- 接入反欺诈系统，当聊天对象有诈骗历史时，自动发出提醒
- 支持屏蔽用户，避免被骚扰

## 搭建方法
1. 从[@BotFather](https://t.me/BotFather)获取token，并且可以发送`/setjoingroups`来禁止此Bot被添加到群组
2. 从[uuidgenerator](https://www.uuidgenerator.net/)获取一个随机uuid作为secret
3. 从[@username_to_id_bot](https://t.me/username_to_id_bot)获取你的用户id
4. 登录[cloudflare](https://workers.cloudflare.com/)，创建一个worker
5. 配置worker的变量
    - 增加一个`ENV_BOT_TOKEN`变量，数值为从步骤1中获得的token
    - 增加一个`ENV_BOT_SECRET`变量，数值为从步骤2中获得的secret
    - 增加一个`ENV_ADMIN_UID`变量，数值为从步骤3中获得的用户id
6. 绑定kv数据库，创建一个Namespace Name为`nfd`的kv数据库，在setting -> variable中设置`KV Namespace Bindings`：nfd -> nfd
7. 点击`Quick Edit`，复制[这个文件](./worker.js)到编辑器中
8. 通过打开`https://xxx.workers.dev/registerWebhook`来注册websoket

## 使用方法
- 当其他用户给bot发消息，会被转发到bot创建者
- 用户回复普通文字给转发的消息时，会回复到原消息发送者
- 用户回复`/block`, `/unblock`, `/checkblock`等命令会执行相关指令，**不会**回复到原消息发送者

## 欺诈数据源
- 文件[fraud.db](./fraud.db)为欺诈数据，格式为每行一个uid
- 可以通过pr扩展本数据，也可以通过提issue方式补充
- 提供额外欺诈信息时，需要提供一定的消息出处

## Thanks
- [telegram-bot-cloudflare](https://github.com/cvzi/telegram-bot-cloudflare)





# NFD Telegram客服机器人

## 项目概述

NFD是一个基于Cloudflare Workers平台的Telegram客服机器人，它允许多个普通用户与一个管理员通过机器人进行通信。机器人具有消息转发、用户管理、防诈骗检测等功能，是一个高效的客服解决方案。

## 技术架构

- **运行环境**：Cloudflare Workers
- **数据存储**：Cloudflare D1 (SQL数据库)
- **消息处理**：Telegram Bot API
- **事件机制**：Webhook

## 主要功能

- **消息转发**：用户发送给机器人的消息会转发给管理员，管理员的回复也会转发给对应用户
- **用户管理**：管理员可以屏蔽/解除屏蔽用户
- **防诈骗检测**：自动检测潜在的诈骗用户并提醒管理员
- **定时通知**：根据设定的时间间隔向管理员发送提醒消息
- **自定义消息**：支持自定义开始消息和通知消息

## 数据库结构

系统使用D1数据库存储信息，包含以下表：

1. **message_mappings**：存储消息ID到用户聊天ID的映射
   - `message_id` - 消息ID (主键)
   - `chat_id` - 用户聊天ID

2. **user_blocks**：存储用户的屏蔽状态
   - `chat_id` - 用户聊天ID (主键)
   - `is_blocked` - 是否被屏蔽

3. **last_messages**：记录用户最后一次消息的时间
   - `chat_id` - 用户聊天ID (主键)
   - `timestamp` - 时间戳

## 环境变量配置

部署前需要设置以下环境变量：

- `ENV_BOT_TOKEN`：Telegram Bot Token，从@BotFather获取
- `ENV_BOT_SECRET`：Webhook安全令牌，用于验证请求来源 
- `ENV_ADMIN_UID`：管理员的Telegram用户ID

## 安装步骤

### 1. 创建Telegram机器人
1. 在Telegram中联系@BotFather
2. 使用`/newbot`命令创建新机器人
3. 保存获得的API令牌

### 2. 设置Cloudflare Workers
1. 在Cloudflare Workers控制台创建新的Worker
2. 上传`worker.js`代码
3. 设置必要的环境变量

### 3. 创建D1数据库
1. 在Cloudflare控制台创建新的D1数据库
2. 将数据库绑定到Worker，绑定名称为`DB`
3. 在D1数据库控制台执行以下SQL命令创建表：

```sql
CREATE TABLE message_mappings (message_id INTEGER PRIMARY KEY, chat_id INTEGER NOT NULL); CREATE TABLE user_blocks (chat_id INTEGER PRIMARY KEY, is_blocked BOOLEAN NOT NULL DEFAULT FALSE); CREATE TABLE last_messages (chat_id INTEGER PRIMARY KEY, timestamp INTEGER NOT NULL); 
```

### 4. 初始化系统
1. 访问`https://your-worker-url/registerWebhook`注册Webhook
2. 如需取消Webhook，访问`https://your-worker-url/unRegisterWebhook`

## 使用指南

### 普通用户
1. 在Telegram中搜索并开始与机器人对话
2. 发送`/start`命令查看欢迎信息
3. 直接发送消息与客服人员(管理员)沟通

### 管理员
管理员可以使用以下命令：

- **回复用户**：直接回复转发到管理员的消息
- **屏蔽用户**：回复用户消息并发送`/block`
- **解除屏蔽**：回复用户消息并发送`/unblock`
- **检查状态**：回复用户消息并发送`/checkblock`

## 数据来源配置

系统使用以下外部数据源：

- **诈骗用户数据库**：`https://raw.githubusercontent.com/LloydAsp/nfd/main/data/fraud.db`
- **通知消息**：`https://raw.githubusercontent.com/LloydAsp/nfd/main/data/notification.txt`
- **欢迎消息**：`https://raw.githubusercontent.com/LloydAsp/nfd/main/data/startMessage.md`

可根据需要修改这些URL指向自己的数据源。

## 从KV到D1的迁移说明

本项目最初使用Cloudflare KV存储数据，现已迁移到D1数据库。主要优势：

1. **结构化查询**：支持SQL查询语言，更灵活
2. **关系型数据**：可以建立表之间的关系
3. **事务支持**：支持ACID事务
4. **更好的扩展性**：随着数据增长更容易管理
5. **性能优化**：可以为查询创建索引

迁移过程中，我们将原来的KV键值对映射到了关系型表结构，并优化了数据访问模式。

## Webhook管理

Webhook是Telegram机器人接收消息的机制，需要手动配置：

- **注册Webhook**：访问`/registerWebhook`端点
- **取消Webhook**：访问`/unRegisterWebhook`端点
- **Webhook路径**：默认为`/endpoint`，可在代码中修改
- **安全性**：使用环境变量中的SECRET进行请求验证

注册成功后，Telegram会将机器人收到的所有消息通过HTTP POST请求发送到您配置的Webhook URL。

## 防诈骗机制

系统会自动检查用户是否存在于诈骗数据库中，如果匹配，会向管理员发送警告。诈骗用户数据库可通过修改`fraudDb`变量指向自己的数据源。

## 定时通知

系统会根据`NOTIFY_INTERVAL`设置(默认1小时)向管理员发送定期通知，可以在代码中修改此设置或通过设置`enable_notification = false`禁用此功能。 
