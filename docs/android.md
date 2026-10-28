# 安卓离线版 / Offline Android build

把词光打包成一个**完全离线**的安卓应用：没有网络权限，不启动本地服务，不占端口，词库、插画、录音、音效、字体和语音合成引擎全部装在 APK 里。

<table>
<tr>
<td width="33%"><img src="assets/android-today.jpg" alt="安卓版今日学习页" width="100%"></td>
<td width="33%"><img src="assets/android-atlas.jpg" alt="安卓版图鉴网格" width="100%"></td>
<td width="33%"><img src="assets/android-word.jpg" alt="安卓版词卡" width="100%"></td>
</tr>
<tr><td align="center">今日</td><td align="center">图鉴</td><td align="center">词卡</td></tr>
</table>

<sub>截图来自 Android 14 模拟器（WebView 113）上安装的实际 APK。</sub>


## 三条硬保证

| 保证 | 做法 |
| :--- | :--- |
| **不能联网** | `AndroidManifest.xml` 里没有任何 `<uses-permission>`，包括 `INTERNET`。没有这个权限，系统内核拒绝为该 UID 创建 socket，代码层面无法绕过。另外还设了 `usesCleartextTraffic="false"` 与只允许系统证书的 Network Security Config。 |
| **没有端口 / 没有本地服务** | 不跑 HTTP 服务器，也不做请求拦截代理。页面直接用 `file:///android_asset/www/index.html` 打开，图片和录音同目录相对引用。整个应用不监听任何端口。 |
| **没有运行时下载** | 词库索引、73 个词条分片、24 段界面音效被内联进 `atlas-embed/data.js`；7,298 幅插画、7,298 张缩略图、22,905 段录音以文件形式放进 APK 的 `assets/www`。运行时没有任何 `fetch`。 |
| **不依赖系统 TTS** | 录音缺失时用 APK 内自带的开源语音引擎（sherpa-onnx + Kokoro-82M 音色）合成，不用 `TextToSpeech`、不用 `speechSynthesis`，也不需要用户在系统里装语音包。 |

同时也不含账号、埋点、统计或第三方 SDK。

## 体积

| 内容 | 大小 |
| :--- | ---: |
| 插画 `atlas/img`（512 px WebP） | 203 MB |
| 缩略图 `atlas/thumb` | 88 MB |
| 录音 `atlas/audio`（英音 / 美音 / 例句） | 426 MB |
| 词库 `atlas/entries` + `index.json` | 6.9 MB |
| 界面音效与配乐 `sfx` | 4.4 MB |
| 离线语音：ONNX Runtime + JNI（arm64 / x86_64） | 55 MB |
| 离线语音：Kokoro-82M 音色 + espeak 音素表 | 353 MB |
| 前端 bundle、字体、图标 | ~1 MB |
| **APK** | **约 1004 MB** |

安装需要约 2.5 GB 空闲空间。图片和音频本身已压缩，打进 APK 时按原样存储（不再二次压缩），所以构建很快；`.onnx` 也不压缩，运行时可以直接映射。

## 构建

需要 **JDK 17** 与 Android SDK（`platforms;android-34`、`build-tools;34.0.0`）。不需要 Gradle，也不需要 Android Studio。

```bash
# 一次性准备
sdkmanager "platforms;android-34" "build-tools;34.0.0"
export ANDROID_HOME=$HOME/.android-sdk   # 指向 SDK 根目录
export JAVA_HOME=/path/to/jdk-17

# 一次性拉取离线语音运行时与音色（约 540 MB，校验 SHA-256，不进仓库）
python3 scripts/android/fetch_tts.py

# 构建
python3 scripts/android/build_apk.py
```

产物是仓库根目录的 `word-atlas-offline.apk`。脚本会依次执行：`vite build`（相对路径 + 传统脚本）→ 生成内联数据 → `aapt2 compile/link` → `javac` → `d8` → 打包 assets 与 `lib/<abi>/*.so` → `zipalign` → `apksigner`。

只想复用已有的 `dist-android/` 时加 `--skip-web`。想减小体积可以只保留一种 ABI：

