# The other library — video-shotcraft's 124 shot cards

A second, engine-different library lives on this machine: video-shotcraft (Remotion) ships 124
shot recipe cards, 150 demo components and a case-law aesthetic file. This page is the bridge:
**which card is the same idea as which language/technique here, and when it is worth opening.**

Read a card only when this library's [techniques.md](techniques.md) and
[languages/](languages/) leave the move under-specified. The cards are worth the read for three
things this library states in prose: measured durations and stagger intervals, a physical
metaphor already tested with a user, and the recorded failures ("4px felt like nothing; 8× larger
was approved").

## Where the cards are

- Cards: `~/Projects/video-shotcraft/references/shots/<category>/<card>.md` (124 files; the
  category list below matches the directory names).
- Demo implementation: `~/Projects/video-shotcraft/demos/<category>/<card>/` — the card's
  `参考实现` section names the exact file.
- Case-law aesthetic file: `~/Projects/video-shotcraft/references/aesthetic-rules.md`
  (`R`/`Q`/`S`/`C`/`P` numbered rules, each with a user quote and a self-check question).
- Gallery with motion previews: <https://vincentwei1021.github.io/video-shotcraft/>

The cards and their `一句话` are Chinese; the table below quotes them rather than translating, so
the index can be matched against the source text without drift.

## Converting a card into this project

1. **Frames → seconds.** Card numbers are 30 fps: `f ÷ 30`. Beat-bound moments become
   `OM.beat(n)`; a card's holds stay holds (`tl.to({}, { duration })`), not padding.
2. **Pixels → ratios.** Card positions assume 1920×1080. Scale by the short-edge ratio and
   express the move as `x`/`y`/`scale`/`rotation` — `om check` rejects `left`/`top`/`width` motion.
3. **Take the parameters, not the code.** The demo is a Remotion component (`useCurrentFrame()`
   pure function, `<Sequence>` for ranges, `spring({frame, fps})`). Map `<Sequence>` →
   timeline label, `spring()` → `OM.spring(bounce)`, `<CameraMotionBlur>` → `om render --blur`.
4. **Read 已知坑 and 参数表 first.** Every card carries the user verdict that settled its
   numbers; that is the part this library does not have, and the reason to open the card at all.
5. **Motion blur is where the two engines part.** Cards that ask for shutter blur on a fast camera
   move (`crash-zoom-punch`, `space-camera-moves`, `steep-tilt-glide`) mean *directional* blur
   weighted by velocity. `om render --blur` averages up to 8 subframes uniformly, so a 6-frame
   zoom comes out as a grey multi-exposure of the whole page rather than a streak — the same
   failure the cards record for Remotion's `<CameraMotionBlur>`. On a crash, ship it crisp
   (a 6-frame jump reads as a cut, which is the intent), or drive a CSS `filter: blur()` amount
   from the camera delta yourself. Verified on this machine, 2026-11-01.

## Reverse index — start from what the shot must say

| The shot must say | Cards |
|---|---|
| Look here, exactly here | `crash-zoom-punch` · `fui-hud-moves` · `draw-svg-trace` · `spotlight-hero-card` |
| There are many of these | `card-stack` · `deck-deal-flyin` · `page-waterfall-wall` · `orbit-ring-title-open` · `cloner-depth-echo` |
| This is what it does, step by step | `cursor-flyover` · `type-and-filter` · `terminal-3d` · `doc-park-left-pill-deal` |
| The page builds itself | `scanline-assemble-flyin` · `assemble-then-type-flyin` · `list-reveal` · `wall-reveal-moves` |
| New chapter | `bottom-push-stack-wipe` · `page-turn-transitions` · `wipe-transitions` · `shot-transitions` |
| A claim, with weight | `slam-entrance-moves` · `outline-word-fill` · `lead-word-zoom-assemble` · `paper-title-card` |
| The numbers | `chart-live-moves` · `gauge-readout-moves` · `timeline-travel` · `before-after-slider-scrub` |
| How the parts connect | `bezier-source-converge-merge` · `integration-hub-map` · `glow-flyline-moves` |
| Density, on the beat | `quad-split-parallel-scenes` · `panel-grid-moves` · `beat-cut-moves` · `trailer-grammar-moves` |
| Where it comes from | `brand-ink-open` · `text-as-mask` · `fracture` · `stroke-segment-build` |
| And that is the brand | `outro-group-photo-launch` · `logo-shrink-wordmark-lockup` · `ui-to-brand-morph` · `grain-dissolve` |

## All 124 cards

`language / technique` points into this library; `read it when` is the card's own 适用, condensed.

### camera (10)

| Card | 一句话 | language / technique | read it when |
|---|---|---|---|
| basic-3d-scene | 卡片散布 3D 空间，相机依次飞行对齐，末步总览 | 3d-object / interface in space | 概念、路线图、三步法的空间化讲述 |
| crash-zoom-punch | 全景一拍急推到特写（6f），过冲回弹或撞停震屏 | cursor-demo / push in · anticipation | 功能段"点名"，把视线按到目标模块上 |
| cursor-flyover | 俯瞰后依次飞到四个功能区，光标先到指点 | cursor-demo / screen-studio zoom | 单页产品的功能巡览 |
| depth-layer-moves | 三层视差滑轨横移出纵深，落定时主角浮起 | 3d-object / parallax | 平面截图要有厚度：卡组、列表、整页 |
| graze-face-tour | 镜头贴 UI 表面低飞，文字悬浮后加速贴落 | 3d-object / interface in space · drift | 把界面当地景的功能区巡礼 |
| overhead-camera-moves | 俯仰抬正揭示、桌面俯拍两式 | 3d-object / 3D orbit | 用俯仰角做开场定场 |
| space-camera-moves | 爆炸分解与穿越两式 | 3d-object / interface in space | 把平面页面当 3D 实体的高光段 |
| steep-tilt-glide | 页面 60° 强透视侧立，自身滑过固定机位 | 3d-object / drift | 长页面的炫技巡览 |
| tension-camera-moves | 冻结环绕、拉远孤立 | 3d-object / orbit · pull back | 情绪节点（震撼、收束） |
| terminal-3d | 三个终端窗散布空间，窗间飞行 + 打字 | system-diagram / 3D orbit · type on | 开发者产品的 CLI 三步命令 |

### data (5)

| Card | 一句话 | language / technique | read it when |
|---|---|---|---|
| before-after-slider-scrub | 分割杆猛甩后慢扫，"处理后"显影揭出 | data-story / wipe · match cut | 前后对比类功能（增强、优化、重构） |
| chart-live-moves | 示波流线、人形柱、装不下的增长三式 | data-story / draw on · linear | 讲实时性、每人一个数、增长破表 |
| gauge-readout-moves | 满弧扫针自检、单表读数两式 | data-story / draw on · spring | dashboard 开场仪式、指标揭晓 |
| scroll-brake-moves | 长卷指数减速精准停住 | card-montage / ease-in-out · hold | changelog、发布史、“一直在发货” |
| timeline-travel | 沿刻度轴加速掠过，每格弹立短停 | data-story / carousel | 里程碑、发展史 |

### effects (15)

| Card | 一句话 | language / technique | read it when |
|---|---|---|---|
| assemble-then-type-flyin | 骨架先飞入贴合，文字再逐字旋入 | card-montage / stagger · type on | 页面自己长出来的开场 |
| aurora-bloom-bg-flip | 柔焦 blob 升起，整底压暗到近黑 | generative-field / colour-field flip | 叙事转折（"多年以来…→一切都变了"） |
| brand-frame-snap | 品牌色粗画框先长出包住全屏 | modular-grid / nested reveal | 双模式双章节的全片包装层 |
| fui-hud-moves | 四角标取景框从画面外咬合锁定 | cursor-demo / draw on ✱ lock-on | 目标点名（替代箭头圈红） |
| glow-flyline-moves | 光斑底噪与飞线弧三式 | system-diagram / draw on | 暗场段落讲数据流向 |
| icon-performance-moves | 图标连跳递增、落地压扁 | continuous-morph / spring · anticipation | 半屏级图标特写、新功能引出 |
| impact-feedback | 顿帧 + 伤害数字 + combo 跳字 | cursor-demo / spring · hold ✱ hit-stop | 砸入、撞停的"命中一瞬" |
| light-play-moves | 聚光扫字、单点扫光 | art-styles / mask reveal | 暗场标题揭示、主角卡加冕 |
| radial-ripple-phone-chips | 同心圆错相呼吸，手机屏内 feed 缓滚 | liquid-glass / linear · drift | 移动端“这就是它”的定格镜 |
| riso-print-hits | 标题撞停瞬间裂成双色套印错位 | art-styles / hard cut ✱ misregistration | 纸墨审美的命中强调，全片 1–2 次 |
| scan-bracket-sweep | 四角落下取景括号，扫描光带往复 | cursor-demo / draw on | "正在解析这份内容"的过程镜 |
| scanline-annotate-focus | 扫描线越过区块，四角取景框弹簧收拢 | cursor-demo / draw on ✱ scanline | "AI 正在读你的页面" |
| scanline-assemble-flyin | 蓝图槽位被扫描线逐个唤起组件 | continuous-morph / stagger ✱ scanline | 页面从空白图纸自己生成 |
| slam-entrance-moves | 金田透视急停、记分牌砸落三式 | kinetic-type / hard cut · spring | 主角卡、KPI 卡的重拳入场 |
| spotlight-sweep-moves | 光到即亮光走即暗、贴边泛光横摇 | art-styles / mask reveal | 暗片里逐个介绍面板 |

### interaction (11)

| Card | 一句话 | language / technique | read it when |
|---|---|---|---|
| autolayout-gap-dial | 间距数一改，整排块被推开再收拢 | cursor-demo / morph | 设计工具"改一个数界面跟着动" |
| canvas-materialize-moves | 表格行沿弧线飞出、跨容器落到画布 | continuous-morph / shared element | "生成结果落到画布上" |
| chip-grid-single-select-blackout | 选中帧插按压块，底几帧内变黑 | cursor-demo / spring · colour-field flip | 单选、套餐、档位选择的因果镜 |
| collab-cursor-moves | 五光标错峰飞入、正弦漂移、打字 | cursor-demo / drift | 协作场景的氛围底 |
| glass-pill-dictation-typing | 玻璃胶囊略大弹出后缓落，内部暖光铺满 | liquid-glass / scale from zero · type on | 语音、AI 输入框登场 |
| hashtag-to-pill-materialize | 打出 #word，1 帧硬切成胶囊标签 | continuous-morph / morph · hard cut | 标签、话题功能演示 |
| picker-carousel-feature-cycle | 焦点药丸不动，内容穿过它逐项吸附 | card-montage / carousel · spring | 逐个念出功能名 |
| segmented-thumb-hero | 超大分段控件，thumb 位移当主角 | liquid-glass / spring | 模式切换、二选一的宣告镜 |
| theme-switch-moves | 斜向扫场就地换肤、调色板波纹两式 | continuous-morph / colour-field flip · flood | 深色模式、主题功能 |
| type-and-filter | 真 UI 上打字，网格收敛成一张卡 | cursor-demo / type on · push in | 搜索、筛选、进入详情的操作叙事 |
| voice-waveform-live | 64 根竖条随说话起伏、停顿缩成点线 | generative-field / linear | "正在听你说" |

### opening (11)

| Card | 一句话 | language / technique | read it when |
|---|---|---|---|
| brand-ink-open | 十字准星描画→字标压印→打字机副标→hold | kinetic-type / draw on · type on · hold | 先立名号再进产品的片头 |
| crane-rise-reveal | 从一行数据特写沿 Y 轴减速升起 | 3d-object / pull back | 从细节到全局的开场定场 |
| dataviz-landscape-open | 流线汇入主干，重景深低速飞越 | generative-field / drift | 品牌级抽象开场（数据宇宙） |
| fracture | 5×5 碎片按中心波纹聚合又炸开 | art-styles / stagger | 从混沌到成形的第一镜 |
| icon-field-colorize | 灰阶图标铺满，品牌色横带扫翻全场 | modular-grid / stagger · flood | 功能全景先摆出再上色 |
| letterspace-materialize | 大字距字标同帧起笔、同帧齐收 | kinetic-type / draw on | 片头片尾字标登场 |
| magician-card-flourish | 星芒闪现后卡片翻飞登场 | art-styles / spring | 单张卡、封面、主视觉揭晓 |
| orbit-ring-title-open | 八张卡沿椭圆匀速公转 | card-montage / carousel · linear | “这个产品有一整套东西” |
| spotlight-hero-card | 钨丝聚光扫过锁定一张卡，推进悬浮 | art-styles / mask reveal · push in | 单一主角式产品开场 |
| stroke-segment-build | 标题拆成断笔乱序点亮，末段才可读 | kinetic-type / draw on | 吊悬念的产品名或大数字，全片 ≤1 次 |
| text-as-mask | 超粗标题字内部透出产品面板 | kinetic-type / mask reveal · nested reveal | 口号与产品画面二合一 |

### outro (6)

| Card | 一句话 | language / technique | read it when |
|---|---|---|---|
| grain-dissolve | 整行字爆成噪点，凝聚成发光短字标 | art-styles / collapse into the mark | "XX. Now Live"式上线宣告 |
| logo-shrink-wordmark-lockup | 大环收束成图标，过冲刹车换字标 | continuous-morph / collapse into the mark | 片尾标准 lockup 定妆 |
| neon-triple-marquee | 三行对向霓虹跑马灯 recap | retro-digital / linear | 三连词口号的余韵拍 |
| outro-group-photo-launch | 全片元素飞来围住字标合影 | showreel / collapse into the mark · 3D orbit | 多功能产品的全家福终镜 |
| ui-strip-away-outro | 点击发布后 UI 由外向内层层蒸发 | continuous-morph / exit faster than entrance | "一键之后复杂性消失" |
| ui-to-brand-morph | 图标翻扁成竖线再撑开成品牌 | continuous-morph / morph · collapse into the mark | outro 前最后一拍 |

### rhythm (8)

| Card | 一句话 | language / technique | read it when |
|---|---|---|---|
| beat-cut-moves | 三次白闪硬切同一画面的三个裁切 | showreel / hard cut on the beat · white flash | 把"切"本身打成鼓点 |
| beat-step-list-theme-cycle | 形容词列表逐拍上移，固定胶囊接住换色 | kinetic-type / on the beat | 同一产品多种气质的展示 |
| panel-grid-moves | 漫画斜格劈出同一主体的三个机位 | editorial-collage / hard cut on the beat ✱ comic split | 同主体多机位定格并列 |
| quad-split-parallel-scenes | 2×2 四宫格并行跑微场景 | showreel / hard cut on the beat | "功能很多、同时发生"的密度峰 |
| rhythm-interrupt-moves | 三级跳切推近，同构图无补间硬跳 | cursor-demo / hard cut | 用打断连续性当节奏器 |
| sakuga-timing-shift | 一拍三的顿挫移动，高潮切成逐帧丝滑 | showreel / stagger ✱ frame quantisation | 单元素的强调性位移 |
| speed-ramp-freeze | 流动→定格圈注→解冻 | editorial-collage / hold | 把重点停下来给人看 |
| trailer-grammar-moves | 三镜 9f 速剪的预告片钩子 | showreel / hard cut on the beat · anticipation | 正片前先塞三刀 |

### transition (15)

| Card | 一句话 | language / technique | read it when |
|---|---|---|---|
| bottom-push-stack-wipe | 新场景连底从底边上推顶出旧景 | modular-grid / wipe · push-through | 多章节换章骨架 |
| card-flip-reveal | 卡沿 Y 轴翻面，侧棱掠过换内容 | continuous-morph / morph | "功能→成果"成对叙事 |
| card-flock-tumble | 三张页卡从侧棱翻飞成阶梯站定 | card-montage / stagger | 能量高潮段的爆点转场 |
| circle-match-iris | 光圈从圆元素炸开，新页圆形接同一圆心 | continuous-morph / iris · match cut | 前后镜都有圆形主体 |
| gradient-transition | linear/radial/conic 渐变之间平滑过渡 | generative-field / colour-field flip | 章节底色的连续变奏 |
| line-carry-transition | A 的进度条延伸出画，跟线横移围出新场景 | continuous-morph / shared element · match cut | 两景有图形亲缘 |
| mosaic-reframe | 12 瓦片在三种排版间连续变形 | modular-grid / morph | 同一批内容多种看法 |
| page-turn-transitions | 对开门裂幕、整页翻体块 | showreel / wipe · push-through | 章节级换页仪式 |
| print-texture-transitions | 墨渗须边洇开吃掉旧景 | art-styles / flood and contract | 纸墨审美的换景接缝 |
| shot-transitions | 推进流白、甩镜急刹、穿窗擦除三式 | showreel / whip · push-through · wipe | 任何两镜衔接处 |
| tear-streak-transitions | 16 横条错位抖动中硬切 | retro-digital / hard cut | 数字故障语义的高能换页 |
| transition-hidden-cut | 遮挡隐形切、对撞开屏、暖色漏光 | showreel / match cut | 要“无痕换景”或仪式感开屏 |
| transition-travel | 镜头钻进章节标题的字形完成换景 | continuous-morph / push-through | 前后镜有容器级空间关系 |
| white-flash-logo-simplify-cut | 词标炸出白闪过曝，回落后已是定妆 | showreel / white flash cut · collapse into the mark | 华丽演绎→干净定妆 |
| wipe-transitions | 百叶窗切条、几何边界扫过 | showreel / wipe | 新旧页都不动的通用交接 |

### typography (22)

| Card | 一句话 | language / technique | read it when |
|---|---|---|---|
| blur-slide | 逐词 y 0.38em→0 + blur 18→0 | kinetic-type / blur-in | 标题副标成对出现（慎用 blur） |
| brace-expand | 花括号先出现再弹开包住标题 | modular-grid / draw on · spring | 技术产品的章节字卡 |
| countdown-arc-scatter | 数字沿大弧排布，扫盘急停 | data-story / linear | 倒计时、时长承诺 |
| document-typewriter-reveal | 整页文档在光标后自己写出来 | cursor-demo / type on | 文档、报告类功能镜 |
| flying-words | 关键词沿 z 轴从远处擦身飞过 | kinetic-type / parallax | 关键词云的动态背景 |
| glitch-cycle | 等宽槽位循环轮播状态短语 | retro-digital / type on | 加载、构建、部署状态播报 |
| gradient-word-sweep | 关键词被渐变彩光扫过充能 | kinetic-type / wipe | 给单个动词充能 |
| lead-word-zoom-assemble | 首词 2.3 倍占屏，hold 中继续推近 | kinetic-type / push in · type on | Introducing 字卡 |
| marker-underline-title | 马克笔下划线从左到右描画 | hand-drawn / draw on | 标题强调单个关键词 |
| outline-word-fill | 空心词 3.2 倍急缓收缩落位 | kinetic-type / flood | 单词式利益点的重锤 |
| paper-title-card | 逐词压印上纸，一词斜体强调，短划线收束 | editorial-collage / mask reveal · hold | 章节转场、价值主张字卡 |
| pill-chip-slot-cycle-handled | 胶囊内词竖向滚轮轮换 | kinetic-type / type on | "我们替你搞定 ___"句式 |
| pill-slot-cycle | 句干钉死，句尾 pill 每 0.7s 滚一格 | kinetic-type / type on | 功能列举的最优雅解法 |
| text-column-converge | 左右两词硬切轮换后合拢 | kinetic-type / match cut | 特性清单收束到产品名 |
| title-demote-to-label | 大标题缩小 0.3x 平移到左上角 | continuous-morph / shared element | 章节开场后让位给内容 |
| type-assembly-moves | 逐字裂升、字形重排三式 | kinetic-type / stagger | 大标题入场 |
| type-entrance-moves | 字符坠落弹跳、重力砸落 | kinetic-type / spring | 章节字卡入场 |
| type-rhythm-sync | 字重随鼓点变粗弹回 | kinetic-type / on the beat | 标题与音轨强绑定 |
| typewriter-moves | 误删重打的改口三幕剧 | kinetic-type / type on | 否定式文案、自带时间性 |
| vertical-word-roll-blur-cycle | 句尾词竖向滚动三次换词 | kinetic-type / type on | "Crafted for ___"句式 |
| word-relay-filmstrip | 左列页面卡步进滚动，右侧大词接力 | card-montage / match cut | 一个主体多种能力 |
| word-relay-geometry | 三个利益词各带一套几何接力 | kinetic-type / draw on | 三点式利益陈述 |

### ui-entrance (21)

| Card | 一句话 | language / technique | read it when |
|---|---|---|---|
| avatar-bracket-carousel | 四角对焦框钉住，头像队列在框内滚动 | card-montage / carousel | "一个位置，多种角色" |
| bezier-source-converge-merge | 四个来源的贝塞尔曲线汇聚到一点 | system-diagram / draw on | 多源整合、统一接入 |
| card-stack | 模板卡从下方逐张弹入叠成一摞 | card-montage / stagger · spring | 交代"我们有一组东西" |
| carousel-3d | 8 张卡成环自转，每 45° 停靠 | card-montage / carousel · 3D orbit | 作品集、集成清单的循环展示 |
| cloner-depth-echo | 主卡复印出 7 个分身沿纵深排开 | continuous-morph / stagger | 多副本、多租户、规模感 |
| deck-deal-flyin | 牌堆特写环绕，硬加速发牌进网格 | card-montage / stagger | 内容量大、源源不断汇入 |
| doc-park-left-pill-deal | 文档左滑缩小停住，右侧慢速发牌 | cursor-demo / shared element · stagger | 旁白驱动的结论逐条给出 |
| draw-svg-trace | 墨线沿元素轮廓跑一圈把它画出来 | hand-drawn / draw on | 单个卡片的被点名入场 |
| element-body-moves | 接触阴影离面抬升，卡片有身体感 | cursor-demo / spring · drift | 给悬浮补"身体在变"的证据 |
| integration-hub-map | 旧页面翻 180° 落成中枢，图标同帧弹出 | system-diagram / stagger | 集成、生态能力段 |
| list-reveal | 垂直菜单按 10f 间隔依次 scale 找位 | cursor-demo / stagger | 导航、侧边栏入场 |
| list-stack-press | 列表卡逐张飞上摞起，计数器同步 | card-montage / stagger · spring | feed、收件箱"每天有新东西" |
| neon-frame-forerun | 霓虹框先行成型，页面在框内由暗转亮 | art-styles / draw on | 给 UI 面板做登场仪式 |
| neon-frame-orbit-drop | 描框后镜头绕页面旋转，文字同帧落下 | art-styles / 3D orbit · draw on | 单页 UI 的一次性隆重登场 |
| page-waterfall-wall | 页面截图分列在 3D 后仰墙差速滚动 | showreel / parallax | 多页面、多模板的体量感 |
| product-card-progressive-assemble | 填充光标领先跳格，字段逐个自建 | cursor-demo / stagger · type on | 结构化抽取、自动填充 |
| radial-wave | 圆点阵列按到波源距离错峰点亮 | generative-field / stagger | 系统上电一拍 |
| research-card-stack-scroll | 论文卡每 12 帧一张飞入叠压 | card-montage / stagger | 读了很多资料的量级交代 |
| row-embed | 内容行从空中降下收平，底边亮一道缝 | continuous-morph / stagger | 结构化数据长进页面 |
| value-stagger-gradient | 16 根柱的高度、色相、模糊各自铺成错峰 | generative-field / stagger | 参数化能力的演示 |
| wall-reveal-moves | bento 逐格点亮、蓝图描线成形，原位显形 | modular-grid / stagger · draw on | 整页界面的整体亮相 |

## ✱ Moves the cards have and this library does not

These seven cards name a move that has no entry in [techniques.md](techniques.md). They are the
reason the index exists: read the card, take its numbers, and if the film keeps using the move,
write the entry into techniques.md instead of leaving it in this table.

| Move | Card | What is missing here |
|---|---|---|
| Frame quantisation | `sakuga-timing-shift` | Driving a tween from `floor(t·fps/3)` so the object steps at 10 fps, then switching to smooth mid-move. Nothing here quantises time. |
| Hit-stop | `impact-feedback` | 2–5 frozen frames at the landing plus a counter that ticks; `Hold` covers the pause, not the freeze-then-resume on the landing frame. |
| Misregistration | `riso-print-hits` | The same headline twice in two inks, offset 2–4 px, dissolving after the impact. |
| Reticle lock-on | `fui-hud-moves` | Four corner brackets closing on a target with a snap, before the target does anything. |
| Scanline | `scanline-annotate-focus` · `scanline-assemble-flyin` | A line that sweeps and triggers per-region reveals at the moment it passes. |
| Comic split | `panel-grid-moves` | The frame cut into tilted panels on the beat, each holding a different camera on one subject. |
| Crash zoom | `crash-zoom-punch` | 6-frame push with a stop or an overshoot; `Push in` here is deliberate, not violent. |

## What is worth taking beyond the moves

- `aesthetic-rules.md` — numbered case law with the user's own words. R4 ("full-frame impacts ≤3 per
  film") and Q1/Q2 (real screenshots, rasterize at native size before 3D) are checkable rules this
  library states as taste; they can go straight into `om check` or a review pass.
- `references/sound-design.md` + `assets/scripts/sfx-source.py` — Freesound search and licensed
  download with attribution. `OM.sfx` only knows built-in timbres, so a real foley sample needs the
  file mixed in outside `om sound`; the sourcing method itself transfers.
- `references/music-beat-sync.md` — how to read a track's kicks before pinning cuts. Only relevant
  when the user brings their own BGM instead of letting the score be composed here.
