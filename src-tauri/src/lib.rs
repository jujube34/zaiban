use serde::Serialize;
use std::{
    fs,
    path::{Component, Path, PathBuf},
    time::UNIX_EPOCH,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DirectoryEntry {
    name: String,
    kind: &'static str,
    size: Option<u64>,
    last_modified: Option<u64>,
    created_at: Option<u64>,
}

fn resolve(root: &str, relative: &str) -> Result<PathBuf, String> {
    let root_path = Path::new(root);
    if !root_path.is_absolute() {
        return Err("工作目录必须是绝对路径".to_string());
    }
    if Path::new(relative).is_absolute() {
        return Err("不允许使用绝对文件路径".to_string());
    }

    let mut resolved = root_path.to_path_buf();
    for component in Path::new(relative).components() {
        match component {
            Component::Normal(part) => resolved.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err("不允许访问工作目录之外的文件".to_string());
            }
        }
    }
    Ok(resolved)
}

fn modified_millis(metadata: &fs::Metadata) -> Option<u64> {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
}

fn created_millis(metadata: &fs::Metadata) -> Option<u64> {
    metadata
        .created()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
}

fn list_directory_impl(root: &str, relative: &str) -> Result<Vec<DirectoryEntry>, String> {
    let directory = resolve(root, relative)?;
    if !directory.is_dir() {
        return Err(format!("文件夹不存在或不可访问：{}", directory.display()));
    }

    let mut entries = Vec::new();
    for item in fs::read_dir(&directory).map_err(|error| format!("无法读取文件夹：{error}"))?
    {
        let item = match item {
            Ok(item) => item,
            Err(_) => continue,
        };
        let name = item.file_name().to_string_lossy().into_owned();
        let metadata = match item.metadata() {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if metadata.is_dir() {
            entries.push(DirectoryEntry {
                name,
                kind: "directory",
                size: None,
                last_modified: modified_millis(&metadata),
                created_at: created_millis(&metadata),
            });
        } else if metadata.is_file() {
            entries.push(DirectoryEntry {
                name,
                kind: "file",
                size: Some(metadata.len()),
                last_modified: modified_millis(&metadata),
                created_at: created_millis(&metadata),
            });
        }
    }

    entries.sort_by(|left, right| {
        let left_is_file = left.kind == "file";
        let right_is_file = right.kind == "file";
        left_is_file
            .cmp(&right_is_file)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
            .then_with(|| left.name.cmp(&right.name))
    });
    Ok(entries)
}

async fn blocking<T, F>(operation: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|error| format!("文件操作中断：{error}"))?
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
async fn pick_workspace_directory() -> Result<Option<String>, String> {
    blocking(|| {
        let folder = rfd::FileDialog::new()
            .set_title("选择工作目录")
            .pick_folder();
        Ok(folder.map(|path| path.to_string_lossy().into_owned()))
    })
    .await
}

// Android 无法使用 rfd 对话框：优先使用已授权（所有文件访问）的公共文档目录，
// 未授权时回退到应用专属的外部文档目录，两者都是真实路径，其余命令无需改动。
#[cfg(target_os = "android")]
#[tauri::command]
async fn pick_workspace_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri::Manager;

    let fallback = app
        .path()
        .document_dir()
        .map_err(|error| format!("无法定位应用目录：{error}"))?;
    // 优先整块共享存储，便于直接浏览手机里已有的项目文件夹。
    let candidates = [
        PathBuf::from("/storage/emulated/0"),
        PathBuf::from("/storage/emulated/0/Documents/在办"),
        fallback,
    ];

    blocking(move || {
        for candidate in candidates {
            if fs::create_dir_all(&candidate).is_err() {
                continue;
            }
            let probe = candidate.join(".prjm-write-test");
            if fs::write(&probe, b"ok").is_err() {
                continue;
            }
            let _ = fs::remove_file(&probe);
            return Ok(Some(candidate.to_string_lossy().into_owned()));
        }
        Err("无法创建可写的工作目录".to_string())
    })
    .await
}

#[cfg(target_os = "windows")]
fn find_quicklook() -> Option<PathBuf> {
    use std::env;

    let mut candidates = Vec::new();
    if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
        let local_app_data = PathBuf::from(local_app_data);
        candidates.push(
            local_app_data
                .join("Programs")
                .join("QuickLook")
                .join("QuickLook.exe"),
        );
        candidates.push(
            local_app_data
                .join("Microsoft")
                .join("WindowsApps")
                .join("QuickLook.exe"),
        );
    }
    for variable in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(program_files) = env::var_os(variable) {
            candidates.push(
                PathBuf::from(program_files)
                    .join("QuickLook")
                    .join("QuickLook.exe"),
            );
        }
    }
    if let Some(path) = env::var_os("PATH") {
        for directory in env::split_paths(&path) {
            candidates.push(directory.join("QuickLook.exe"));
        }
    }

    candidates.into_iter().find(|candidate| candidate.exists())
}