```bash
python3 scripts/android/fetch_tts.py --force --abis arm64-v8a   # 省 29 MB
```

首次构建会自动生成 `android/keystore/word-atlas.jks`（口令 `wordatlas`）。**这是自签名构建密钥**：想发布或长期升级，请换成自己的密钥并妥善保管——换密钥会导致已安装的旧版本无法覆盖升级。

安装：

```bash
adb install -r word-atlas-offline.apk
```

## 与网页版的差异

网页版一行代码没少，离线版只在必要处做了替换，全部由构建配置和一层薄桥接控制，浏览器里打开仍然是原来的网站。

| 问题 | 处理 |
| :--- | :--- |
| `file://` 下浏览器禁止 ES module | 构建输出改成单个 IIFE bundle，并把 `<script>` 移到 `</body>` 前作为传统脚本；CSS 仍由 Vite 内联注入 |
| `file://` 下 `fetch()` 不可用 | 词库与音效内联进 `atlas-embed/data.js`，由 `src/atlas/embedded.ts` 读取；网页端没有 `__WA_DATA` 时自动回退到 `fetch` |
| Service Worker 无意义 | 检测到安卓壳时跳过注册 |
| 系统返回键 | `src/lib/native.ts` 把路由状态同步给原生层：先关词卡，再回上一页，最后才退出应用 |
| 分享卡片、备份文件 | 交给原生层写入系统「下载 / Word Atlas」目录（Android 10+ 走 MediaStore，无需存储权限） |
| WebView 没有语音合成引擎 | 原生层用 APK 内自带的 Kokoro 音色合成（见下一节），不用系统 `TextToSpeech`，也不需要用户在系统里装语音包 |
| 状态栏颜色 | 主题切换时通过桥接同步状态栏与导航栏配色 |
| `confirm()` / `alert()` 静默失效 | 设置 `WebChromeClient` 并实现 `onJsConfirm` / `onJsAlert` / `onJsPrompt`，改用系统对话框 |
| `<input type="file">` 点不开 | 同一个 `WebChromeClient` 实现 `onShowFileChooser`，拉起系统文件选择器，`onActivityResult` 回传 `Uri[]` |

WebView 侧还关闭了 `file` 域的脚本访问（`setAllowFileAccessFromFileURLs(false)`）与混合内容，并启用 `setBlockNetworkLoads(true)`。**内容访问必须保持开启**（`setAllowContentAccess(true)`）：系统选择器返回的是 `content://` URI，关掉之后页面就读不回用户选中的备份文件。

## 离线语音（内置 TTS）

7,298 个词的英音、美音、第一条例句都有真人录音（22,905 段）。但**第二条例句（雅思语境）只有 1,011 个词有录音**，其余 6,287 个词词卡上第二个喇叭以前是走系统 `TextToSpeech` 的——在没装英文语音包的机器上就是「点了没声音」。现在改为 APK 内自带的引擎。

第一版用的是 Piper `-low` 音色（16 kHz、小模型），实测明显发闷、机械感重。既然 APK 体积不是约束，就换成了 **Kokoro-82M**：同一套 sherpa-onnx 运行时，24 kHz 输出，一个模型内含 11 个英文音色（英式 `bf_emma`、美式 `af_heart`），自然度是这类小模型里最好的一档。

| 项目 | 选择 | 原因 |
| :--- | :--- | :--- |
| 推理运行时 | [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) **1.13.8**（Apache-2.0） | 专为端上 TTS 设计，纯 C++/JNI，不需要 Gradle 或 NDK。锁 1.13.8 是因为 **2.0 起移除了内置 espeak**，而 Kokoro / Piper 都靠它做音素化 |
| 音色 | [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) `kokoro-en-v0_19`（Apache-2.0） | 24 kHz，`model.onnx` 330 MB + `voices.bin` 5.5 MB；英式 / 美式只是同一个模型里换 speaker id |
| 不用 eSpeak NG | — | GPLv3 会传染整个应用，本仓库是 MIT |
| 不用系统 TTS | — | 那正是这次要去掉的依赖：不可控、可能联网下语音包、部分机型根本没有 |

