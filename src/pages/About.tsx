import { ArrowUpRight, Database, Github, Heart } from "lucide-react";
import { useAtlas } from "../atlas/context";
import { REPO_URL, UPSTREAM_SITE, UPSTREAM_URL } from "../config";
import { shell } from "../lib/native";

const BASE = import.meta.env.BASE_URL;

/** The installed package version, or "" on the web where there is no package. */
function installedVersion() {
  try {
    return shell?.version?.() ?? "";
  } catch {
    return "";
  }
}

const VERSION = installedVersion();

export function About() {
  const atlas = useAtlas();
  return (
    <div className="page about">
      <header className="about-hero">
        <img src={`${BASE}brand/og.webp`} alt="" />
        <div>
          <p className="eyebrow">关于 · 安卓离线版</p>
          <h1 className="display">同一本词光，装进口袋，断网也能读。</h1>
          <p className="lede">
            这里是 <b>word-atlas-android</b>：
            <a href={UPSTREAM_URL} target="_blank" rel="noreferrer">
              word-atlas
            </a>
            的安卓离线分支。{atlas.count.toLocaleString()}{" "}
            个词条、插画、录音、例句和 FSRS 复习算法都来自上游开源版，一个没换；换掉的是外壳——整个应用被打包成一个完全离线的 APK。
          </p>
          <p className="lede">
            原版以网页为先，跑在浏览器和一台服务器上；这一版把同一份前端塞进安卓 WebView，再从构建配置到原生层，把依赖网络、依赖系统组件的地方逐个替换掉。代码仍是 MIT，词库与插画录音仍是 CC BY 4.0。
          </p>
          <div className="about-actions">
            <a className="btn btn-primary" href={REPO_URL} target="_blank" rel="noreferrer">
              <Github size={18} /> 本项目的 GitHub
            </a>
            <a className="btn btn-ghost" href={UPSTREAM_URL} target="_blank" rel="noreferrer">
              <Github size={18} /> 上游原版
            </a>
            <a className="btn btn-ghost" href={`${REPO_URL}/tree/main/data`} target="_blank" rel="noreferrer">
              <Database size={18} /> 词库 JSON / CSV
            </a>
          </div>
        </div>
      </header>

      <div className="about-grid">
        <section className="panel">
          <h3 className="eyebrow">和原版不一样的地方</h3>
          <ul className="feature-list">
            <li>
              <b>不能联网。</b>清单文件里没有任何权限声明，包括 <code>INTERNET</code>。没有这条权限，系统内核就不会给这个应用创建 socket，代码层面也绕不过去。
            </li>
            <li>
              <b>没有服务器。</b>页面直接用 <code>file:///android_asset</code>{" "}
              打开，不起本地服务、不监听端口；词库索引和音效在构建时内联，插画与录音随 APK 一起装好，运行时没有一次网络请求。
            </li>
            <li>
              <b>不用自备语音。</b>第二条例句只有 1,011 个词配了录音，其余 6,287 个词由 APK 内置的 Kokoro-82M
              音色合成，既不走系统 TTS，也不需要用户在手机里装语音包。
            </li>
            <li>
              <b>为手机补的几处。</b>词卡同时给出英音与美音、例句里的单词可点开小窗查词、分享卡片保存后直接拉起系统分享面板、两套夜空主题与三种英文字体、「跟随系统」按手机真实设置取色。
            </li>
            <li>
              <b>体积换自由。</b>安装包约 1 GB：{atlas.count.toLocaleString()} 幅插画、22,905
              段录音和语音模型全在里面。装一次，之后无论是在地铁里还是飞行模式，功能都不打折。
            </li>
          </ul>
        </section>

        <section className="panel">
          <h3 className="eyebrow">和原版一样的地方</h3>
          <p className="muted">
            词条数量、释义、两句原创例句、搭配、词族、易混提示、插画、英音与美音录音、复习算法，全部来自上游，没有重写也没有删减。今日、图鉴、词卡、星图、四类练习、打字练习、导出与恢复备份，都在。
          </p>
          <p className="muted">
            仍然本地优先：没有账号，没有服务器，学习记录存在这台设备上。换机或清除数据前，记得先到「我的」导出备份。
          </p>
          <a className="link" href={UPSTREAM_SITE} target="_blank" rel="noreferrer">
            上游的在线网页版 <ArrowUpRight size={14} />
          </a>
        </section>

        <section className="panel">
          <h3 className="eyebrow">内容从哪里来</h3>
          <p className="muted">
            释义、例句、搭配和提示由大语言模型按统一词典规范撰写；插画由图像模型按统一画风逐词绘制；发音和朗读由 ElevenLabs 合成。内容经过结构与一致性自动校验，但没有逐条人工审校，可能有错。这一版没有改动任何一条内容——看到问题请提到本仓库，能一并回馈上游。
          </p>
          <p className="muted">不是官方雅思词表，也不承诺提分。</p>
        </section>

        <section className="panel">
          <h3 className="eyebrow">给开发者与授权</h3>
          <p className="muted">
            <code>data/word-atlas.json</code> 与 <code>.csv</code> 是完整词库。安卓侧的构建方式、体积构成、离线语音选型和踩过的坑都在{" "}
            <code>docs/android.md</code>；不需要 Gradle，<code>python3 scripts/android/build_apk.py</code>{" "}
            一条命令出包，JDK 17 与 Android SDK 就够。
          </p>
          <p className="muted">
            应用代码 <b>MIT</b>；词库文本、插画与词条录音 <b>CC BY 4.0</b>，署名 Word Atlas contributors（词光）。内置语音为
            Kokoro-82M 与 sherpa-onnx，均为 Apache-2.0。
          </p>
          <p className="muted">
            原版由{" "}
            <a href={UPSTREAM_URL} target="_blank" rel="noreferrer">
              @designfuchen
            </a>{" "}
            制作并开源。这个仓库只是它的一次安卓侧封装，功劳归上游。
          </p>
          <a className="link" href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer">
            阅读文档 <ArrowUpRight size={14} />
          </a>
        </section>
      </div>
      <p className="colophon">
        <Heart size={14} /> 做给每一个在地铁里也想背两个词的人。
        {VERSION && <span className="colophon-version">v{VERSION}</span>}
      </p>
    </div>
  );
}
