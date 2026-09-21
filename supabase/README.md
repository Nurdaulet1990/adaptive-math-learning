# 数据库上锁 + 班级周榜 · 上线手册

**现状**：浏览器拿着公开的 key 直接读写 `students` / `events` 两张表——任何人都能导出全部孩子的姓名、班级、PIN 和答题记录，也能改、能删。教师 PIN `1234` 写在公开源码里。

**改完之后**：浏览器不再碰表，只调用十几个 `esep_*` 函数；每个函数在服务端校验会话 token（或教师密码），只动这个 token 有权动的那一行。PIN 在服务端比对，只存哈希。班级周榜由服务端汇总，浏览器只拿到「本班前五名的名字和分数、我的名次、本年级各班人均」。

分三步，前两步可回滚。**顺序不能换。**

---

## 第 0 步 · 备份 + 确认表结构（5 分钟）

1. Supabase Dashboard → Database → Backups，确认有今天的备份；或者在 Table editor 里把 `students`、`events` 各导出一份 CSV。
2. SQL editor 里跑：

```sql
select table_name, column_name, data_type from information_schema.columns
 where table_schema='public' and table_name in ('students','events') order by 1, ordinal_position;
select tablename, policyname, roles, cmd from pg_policies where schemaname='public';
select extname, extnamespace::regnamespace from pg_extension where extname='pgcrypto';
select tablename, tableowner from pg_tables where schemaname='public' and tablename in ('students','events');
select table_name from information_schema.views where table_schema='public';   -- 有没有别的 view 把这两张表露出去
```

迁移脚本假设（从 `core.js` / 教师页的读写推断，**我没有连过线上库**）：
`students(id, name, pin, klass, state jsonb, time_ms, last_seen, created_at)`、`events(student_id, t, ev jsonb)`。`id` 是 uuid 还是整数都行，脚本不假设。
**以下任一情况先停，把查询结果发给我：** 列名对不上；pgcrypto 不在 `extensions` schema；两张表的 owner 不是 `postgres`（那样第 3 步的 `enable row level security` 会失败）；`public` 里有引用这两张表的 view。
不要对这两张表用 `FORCE ROW LEVEL SECURITY`——函数是靠「表的 owner 不受 RLS 限制」通过的。

## 第 1 步 · `01_additive.sql`（只增不删，线上不受影响）

在 SQL editor 里整段运行。可重复运行。然后：

```sql
select count(*) from public.students where pin_hash is null;          -- 应为 0（PIN 不是 4 位数字的旧行会留下，单独看一下）
select esep_private.set_teacher_secret('这里换成一句长的话，至少 12 个字符');  -- 教师密码，只存哈希；以后改密码再跑一次这句
select esep_private.set_join_code('алма27');                              -- 学校口令（可选但强烈建议，见下）；传 '' 关闭

-- 冒烟测试：把四个函数都走一遍（类型不匹配只有在运行时才会暴露）
with l as (select public.esep_login('__smoke__', '0000', '9Z', 'алма27') v)
select v->>'token' is not null                                            as login_ok,
       public.esep_save(v->>'token', '{"x":1}'::jsonb, 5)                  as save_ok,
       public.esep_events(v->>'token', '[{"t":null,"ev":{"ev":"answer","ok":true,"u":"smoke"}}]'::jsonb) as events_1,
       public.esep_board(v->>'token') ? 'me'                               as board_ok
  from l;                                                                  -- 期望：t, t, 1, t
delete from public.students where name = '__smoke__';
```

**学校口令（join code）**：设了之后，**新名字**第一次注册必须输口令（老师在班里说一次），老学生永远不用输。不设的话，网上任何人都能注册进任意班、看到该班周榜前五名的名字、往教师列表里塞垃圾账号。

Dashboard → Settings → API → *Exposed schemas* 里**不要**加 `esep_private`（默认就没有）。

## 第 2 步 · 部署新客户端（分支 `db-lockdown-board`）

合并、等 GitHub Pages 发布（约 1–10 分钟）。然后亲自走一遍：

- 学生：用一个已有账号的名字 + PIN 登录 → 进任意路线答两题 → 回首页看到今日目标 +2；Table editor 里 `events` 有新行，`ev` 里带一个 `u` 字段。
- 教师：`teacher/` 用第 1 步设的密码登录 → 列表、单个学生、改站、重置 PIN 都能用。
- 输错 PIN → 提示「PIN басқа」。

**孩子们会感觉到的变化**：所有人要重新输一次 PIN（旧会话没有 token）；「这台设备以前登录过」的按钮现在只帮忙填名字，PIN 还是要输；忘了 PIN → 教师页里重置（哈希不可逆，看不到原 PIN）。

这一步之后新旧客户端都能用，**但新客户端注册的学生没有明文 PIN，旧缓存页面登不进他们的号**——所以验证完就接着做第 3 步，不要隔夜。