同价位被否掉的方案：Piper `-low` / `-medium`（16–22 kHz，机器味重）、Matcha-TTS（更快但音质不如 Kokoro）、Kitten TTS（15M/80M，胜在体积不是音质）、XTTS / F5 / Chatterbox（参数量大一到两个数量级，手机上跑不动，且许可证多为非商用）。

实现分三层，都不需要 Kotlin 工具链：

| 文件 | 作用 |
| :--- | :--- |
| `android/app/src/main/java/com/k2fsa/sherpa/onnx/*.java` | 手写的 Java 镜像类。JNI 用 `GetFieldID` 按字段名读配置，所以包名、类名、字段类型必须和上游 `kotlin-api/Tts.kt` 逐字段对齐 |
| `TtsVoice.java` | 唯一暴露给应用的门面：`kokoro(...)` / `vits(...)` 两个工厂，`synthesize` 返回 PCM |
| `OfflineVoice.java` | 单线程合成 + `AudioTrack` 播放；负责把音素表解包到 `filesDir`、按口音选 speaker、`prepare()` 预渲染、单条音频缓存、`stop()` 打断、`onTrimMemory` 释放 |

几个实现细节：

- 模型直接读 `assets`（不复制，省 330 MB 空间）；**espeak 音素表必须落地成真实文件**（18 MB，首次使用解包一次），因为 espeak 内部用 `fopen` 读表。
- 只保留一个已加载的音色：模型常驻约 500 MB PSS，系统内存吃紧时 `onTrimMemory` 会主动释放，下次说话再加载。
- **预渲染**：慢的从来不是加载模型，而是合成——一句 20 个词的雅思例句要算 3 秒多。所以 `Speak` 组件一发现「这里没有录音」（`url == null`），就立刻把**这一句**送去合成，等用户真的按下喇叭时音频已经躺在内存里。缓存只保留最后一句（几百 KB），重听同一句是零等待。
- 预渲染和播放必须用**同一个速率**（`audio.ts` 里的 `VOICE_RATE`）：两边差 0.05 就会导致缓存键不匹配，白算一遍。
- 播放用 `AudioTrack` + `PCM_FLOAT` 分块写入，`stop()` 通过 token 作废当前任务，能立刻打断长句。

### 实测（Snapdragon 8 级真机，arm64）

| 场景 | 结果 |
| :--- | :--- |
| 模型加载 | 0.86–0.94 s（仅首次） |
| 合成速度 | **RTF 0.47**（7.8 秒语音算 3.6 s；短句 0.43–0.52） |
| 单个单词（约 0.6 s 音频） | 约 0.3 s 出声 |
| 例句**预渲染后**点按 | **0 ms 等待**，直接出声 |
| 例句**未**预渲染（打开页面立刻点） | 等 3.6 s 出声（7.8 s 的雅思长句） |
| 输出 | 24 kHz 单声道，峰值 0.68–0.92，无削波 |

同一份 APK 在 x86_64 模拟器上 RTF 是 2.6–3.4（模拟器没有 NEON，参考价值有限）。Kokoro 的输出电平比真人录音低约 6 dB，`OfflineVoice` 里乘了 1.8 倍增益拉齐，并夹在 ±0.98 以内防止削波；增益在渲染时只做一次，缓存里存的就是最终样本，重听不会叠加放大。

> 播放收尾也有坑：`AudioTrack` 只缓冲约 0.7 s，写完就 `release()` 会把最后一个词切掉（实测 7.82 s 的音频只播了 7.11 s）。现在用 `getPlaybackHeadPosition()` 等缓冲播完再释放。


## 排查记录：导入备份 / 清空记录「无效」

真机上这两个按钮看起来毫无反应，根因不在业务代码，而在壳层漏配了 `WebChromeClient`：

