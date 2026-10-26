#[cfg(target_os = "android")]
use tauri::{plugin::PluginHandle, Manager};

#[cfg(target_os = "android")]
struct Documents(PluginHandle<tauri::Wry>);

pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("documents")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _app.manage(Documents(_api.register_android_plugin(
                "com.affleck.learning",
                "DocumentsPlugin",
            )?));
            Ok(())
        })
        .build()
}

#[tauri::command]
pub async fn pick_pdf(_app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        _app.state::<Documents>().0
            .run_mobile_plugin_async("pickPdf", serde_json::json!({}))
            .await.map_err(|error| error.to_string())
    }
    #[cfg(not(target_os = "android"))]
    Err("Use the file selection control on this platform.".into())
}

#[tauri::command]
pub async fn open_pdf(_app: tauri::AppHandle, uri: String) -> Result<(), String> {
    if !uri.starts_with("content://") {
        return Err("Reattach this PDF to restore device access. Your notes and progress are safe.".into());
    }
    #[cfg(target_os = "android")]
    {
        _app.state::<Documents>().0
            .run_mobile_plugin_async("openPdf", serde_json::json!({ "uri": uri }))
            .await.map_err(|error| error.to_string())
    }
    #[cfg(not(target_os = "android"))]
    Err("The native PDF chooser is available on Android.".into())
}