## 第 3 步 · `02_lock.sql`（上锁，可回滚）

运行后验证匿名 key 真的读不到了（把 URL 和 key 换成 `core.js` 里那两个）：

```bash
curl -s "https://<project>.supabase.co/rest/v1/students?select=name,pin&limit=1" -H "apikey: <publishable key>"
# 期望：permission denied / 401 / 空数组之外的任何「拿到数据」都算失败
```

还开着旧页面的设备会提示「Қосылу мүмкін болмады」，刷新即可（各页 `?v=9`）。

**回滚**：跑 `02_rollback.sql`，并把客户端回退到上锁前的提交。第 1 步的东西可以留着。

## 第 4 步 · 一周后 · `03_drop_plain_pin.sql`（不可逆）

确认不需要回滚了，再删明文 `pin` 列。先备份。

---

## 之后随时 · `04_challenges.sql`（同学挑战「жарыс»，只增不删，可重复跑）

第 1 步之后任何时候都能跑；没跑之前首页只是不显示挑战卡片，别的不受影响。规则全部在服务端：

- 异步：A 先打，B 下次打开 app 再打，不需要同时在线；同一组 10 道题由服务端生成并存下来；**答案由服务端判分**，浏览器不上报分数。
- B 打完之前，任何函数都不会返回 A 的成绩。
- 只能选**双方都已通过**的乘法表站（`AR-04/05/06/09/10/13–16` ↔ ×2,5,10,3,4,6–9；映射写在 `esep_private.ch_stage`，必须与 `ar/stages.js` 一致）——比赛是巩固已会的内容，不是赶新课。
- 只限同班；每人每天最多发起 3 场；同一对手有未完成的挑战时不能再发；7 天没人应战自动失效；`tester` 不参与。
- 赢 3 星、输 1 星、完全打平各 2 星；用时取浏览器上报值与服务端实际经过时间的较小者。

页面：`challenge/`（选人 → 选表 → 作答 → 结果），首页显示「收到的挑战」和「我发起的挑战出结果了」。

## 自己演练（不碰线上）

```bash
# 本地起一个一次性的 Postgres 16（trust 认证，端口 54329，socket 在 /tmp），然后：
npm i pg playwright
node supabase/test/run.js    # 56 项：迁移可重复跑（含第 3 步之后）、每个函数以 anon 角色测、限流、口令、11 万条事件下周榜 <10 ms、上锁后直接读写全部被拒、回滚
node supabase/test/run_challenges.js   # 21 项：挑战函数（资格、保密、服务端判分、平局、每日上限、过期）
node supabase/test/e2e_challenge.js   # 11 项：两个浏览器各扮一个学生，走完一整场
node supabase/test/e2e.js    # 22 项：真页面 → 拦截所有 supabase 请求 → 以 anon 角色打到本地库；含恶意 state / 事件、离线、教师页
```

`test/00_baseline_guess.sql` 是我**猜的**现有表结构，只用于演练，绝不要在线上跑。

## 第 6 步（可选）· `05_rooms.sql` —— 挑战房间（жарыс бөлмесі）

**只增不删、可重复运行**，需要 01 和 04 已经跑过。没跑之前，首页和教师页只是不显示房间入口，别的不受影响。

是什么：一个学生（或老师在教师页）开房间、选乘法表 → 得到一个 4 位房间号 → 全校任何人输入房间号就能进（同班同学的首页上会直接出现「某某开了房间 · Қосылу」，不用输号）→ 开房间的人点「Бастау」→ 所有人**同一时刻**拿到**同一组 10 道题**，最多 3 分钟 → 出排名。

规则（全部在服务端）：
- 题目由服务端生成并保存，**服务端判分**，浏览器不上报分数；**用时只认服务端的钟**（从开始到交卷），浏览器报的时间不采用——所以中途刷新页面占不到便宜（刷新后回到刚才那道题，已答的保留）。
- 学生开房间只能选**自己已通过**的乘法表（或「аралас」= 自己通过的表混合，至少 2 张）；老师可以选任意一张（或 2–9 混合）。
- 加入不设门槛（课堂上要全班一起玩）；没通过那张表的孩子进得去，页面会提示一句。
- 排名先看答对数，答对数相同才看用时。
- **学生只看得到前三名和自己的名次**，看不到谁垫底；完整名单只在教师页。
- 学生之间只看得到**名字的第一个词**（房间号全校通用，所以不给全名）；10 分钟内输错 10 次房间号就要等 10 分钟——9000 个号没法挨个试。
- 每人同时只能开一个房间、每天最多 10 个；没人点开始的房间 30 分钟后自动关闭；开始后不能再加入；最多 60 人。
- 有人关了页面不交卷也卡不住大家：开房间的人自己交卷后（开始 20 秒以后）可以点「Күтпей аяқтау」提前结束；老师在教师页可以结束/关闭**任何**房间。没交卷的排最后。
- 星星：第 1 名 3 颗；第 2–3 名 2 颗（至少 4 人参赛时）；其余交卷的 1 颗；没交卷 0 颗。战绩：参加几场、几次第一、几次前三、累计超过多少人。