| 操作 | 页面里的实现 | 没配 `WebChromeClient` 时 |
| :--- | :--- | :--- |
| 清空记录 | `if (!confirm(...)) return` | `confirm()` 直接返回 `false`，函数在第一行就退出了，**看起来像没反应** |
| 导入备份 | `<input type="file">` | 不触发任何选择器，点击无任何反馈 |

补上 `ShellChrome extends WebChromeClient` 之后两者都恢复。修完后在模拟器上做了端到端验证（见下节「已验证」最后两条）。

<img src="assets/android-confirm.jpg" width="260" alt="清空记录的原生确认框"> <img src="assets/android-import.jpg" width="260" alt="导入备份成功后的提示">

## 排查记录：分享卡片「生成失败，请稍后再试」

网页版正常，装进 APK 后**每个词都失败**。关键线索是那句 toast：`saveFile` 失败会走原生自己的「保存失败：…」，而这里报的是 JS 的「卡片生成失败」，说明异常发生在**保存之前**——也就是 `canvas.toBlob()`。

根因是 **canvas 被污染（taint）**：

| 环节 | 网页版 | APK |
| :--- | :--- | :--- |
| 页面来源 | `https://…` | `file:///android_asset/www/index.html` |
| 插图来源 | 同源 http | 同源 `file://`，但每个 file 文档是独立的不透明源 |
| `drawImage(插图)` | canvas 干净 | canvas 被标记为污染 |
| `canvas.toBlob()` | 正常出 PNG | 回调收到 `null` → 抛错 → 失败 toast |

按规范 `toDataURL()` 会直接抛 `SecurityError`，`toBlob()` 则是回调给 `null`，两条路都通向同一个 toast，所以现象是「每次都失败」。

两种修法：

- **放宽 `setAllowFileAccessFromFileURLs(true)`**：能让 file 文档互相视为同源，但等于让页面 JS 能读任意 file:// 资源，和本项目的隔离基调不符，而且不同 WebView 版本行为不完全一致。
- **把插图换成 `data:` URL**（采用）：`data:` 图片永远是 origin-clean，canvas 不会被污染。新增桥方法 `assetDataUrl(url)`，把 `file:///android_asset/...` 读成 base64 `data:` URL 交给页面——字节和页面显示的是同一份，视觉完全一致。

```ts
// src/ui/share.ts
async function illustration(src: string | null) {
  if (!src) return null;
  const inline = assetDataUrl(src);          // APK 内：data: URL
  return inline ? loadImage(inline) : loadImage(src);   // 网页：原样
}
```

桥方法只允许读 `assets/www/` 之下的路径，避免变成一个任意文件读取口。修完实测：`upgrade` 词卡生成 1080×1440 PNG，插图、音标、释义、例句、页脚齐全，落在 `下载/Word Atlas/`。

顺带修掉同一批日志里的 `Uncaught (in promise) AbortError: Transition was skipped`——`startViewTransition()` 的 `ready` 在新转场打断旧转场时会 reject，之前只 catch 了 `finished`。快速连点导航时每次都会刷一条，现在 `ready` / `finished` 都吞掉了。

## 自测

不需要真机也能先验证网页层：把 `dist-android/`、`android/build/data.js`、`public/atlas`、`public/sfx`、`public/brand` 放进同一个目录，用浏览器打开 `index.html`（`file://`）。页面能正常显示图鉴、词卡、发音，就说明数据内联与相对路径都对了。

真机上建议确认：首屏、图鉴网格、词卡翻页、英美发音、星图（WebGL2）、返回键、分享卡片保存位置、深浅色切换、导出 / 导入备份、清空记录，以及**没有录音的那条例句的朗读**。

语音可以脚本化验证。用调试开关启动应用，就能通过 Chrome DevTools 直接驱动页面：

```bash
adb shell am start -n tech.wordatlas.app/.MainActivity --ez wa.debug true
adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof tech.wordatlas.app)
node scripts/android/verify_speech.mjs budget
```

脚本会用两种口音各合成一句、再打开 `budget` 词卡点第二个喇叭，`adb logcat -s WordAtlasVoice` 里能看到采样数、耗时与峰值电平。

## 已验证

在 Android 14（API 34）模拟器上安装实际 APK 后逐项确认：

