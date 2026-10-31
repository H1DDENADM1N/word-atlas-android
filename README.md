<div align="center">

<img src="docs/assets/android-atlas.jpg" alt="word-atlas-android：图鉴网格" width="32%">　<img src="docs/assets/android-word.jpg" alt="词卡" width="32%">　<img src="docs/assets/android-today.jpg" alt="今日" width="32%">

# word-atlas-android

**把词光装进手机：完全离线的安卓版。**

7,298 个雅思词条 · 原创插画 · 内置英美语音 · 零权限 · 断网可用

[![Code: MIT](https://img.shields.io/badge/Code-MIT-17283B?style=flat-square)](LICENSE)
[![Dataset: CC BY 4.0](https://img.shields.io/badge/Dataset-CC_BY_4.0-AD5038?style=flat-square)](CONTENT_LICENSE.md)
![APK: ~1.0 GB](https://img.shields.io/badge/APK-~1.0_GB-2F5D50?style=flat-square)
![Permissions: none](https://img.shields.io/badge/Permissions-none-2F5D50?style=flat-square)
[![Upstream](https://img.shields.io/badge/Upstream-designfuchen%2Fword--atlas-17283B?style=flat-square&logo=github)](https://github.com/designfuchen/word-atlas)

**本仓库**：<https://github.com/H1DDENADM1N/word-atlas-android>
**上游原版**：<https://github.com/designfuchen/word-atlas>

</div>

---

## 这是什么

这是 [word-atlas](https://github.com/designfuchen/word-atlas)（词光）的一个分支，只做一件事：**把同一个应用打包成完全离线的安卓 APK**。

词库、插画、录音、例句、复习算法全部来自上游，一条内容都没有改动。改的都是外壳——构建方式、数据加载、语音兜底、以及几处只有装在手机上才会暴露的问题。

原版是网页优先的开源项目，跑在浏览器里，媒体文件按需从网络取；这个分支把它塞进安卓 WebView，用 `file://` 直接打开，再把所有"会联网"和"依赖系统组件"的环节逐个替换掉。装一次，之后无论是飞行模式还是地铁隧道，全部功能照常。

## 与上游 word-atlas 的区别

一句话：**内容相同，运行方式不同。** 上游教你怎么把词背下来，这个仓库负责让它在没有网络、没有服务器、没有系统语音包的手机上跑起来。

### 一张表看清

| | **word-atlas**（上游原版） | **word-atlas-android**（本仓库） |
| :--- | :--- | :--- |
| 交付形态 | 网页应用 + 开放词库 | 安卓 APK（内含同一份前端） |
| 运行环境 | 浏览器访问网站或 `npm run dev` | 安卓 WebView，`file:///android_asset/www/index.html` |
| 网络 | 需要：媒体按需加载，可缓存供离线使用 | **完全不需要**：清单里没有任何权限，含 `INTERNET` |
| 本地服务 | Vite dev server / 静态托管 | 不启动服务、不监听端口 |
| 数据加载 | `fetch()` 拉分词片 | 构建期内联为 `atlas-embed/data.js`，资源随包 |
| 语音兜底 | 浏览器 `speechSynthesis` / 系统 TTS | APK 内置 Kokoro-82M（sherpa-onnx），不用系统 TTS |
| 保存与分享 | 浏览器下载链接 | 存到「下载 / Word Atlas」，随后拉起系统分享面板 |
| 界面主题 | 浅色 / 深色 / 跟随系统 | 追加极光、星光两套夜空与三种英文字体；修复「跟随系统」在 WebView 下恒为深色的问题 |
| 词卡 | 单个音标行 | 英音与美音并列；点词头看音节；例句、译文、搭配、词族、近义与释义里的词都能点开小窗 |
| 真题 | 无 | 「雅思语境」下面多一节**真题例句**，1,211 条剑桥雅思 4 原文与译文，标出处 |
| 体积 | 仓库约 1 GB 资源 | APK 约 **1005 MB**（全部资源都在里面） |
| 更新方式 | `git pull` / 网站自动更新 | 重新构建并安装（换签名需先卸载） |
| 构建工具 | Node + Vite | 再加 JDK 17 + Android SDK，**不需要 Gradle** |

### 三条硬保证

| 保证 | 怎么做到的 |
| :--- | :--- |
| **不能联网** | `AndroidManifest.xml` 里没有任何 `<uses-permission>`。缺少 `INTERNET`，系统内核拒绝为该 UID 创建 socket，代码层绕不过去。另设 `usesCleartextTraffic="false"` 与只信任系统证书的 Network Security Config。 |
| **没有服务器** | 页面从 APK 内的 `assets/www` 直接以 `file://` 打开，图片和录音相对引用。整个应用不监听任何端口，不做请求拦截代理。 |
| **没有运行时下载** | 词库索引、73 个词条分片、真题例句与音节标注索引、24 段界面音效在构建时内联；7,298 幅插画、7,298 张缩略图、22,905 段录音作为文件放进 APK。运行时没有一次 `fetch`。 |

另外：不含账号、埋点、统计或第三方 SDK。

### 为手机补的几处

这些不是"安卓移植的副产品"，而是这一版真正多出来的东西：

- **学习界面按「一屏」重排。** 手机上原来四个选项加反馈卡放不进一屏：作答后的反馈是吸底浮层，正好盖住后两个选项，图片题还得再往下滑才看得全。现在会话页锁在 `100dvh`，提示区弹性收缩（插图、听音球、拼写配图都按 `dvh` 封顶），选项固定在底部槽位；作答后反馈卡**顶替**选项的位置，不再遮挡。桌面端仍是双列选项加并排反馈。
- **答题与词卡按拇指重排。** 四个选项从 54 px 长到 68 px，离屏幕底边从 8 px 抬到 26 px，并撤掉 1–4 序号（数字键仍能选，只是不再画在按钮上）。作答后的卡片不再只是「看一眼」：可以直接播放单词和例句，点词头进入完整词条，例句中文可以先高斯模糊、点一下才显示；例句、译文、常用搭配、词族、近义词，连释义里那半句英文，都能点开小窗查词。「我的」里还能让日常例句、雅思语境例句跟着单词一起自动朗读，一条读完接下一句，切走即停。
- **词卡下面多了真题例句。** 从第三方的《雅思真题例句词典》导入 1,211 条剑桥雅思 4 的原文与译文，2,216 个词条用得上：在「雅思语境」下面多一节「真题例句」，标着出处（`C04T2L3` 就是剑 4、Test 2、听力 Part 3），带中文翻译，一个词有多条时点「换一句」往后翻。这些句子没有录音，朗读交给 APK 自带的 Kokoro。导入脚本是 `scripts/atlas/import_ielts.py`，只收句子中真的出现了该词的那几条——词典本身也会把 `visitor` 链到只讲 "a variety of shopping" 的句子上，那种显示出来只会让人困惑。
- **词头点一下看音节。** 点词卡上那个大单词，字母之间会浮出「·」——`ex·hib·ition`，再点一下复原。分隔点不是猜的，取自《牛津高阶》词条自带的 `syllable` 属性（`scripts/atlas/import_syllables.py` 从 OALDPEX 里抽出来，4,672 个词条有），所以和纸质词典的断法一致。试过用同一批标注训切分模型去补词典缺的部分，双音节词也只有 82% 能对上，所以没标的就是没标：`study`、`hotel` 这类词点下去没有变化。
- **键盘不再挡内容。** 打字页用一个透明 `<input>` 接管输入，它在挂载时就已聚焦，之后再 `focus()` 是空操作——WebView 因此不再唤起输入法，真机上点屏幕没反应。现在先 `blur()` 再 `focus()`，并经原生桥接显式 `showKeyboard()`；`viewport` 补了 `interactive-widget=resizes-content`，键盘弹起时按缩小后的视口重排，拼写与打字的输入区始终在键盘上方。
- **内置离线语音。** 第二条例句只有 1,011 个词有真人录音，其余 6,287 个词原先走系统 TTS——在没装英文语音包的机器上就是"点了没声音"。现在用 APK 自带的 Kokoro-82M 音色合成，24 kHz，点击前预渲染，按下即出声。
- **分享卡片能用。** `file://` 下每个文档是独立不透明源，`drawImage` 会污染 canvas，`toBlob()` 直接返回 `null`。改成把插图读成 `data:` URL 再绘制；保存后由原生层用 `ACTION_SEND` 拉起系统分享面板（WebView 不支持 `navigator.share({files})`）。
- **系统返回键有层级。** 先关查词小窗，再关词卡，再回上一页，最后才退出应用。
- **主题跟着手机走。** WebView 的 `prefers-color-scheme` 回答的是"应用自己的主题"，所以「跟随系统」在浅色手机上曾经永远深色；现在由原生层读 `Configuration.uiMode` 主动同步给页面。
- **「导入备份 / 清空记录」能点了。** 壳层漏配 `WebChromeClient` 时，`confirm()` 静默返回 `false`、文件选择器根本不弹。补上 `onJsConfirm` / `onShowFileChooser` 后恢复。

完整实现、体积构成与逐条排查记录见 **[docs/android.md](docs/android.md)**。

## 与上游一致的部分

| 项目 | 数量 / 说明 |
| :--- | :--- |
| 词条 | **7,298** 条，CEFR A1–C2，19 个话题 |
| 例句 | **14,596** 条，日常与雅思语境，附中文翻译 |
| 插画 | **7,298** 幅，512 px WebP，另带缩略图 |
| 录音 | **22,905** 段：英音、美音、例句朗读 |
| 复习 | TS-FSRS 间隔复习，目标记忆率可调 |
| 功能 | 今日、图鉴、词卡、词汇星图（WebGL2）、四类练习、打字练习、导出 / 恢复备份 |
| 数据存放 | 本地优先，无账号无服务器，记录只在这台设备上 |

内容来源同样一致：释义、例句、搭配与大语言模型按统一词典规范撰写，插画由图像模型逐词绘制，语音由 ElevenLabs 合成。经过自动结构与一致性校验，但**尚未逐条人工审校**，可能有错。不是官方雅思词表，也不承诺提分。

## 安装

APK 约 1 GB，不进仓库（`.gitignore` 已排除）。两种方式：

1. 看 [Releases](https://github.com/H1DDENADM1N/word-atlas-android/releases) 有没有现成产物；
2. 按下一节自己构建。

```bash
adb install -r word-atlas-offline.apk
```

要求 **Android 7.0（API 24）及以上**，arm64 设备体验最好；安装需要约 **2.5 GB** 空闲空间。

## 版本

当前 **v1.0.3**（versionCode 4）。每个版本的改动与校验值见 [Releases](https://github.com/H1DDENADM1N/word-atlas-android/releases)。

| 版本 | 一句话 |
| :--- | :--- |
| **v1.0.3** | 词卡多了一节真题例句；点词头看音节；词卡上处处可点 |
| v1.0.2 | 选项按拇指重排，作答卡能听、能点、能往下读 |
| v1.0.1 | 学习页装进一屏，键盘不再挡内容 |
| v1.0.0 | 第一个完全离线版 |

覆盖安装即可升级，学习记录保留；换过签名的包需要先卸载，记录请提前在「我的」里导出备份。

## 从源码构建

需要 **Node.js 20+**、**JDK 17**、Android SDK（`platforms;android-34`、`build-tools;34.0.0`）。不需要 Gradle，也不需要 Android Studio。

```bash
git clone --depth 1 https://github.com/H1DDENADM1N/word-atlas-android.git
cd word-atlas-android
npm ci

# 一次性拉取离线语音运行时与音色（约 540 MB，校验 SHA-256，不进仓库）
python3 scripts/android/fetch_tts.py

export ANDROID_HOME=$HOME/.android-sdk
export JAVA_HOME=/path/to/jdk-17

# 出包 → 仓库根目录的 word-atlas-offline.apk
python3 scripts/android/build_apk.py

adb install -r word-atlas-offline.apk
```

脚本依次执行：`vite build --config vite.config.android.ts`（相对路径 + 传统 IIFE 脚本）→ 生成内联数据 → `aapt2 compile/link` → `javac` → `d8` → 打包 assets 与 `lib/<abi>/*.so` → `zipalign` → `apksigner`。

只想跑网页版（和上游完全一样）：

```bash
npm run dev          # http://localhost:5188
npm test             # 单元测试
npm run build        # 构建到 dist/
```

## 体积

| 内容 | 大小 |
| :--- | ---: |
| 插画 `atlas/img`（512 px WebP） | 203 MB |
| 缩略图 `atlas/thumb` | 88 MB |
| 录音（英音 / 美音 / 例句） | 426 MB |
| 词库 `atlas/entries` + `index.json` | 6.9 MB |
| 真题例句 `atlas/ielts.json` + 音节标注 `atlas/syllables.json` | 0.6 MB |
| 界面音效与配乐 | 4.4 MB |
| 离线语音：ONNX Runtime + JNI（arm64 / x86_64） | 55 MB |
| 离线语音：Kokoro-82M 音色 + espeak 音素表 | 353 MB |
| 前端 bundle、字体、图标 | ~1 MB |
| **APK** | **约 1005 MB** |

想瘦身：只保留 `thumb/`（省 203 MB）、把录音转低码率、只打一个 ABI，或换回 Piper 音色（`fetch_tts.py --voice piper`，省约 290 MB，音质明显下降）。

## 已知限制

- **冷启动略慢**：首次要从 APK 里读取内联数据并解析。
- **体积就是代价**：1005 MB 是"全部资源装进 APK"的直接结果。
- **内置语音的延迟**：模型加载约 0.9 s；一句 7.8 s 的雅思长句合成约 3.6 s。按钮一出现就预渲染，所以正常点按是零等待，页面刚打开立刻点仍要等。
- **语音只是兜底**：22,905 段真人录音优先，TTS 只补第二条例句缺录音的那 6,287 个词。
- **真题例句只覆盖 30%**：来源词典只收了剑桥雅思 4 的四套题，2,216 / 7,298 个词条有例句；A1 日常词本来就不出现在学术文章里。
- **音节标注只覆盖 64%**：4,672 个词条有标注，词典没标的（`study`、`hotel`、`river`、`city`）点词头不会有变化——切错了比不切更糟，所以不补写。
- **释义里的中文不可点**：切词与查词索引都只认英文，中文释义是纯文本。
- **签名**：`android/keystore/` 里是自签名开发密钥（口令 `wordatlas`）。要长期升级发布，请换自己的密钥并妥善保管——换密钥会导致已装版本无法覆盖升级。
- 内容与上游同步，上游的错这里也有。

## 开放数据

词库可以直接拿去用（Anki 牌组、小程序、评测集都行，署名即可）：

| 资源 | 入口 |
| :--- | :--- |
| 词条 JSON | [data/word-atlas.json](data/word-atlas.json) |
| 词条 CSV | [data/word-atlas.csv](data/word-atlas.csv) |
| 字段说明 | [docs/dataset.md](docs/dataset.md) |
| 插画 | [public/atlas/img/](public/atlas/img/) |
| 录音 | [public/atlas/audio/](public/atlas/audio/) |

```python
import json
from pathlib import Path

words = json.loads(Path("data/word-atlas.json").read_text(encoding="utf-8"))
b2_environment = [w for w in words if w["cefr"] == "B2" and w["topic"] == "environment"]
```

## 反馈与贡献

- **安卓壳、构建、APK 问题** → 提到[本仓库](https://github.com/H1DDENADM1N/word-atlas-android/issues)。
- **词条内容纠错** → 也可以提单，能一并回馈上游最好。
- 报告问题时请带上**词条 ID、复现步骤和预期结果**；内容纠错请附词典依据。
- 代码规范、数据同步与提交前检查见 [CONTRIBUTING.md](CONTRIBUTING.md)，安全问题的反馈方式见 [SECURITY.md](SECURITY.md)。

## 授权与致谢

| 范围 | 许可 |
| :--- | :--- |
| 应用代码 | [MIT](LICENSE) |
| 词库文本、插画与词条录音 | [CC BY 4.0](CONTENT_LICENSE.md)，署名 Word Atlas contributors（词光） |
| Kokoro-82M、sherpa-onnx | Apache-2.0 |
| 第三方依赖与字体 | 遵循各自许可 |

> 真题例句与音节标注分别导入自第三方的《雅思真题例句词典》与《牛津高阶》词典数据，**不在上表的 CC BY 4.0 范围内**；源文件不进仓库（`.gitignore` 已排除），随 APK 分发的只有导入后的索引。

原版应用与全部内容由 [@designfuchen](https://github.com/designfuchen) 制作并开源，见 [designfuchen/word-atlas](https://github.com/designfuchen/word-atlas)。本仓库基于其 `main`（`99c00767`）派生，只做安卓离线封装；功劳归上游，问题归这里。

---

如果这个离线版对你有用，给[上游](https://github.com/designfuchen/word-atlas)点个 Star，也欢迎给本仓库提 Issue。
