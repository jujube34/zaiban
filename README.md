# 在办 · PRJM

一个本地优先的日常项目追踪器。选择一个工作目录，挑出正在进行的项目文件夹，记录进展、固定重点文件，然后从一个总览里继续下一件事。

跨平台、无需账号、无需后端服务。Windows / macOS 可直接使用本项目的原生桌面版，也可以用最新版 Chrome 或 Edge；Android 使用 Chrome 132 及以上版本。

## 本地运行

```bash
npm install
npm run dev
```

打开终端中显示的地址（默认 `http://localhost:5173`）。

生产构建与预览：

```bash
npm run build
npm run preview
```

`dist/` 是完整的静态站点，部署到任意支持 HTTPS 的静态托管即可通过浏览器安装到桌面或 Android 主屏幕。文件系统能力要求 HTTPS 或 localhost，因此请部署在站点根路径下。



## 桌面版（Windows / macOS）

桌面版使用 **Tauri 2 + Rust** 封装现有 React 界面，不捆绑 Chromium 或 Node.js，安装包保持轻量。应用通过 Tauri 原生文件桥接保留原有能力：

- 选择工作目录、逐层浏览项目文件夹；
- 读写 `.prjm/workspace.json`、`.prjm/project.json` 和笔记图片；
- 记录进展、固定重点文件、预览文本 / 图片 / PDF / 音视频；
- 桌面版点击重点文件时，macOS 使用 Quick Look，Windows 优先使用已安装的 QuickLook，未安装则交给系统默认应用打开；Android 和浏览器版继续使用内置预览。
- 启动时自动恢复上次选择的工作目录（路径保存在本机 WebView 存储中）。

浏览器版仍然完整保留，桌面运行时才会启用原生桥接。

### 开发运行

需要 Node.js 20+、Rust stable，以及对应平台的 Tauri 构建依赖：

- Windows：Visual Studio Build Tools（MSVC）和 WebView2 Runtime；
- macOS：Xcode Command Line Tools。

```bash
npm install
npm run desktop:dev        # 启动 Tauri 桌面开发版
```

### 构建安装包

```bash
# Windows x64，生成 NSIS 当前用户安装器
npm run desktop:build:win

# macOS（在 macOS 上执行），生成 app 和 dmg
npm run desktop:build:mac

# macOS Universal（Apple Silicon + Intel）
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run desktop:build -- --target universal-apple-darwin --bundles dmg
```

输出目录：

- Windows：`src-tauri/target/release/bundle/nsis/Zaiban_1.0.0_x64-setup.exe`
- macOS：`src-tauri/target/release/bundle/dmg/Zaiban_1.0.0_*.dmg`
- Universal macOS：`src-tauri/target/universal-apple-darwin/release/bundle/dmg/`

本仓库的 `.github/workflows/desktop-build.yml` 可在 GitHub Actions 手动触发，自动构建 Windows x64 安装器和 macOS Universal DMG，并上传为工作流产物。

当前安装包未做商业代码签名。Windows 可能提示 SmartScreen；macOS 可能需要在系统设置中手动允许。正式分发前请配置 Windows 签名和 Apple Developer ID 公证。

### 桌面端架构

- `src/lib/desktop.ts`：把 Tauri 原生目录、文件读取、写入命令适配成与浏览器 File System Access API 相同的调用形态；
- `src-tauri/src/main.rs`：原生目录选择与受限路径文件操作；
- `src-tauri/tauri.conf.json`：应用窗口、CSP、图标、Windows NSIS 与 macOS Bundle 配置。

原生命令只接受绝对工作目录与其中的相对路径，并拒绝 `..`、绝对路径和根目录穿越。


## 使用

1. **选择工作目录**：应用会读取该目录下的文件夹结构。
2. **添加项目**：逐层展开任意深度的子文件夹，勾选需要跟踪的项目。也可以直接搜索所有层级；隐藏目录与 `node_modules` 会被跳过。之后随时可以继续添加。
3. **查看与记录**：进入总览时默认展开全部项目；单击项目行会在系统文件管理器中打开该项目文件夹，点击行尾箭头可单独收起或展开，多个项目也可以同时保持展开。笔记与重点文件之间的竖向分隔线可以左右拖动调整列宽。按 `⌘/Ctrl + Enter` 快速记录一条进展。可以直接把剪贴板里的图片粘贴到输入区，或拖入图片文件；插入后点击图片，拖动四周或四角手柄调整显示尺寸。
4. **进入项目文件夹**：单击项目名称（或项目行空白处）在系统文件管理器中打开项目文件夹；点击行尾的文件夹按钮进入应用内文件浏览器，双击文件可预览。文件列表默认按修改时间降序排列，可切换为名称或创建时间，排序方式会被记住；以 `.` 开头的隐藏文件和文件夹不会显示。
5. **固定重点文件**：在行内详情中点击「添加」，从项目文件夹固定文件；文件会同时显示在总览的项目行中。选择面板默认按修改时间排序，并沿用上次使用的排序方式。桌面版单击重点文件时，macOS 使用 Quick Look，Windows 优先使用已安装的 QuickLook，未安装则用系统默认应用打开；Android 与浏览器版单击后仍使用内置预览。
6. **停止跟踪**：点击项目行末尾的停止图标，只从总览中移除该项目，不会删除文件夹或任何记录。

工作区菜单（左上角目录名）可以重新读取磁盘、切换工作目录、导出全部记录，以及安装为桌面应用（浏览器支持时）。

## 数据保存

所有内容保存在你选择的目录里，不会上传：

- 工作区索引：`<工作目录>/.prjm/workspace.json`
- 项目记录：`<项目文件夹>/.prjm/project.json`
- 笔记图片：`<项目文件夹>/.prjm/attachments/`

项目记录包含时间戳笔记、图片引用与显示宽度、重点文件的相对路径和引用信息。迁移项目时请连同项目文件夹内的 `.prjm` 一起移动，图片不会丢失。删除某个项目里的 `.prjm` 目录会移除该项目笔记，但不会影响项目里的其他文件；停止跟踪只会修改工作区索引。

浏览器只保留工作目录的访问凭据，不保留笔记副本。换设备或清除浏览器站点数据后，重新选择工作目录即可恢复。

## 技术栈

- React 19 + TypeScript + Vite
- File System Access API（浏览器版本地目录读写）
- IndexedDB（浏览器版保存目录访问凭据）
- Tauri 2 + Rust（Windows / macOS 桌面版原生文件桥接）
- 自包含 PWA / Service Worker（浏览器版离线打开、安装到桌面）

## 脚本

```bash
npm run dev              # 浏览器开发服务器
npm run build            # 类型检查并生成 dist
npm run preview          # 预览生产构建
npm run typecheck        # 仅 TypeScript 类型检查
npm run desktop:dev      # Tauri 桌面开发模式
npm run desktop:build    # 构建当前平台的桌面应用
npm run desktop:build:win # Windows x64 NSIS 安装器
npm run desktop:build:mac # macOS app + dmg
npm run desktop:check    # Rust 桌面端 cargo check
```

应用图标由 `scripts/generate-icons.ps1` 生成（Windows / PowerShell）。
