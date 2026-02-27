pub mod macos;

// TODO: Add Windows and Linux modules in V1.1 / V1.2
// pub mod windows;
// pub mod linux;

/// Detected operating system platform.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    MacOS,
    Windows,
    Linux,
    Unknown,
}

/// Detects the current platform at runtime.
pub fn detect_platform() -> Platform {
    if cfg!(target_os = "macos") {
        Platform::MacOS
    } else if cfg!(target_os = "windows") {
        Platform::Windows
    } else if cfg!(target_os = "linux") {
        Platform::Linux
    } else {
        Platform::Unknown
    }
}

/// Returns whether WiFi measurement is supported on this platform.
pub fn is_wifi_measurement_supported() -> bool {
    matches!(detect_platform(), Platform::MacOS)
}