页面：`room/`（学生）、教师页顶部的「Жарыс бөлмесі」卡片（老师：大号房间号可以投到大屏，实时看谁进来了、谁交卷了，结束后看完整排名）。
轮询：房间里每 2 秒问一次服务端（`esep_room_state` 用只读的会话检查，不写库）；30 个孩子 ≈ 15 次请求/秒，Supabase 免费版没问题。

测试：`node supabase/test/run_rooms.js`（数据库 53 项，全部以 anon 角色调用）、`node supabase/test/e2e_rooms.js`（三个学生 + 一个老师、四个浏览器走完两场，24 项）。上线前做过一轮独立的对抗式评审，发现的 20 条里 18 条已修（见提交说明），剩下两条是和 04 相同的已知取舍：开房间资格依据的 `state` 由浏览器上报；`tester` 账号可以参加房间。

v1 只有乘法表。要加别的题型：扩 `esep_private.room_items` + `room/index.html` 里的出题显示。

## 周榜规则（`esep_board`）

- 分数 = 本周一（UTC+5）以来，**一次答对、没用提示、不在定位测里**的题数。重试后答对的不算（runner 会先记一条 `attempt`）。
- 计分发生在 `esep_events` 写入的那一刻，累加到 `esep_private.day_stats`（每人每天一行）；`esep_board` 只读这张小表，事件表再大也是毫秒级。01 脚本末尾会把最近 15 天的旧事件回填一次。
- 每个孩子每天最多收 4000 条事件，超出丢弃（防刷、防把库撑爆）。
- 只返回：本班前 5（名字 + 分数）、我的名次和分数、「比上周同一时刻多多少」、同年级各班的人均分（班里近 30 天活跃 ≥3 人才显示）。`tester` 账号不参与。
- 分数来自客户端上报的事件，会改浏览器的孩子可以刷分——试点阶段可以接受；PV 连点「Тексеру」的 bug 也会刷高，要在 PV 那边修。

## 顺手修掉的（都在 `core/core.js` / `teacher/index.html`）

- 离线进度丢失：登录时服务器旧状态会覆盖本地新状态 → 现在本地缓存**只有在含未发送的改动（`cache.dirty`，持久化）且比服务器新**时才胜出；已同步过的缓存永远不胜出，所以时钟偏快的设备不会一直压过别的设备。共用设备上，上一个孩子没发出去的进度会被单独存起来，等他下次在这台设备登录时再合并。
- 事件丢失：离开页面时发送后立刻清队列 → 现在队列只在正常同步确认后才清，事件带随机 `u`，服务端对 (学生, u) 去重，重发无害。
- 共用设备：上一个孩子没发完的事件不会再记到下一个孩子名下。
- 教师页：所有来自数据库的值都转义（学生能写这些行）；`esc()` 补上了引号。
- 登录：名字精确匹配（不分大小写），`*` `%` `_` 不再是通配符。错 PIN 按「名字 + 来源地址」计：同一地址 10 分钟错 8 次，只锁这个地址——外人没法把孩子锁在外面；同一名字来自所有地址合计 40 次才全局锁（限制分布式猜 PIN）。同一教室共用一个出口 IP，所以同学之间仍可能互相锁 10 分钟；教师重置 PIN 会清掉锁。
- 教师登录只按来源地址限流，没有全局锁。教师页有了「шығу」，退出即作废 token；token 12 小时过期。
- 教师页把来自学生 state 的每个数字强制转成数字、丢弃非对象的站点、单行渲染失败不拖垮整页；CSV 导出对以 `= + - @` 开头的单元格加 `'`；手动设站前先取该生最新 state 并盖 `_t` 时间戳。

## 没做 / 已知限制

- 教师只有**一个共用密码**，没有分老师、分班的账号。要细分得上 Supabase Auth。
- 来源地址取自请求头 `cf-connecting-ip` / `x-forwarded-for`（PostgREST 的 `request.headers`）。**我没法在本地验证 Supabase 实际转发哪个头**；如果都取不到，限流退化为「只按名字」，功能不受影响。上线后可以在 SQL editor 里看 `select name_key from esep_private.login_fails order by t desc limit 5;`，`|` 后面有地址就说明取到了。
- 周榜分数来自客户端上报，懂技术的孩子可以伪造事件刷分（每天 4000 条封顶）。
- `esep_save` 仍是整块覆盖（后写赢）。同一孩子两台设备同时做题仍会互相覆盖。
- 4 位 PIN 的哈希离线可以秒破——哈希只是不让人「顺手看到」，真正的保护是匿名角色根本读不到这一列。
- `core/core-stub.js`（路线作者本地用的假 core）没有加 `days()` / `board()`，路线用不到它们。