#[cfg(target_os = "macos")]
fn try_open_quicklook(file: &Path) -> Result<(), String> {
    std::process::Command::new("/usr/bin/qlmanage")
        .arg("-p")
        .arg(file)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("QuickLook 启动失败：{error}"))
}

#[cfg(target_os = "windows")]
fn try_open_quicklook(file: &Path) -> Result<(), String> {
    let executable = find_quicklook().ok_or_else(|| "未安装 QuickLook".to_string())?;
    std::process::Command::new(executable)
        .arg(file)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("QuickLook 启动失败：{error}"))
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn try_open_quicklook(_file: &Path) -> Result<(), String> {
    Err("当前系统不支持 QuickLook".to_string())
}

#[cfg(target_os = "windows")]
fn open_with_default_app(file: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let operation: Vec<u16> = "open".encode_utf16().chain(std::iter::once(0)).collect();
    let path: Vec<u16> = file
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            path.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };
    if result as isize <= 32 {
        Err(format!(
            "系统默认应用无法打开该文件（错误码 {}）",
            result as isize
        ))
    } else {
        Ok(())
    }
}

#[cfg(target_os = "macos")]
fn open_with_default_app(file: &Path) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(file)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("系统默认应用无法打开该文件：{error}"))
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn open_with_default_app(file: &Path) -> Result<(), String> {
    std::process::Command::new("xdg-open")
        .arg(file)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("系统默认应用无法打开该文件：{error}"))
}

#[tauri::command]
async fn preview_file_in_system(root: String, path: String) -> Result<String, String> {
    blocking(move || {
        let file = resolve(&root, &path)?;
        if !file.is_file() {
            return Err(format!("文件不存在或不可访问：{}", file.display()));
        }

        if try_open_quicklook(&file).is_ok() {
            return Ok("quicklook".to_string());
        }

        open_with_default_app(&file)?;
        Ok("default".to_string())
    })
    .await
}

#[tauri::command]
async fn open_folder_in_system(root: String, path: String) -> Result<(), String> {
    blocking(move || {
        let folder = resolve(&root, &path)?;
        if !folder.is_dir() {
            return Err(format!("文件夹不存在或不可访问：{}", folder.display()));
        }
        open_with_default_app(&folder)
            .map_err(|error| format!("无法在系统文件管理器中打开文件夹：{error}"))
    })
    .await
}

#[tauri::command]
async fn path_kind(path: String) -> Result<Option<String>, String> {
    blocking(move || {
        let path = PathBuf::from(path);
        if !path.is_absolute() {
            return Err("文件路径必须是绝对路径".to_string());
        }
        let metadata = match fs::metadata(path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(format!("无法访问文件：{error}")),
        };
        if metadata.is_dir() {
            Ok(Some("directory".to_string()))
        } else if metadata.is_file() {
            Ok(Some("file".to_string()))
        } else {
            Ok(None)
        }
    })
    .await
}

#[tauri::command]
async fn list_directory(root: String, path: String) -> Result<Vec<DirectoryEntry>, String> {
    blocking(move || list_directory_impl(&root, &path)).await
}

#[tauri::command]
async fn read_binary_file(root: String, path: String) -> Result<Vec<u8>, String> {
    blocking(move || {
        let file = resolve(&root, &path)?;
        if !file.is_file() {
            return Err(format!("文件不存在或不可访问：{}", file.display()));
        }
        fs::read(&file).map_err(|error| format!("无法读取文件：{error}"))
    })
    .await
}

#[tauri::command]
async fn write_binary_file(root: String, path: String, data: Vec<u8>) -> Result<(), String> {
    blocking(move || {
        let file = resolve(&root, &path)?;
        if let Some(parent) = file.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("无法创建文件夹：{error}"))?;
        }
        fs::write(&file, data).map_err(|error| format!("无法写入文件：{error}"))
    })
    .await
}

#[tauri::command]
async fn create_directory(root: String, path: String) -> Result<(), String> {
    blocking(move || {
        let directory = resolve(&root, &path)?;
        fs::create_dir_all(&directory).map_err(|error| format!("无法创建文件夹：{error}"))
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::resolve;
    use std::path::Path;

    #[test]
    fn resolves_nested_relative_paths() {
        let root = if cfg!(windows) { r"C:\work" } else { "/work" };
        let path = resolve(root, "project/.prjm/project.json").unwrap();
        assert_eq!(
            path,
            Path::new(root)
                .join("project")
                .join(".prjm")
                .join("project.json")
        );
    }

    #[test]
    fn rejects_paths_outside_the_workspace() {
        let root = if cfg!(windows) { r"C:\work" } else { "/work" };
        assert!(resolve(root, "../outside").is_err());
        #[cfg(windows)]
        assert!(resolve(root, r"..\outside").is_err());
        assert!(resolve(root, "/etc/passwd").is_err());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            pick_workspace_directory,
            path_kind,
            preview_file_in_system,
            open_folder_in_system,
            list_directory,
            read_binary_file,
            write_binary_file,
            create_directory
        ])
        .run(tauri::generate_context!())
        .expect("failed to run 在办");
}
