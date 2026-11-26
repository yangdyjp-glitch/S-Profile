# S-Profile 学生服务管理

S-Profile 供团队共同维护学生永久档案、四阶段服务、已递交学校、两类学生记录及奖励归属。业务字段和阶段约定见 [字段与流程确认](docs/字段与流程确认.md) 和 [系统架构设计](docs/系统架构设计.md)。

## 本地运行

使用 Node.js 22.13 或以上版本，在工程目录执行以下命令。

```sh
npm ci
npm run build
npm run setup:local
npm run dev
```

打开终端显示的本机地址，选择「设置管理员」，设置自己的用户名、显示姓名和密码。首次设置凭证有效期为十分钟，管理员创建成功后入口关闭。后续成员由管理员在「账号管理」中创建。首次登录时，名册已有业务确认稿中的渠道、教务、学管及八项服务项目。

`setup:local` 为本地开发生成独立会话密钥并应用尚未执行的 D1 迁移。`.dev.vars` 与 `.wrangler/state` 保存在本机并已被 Git 忽略。`npm start` 可使用同一本地数据库预览最近一次构建。

## 导入和导出

在「导入核对」选择原始 `.xlsx` 文件。系统以文件摘要识别重复上传，保存原件、来源坐标和单元格信息，并整理可以确定归属的资料。对待核行可以核对两侧原文和字段建议，建立新服务、关联既有服务或单独保留来源。历史日期可以只保留年月或原日期文字。解析中断后选择该批次的「继续整理」。

已登录的成员可通过 `POST /api/exports` 获取导出数据。当前列表导出保留所用阶段和筛选条件。完整资料包含学生、服务、学校、按完整年月汇总的两类记录、版本历史、导入来源及待核信息。浏览器工作线程负责生成 Excel。

## 验证

```sh
npx tsc --noEmit
npm run build
npm run test:profile
```

集成测试使用独立的临时 D1 和 R2、随机凭据和合成工作簿。测试覆盖权限、阶段、奖励归属、并发、来源核对、幂等写入及导出文件的回读。

## 托管

沿用 `.openai/hosting.json` 中已登记的 Sites 项目、D1 绑定 `DB` 和私有 R2 绑定 `BUCKET`。部署时应用 `drizzle/` 内的结构迁移。托管环境需要单独设置 `BETTER_AUTH_SECRET` 和用于首次初始化的 `SETUP_OWNER_EMAIL`。后者匹配平台验证的站点所有者身份，仅用于签发一次性管理员初始化凭证。业务接口一律校验站内用户名密码登录建立的会话。

站点访问范围在 Sites 托管层管理。团队如需直接用站内账号访问，托管层须允许访问登录页。在仅所有者可访问的站点，先由所有者完成首次初始化。`LOCAL_SETUP=loopback` 只供本机预览使用。

### Railway

Railway 从 GitHub 的 `main` 分支部署。`railway.toml` 配置生产构建、Node 服务和 `/healthz` 健康检查。生产环境使用 Node.js 24，域名的目标端口和 `PORT` 均为 `8787`。账号、档案、业务记录和导入索引存储在 Supabase PostgreSQL 的私有 `sprofile` 模式中。上传的 Excel 原件及较大的来源行保存在 Railway 的 `/data` 持久卷上。

Railway 的 `DATABASE_URL` 服务变量使用 Supabase 的 Session pooler 连接串，端口为 `5432`。专用登录角色需要该模式的 `USAGE` 和 `CREATE` 权限。数据库客户端验证服务器主机名和证书链，信任的根证书取自 [Supabase 官方 CLI](https://github.com/supabase/cli/blob/develop/apps/cli/src/command-internal/supabase-ca-templates/prod-ca-2021.ts)。

首次切换时，服务在一个 PostgreSQL 事务中建表并读取旧持久卷上的 SQLite 快照，逐批比对字段并核对各表行数。事务提交后记录迁移标记，后续重启直接使用 PostgreSQL。`/healthz` 的 `database` 字段显示当前使用的数据库。

`BETTER_AUTH_SECRET` 保存于 Railway 的服务变量中。首次设置管理员时，通过私下交付的设置入口填写账号和密码。链接片段内的随机密钥与服务变量 `SPROFILE_SETUP_SHA256` 中的 SHA-256 摘要对应。首位管理员建立成功后，初始化入口自动关闭。

构建后运行 `npm run test:profile -- --railway` 验证本地 SQLite 运行方式。安装 PostgreSQL 17 命令行工具后，`npm run test:postgres` 使用临时本机数据库分别验证全新 PostgreSQL 部署和 SQLite 切换，并在重启服务后读取原工作簿和已有会话。