- 安装、启动、开屏动画、引导页、今日页、图鉴（网格 / 列表）、词卡、星图（WebGL2）均正常渲染；
- 系统返回键先关词卡、再回上一页，不会直接退出应用；
- 深浅色切换时状态栏与导航栏同步变色（原生桥接）；
- **强制停止后重新打开，主题与学习进度仍在**——`file://` 源下的 `localStorage` 在 WebView 中可用；
- **导出备份**：文件落在 `/sdcard/Download/Word Atlas/word-atlas-backup-YYYY-MM-DD.json`，走 MediaStore，无需存储权限；
- **导入备份**：点击后拉起系统文件选择器，选中备份即回到应用并提示「已恢复 N 个词的记忆」。用一份手工注入 1 张卡片的备份实测，图鉴从 0 变成「1 / 7,298 颗星已点亮」，「我的」页显示已点亮 1 / 长期记住 1，未来 7 天复习量「今天 1」；**强制停止再打开，这 1 个词仍在**；
- **清空记录**：弹出系统确认框，点「确定」后提示「学习记录已清空」，复习曲线归零；**强制停止再打开仍为 0**；
- **内置语音**（真机 arm64）：打开 `upgrade` 词卡（第二条例句无录音），**还没点任何按钮**，日志里已经有 `loaded kokoro in 842 ms` 和 `rendered 187,593 samples (7.82 s) in 3632 ms · rtf 0.46`；随后点第二个喇叭 → `spoke 187,593 samples (7.82 s) in 7799 ms`，**没有新的渲染日志**（说明命中预渲染缓存，点按零等待），播放时长与音频长度一致（尾巴没被切）；再点一次 → 3.20 s 处 `stopped early`，能打断且不崩溃；页面里 `typeof window.speechSynthesis === "undefined"`，确认完全没有走系统语音；
- 导出两段样音核对音质：en-GB 3.60 s（峰值 0.903 / RMS 0.117）、en-US 2.96 s（峰值 0.715 / RMS 0.104），24 kHz 单声道，非静音；
- `zipalign -c` 校验通过，`apksigner verify` 通过，`aapt2 dump` 确认无任何权限声明。

> 小坑：用 `adb push` 覆盖「下载」里的备份后，文件管理器会显示「无内容」——`adb push` 不会通知 MediaStore。补一条 `am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE` 即可，正常用户通过系统导出 / 复制文件不会遇到。

另外用 Chromium 以 `file://` 打开同一份产物做了交叉验证：12 个图块、词卡插图、例句、录音（`duration` 可读出）全部正常，无失败请求。

> 模拟器上的 WebView 是 113 版，比桌面 Chromium 旧。图鉴网格最初因 `<button>` 内的弹性子元素没有拿到宽度而空白，已通过给 `.tile .illo` 显式设宽修复——这类问题只有在真机 / 旧内核上才会暴露。

## 已知限制

- **冷启动**比网页版慢一点：首次要从 APK 里读取内联数据并解析。
- **APK 很大**：1004 MB 是「全部资源装进 APK」的直接代价，其中 353 MB 是 Kokoro 音色。想瘦身可以只保留 `thumb/`（省 203 MB）、把录音转成更低码率、只打一个 ABI，或者换回 Piper 音色（`fetch_tts.py --voice piper`，省约 290 MB，音质明显下降）。
- **内置语音的延迟**：模型加载约 0.9 s，合成一句 7.8 s 的雅思长句要 3.6 s。点按之所以感觉即时，是因为按钮一出现就预渲染了；如果页面刚打开就立刻点，仍要等那 3.6 s。模型常驻约 500 MB PSS，系统内存吃紧会自动释放，下次说话再加载。
- 语音只是兜底：22,905 段真人录音优先，TTS 只补第二条例句缺失的那 6,287 个词。
- 内容仍是开源版的 7,298 词，许可与网页版一致（代码 MIT，词库与插画录音 CC BY 4.0，Kokoro-82M Apache-2.0，sherpa-onnx Apache-2.0）。
