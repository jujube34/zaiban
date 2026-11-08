# 桌面版构建产物

## Windows x64

- 安装器：`windows-x64/Zaiban_1.0.0_x64-setup.exe`
- 安装方式：当前用户安装，无需管理员权限。
- 校验文件：`windows-x64/Zaiban_1.0.0_x64-setup.exe.sha256`
- 当前安装包未做代码签名，Windows SmartScreen 可能要求确认。
- 点击重点文件时优先调用已安装的 QuickLook；未安装时使用 Windows 默认关联应用。

本地重新构建：

```powershell
npm install
npm run desktop:build:win
```

## macOS

macOS 产物需在 macOS 上构建，或运行 `.github/workflows/desktop-build.yml`。工作流会生成 Universal DMG，同时支持 Apple Silicon 与 Intel Mac：

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run desktop:build -- --target universal-apple-darwin --bundles dmg
```

当前 macOS 包未做 Apple Developer ID 签名与公证，首次打开可能需要在系统设置的隐私与安全性中允许。
