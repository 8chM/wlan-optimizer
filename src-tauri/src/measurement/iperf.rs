// iPerf3 sidecar management
//
// Manages the iPerf3 binary bundled as a Tauri sidecar.
// Executes TCP upload, TCP download, and UDP throughput tests.
// Parses JSON output from iPerf3 into structured result types.
//
// The actual sidecar binary (iperf3) will be added at build time.
// Platform-specific binaries are placed in src-tauri/binaries/:
//   - iperf3-aarch64-apple-darwin
//   - iperf3-x86_64-apple-darwin
//   - iperf3-x86_64-pc-windows-msvc.exe
//   - iperf3-x86_64-unknown-linux-gnu
//
// License: iperf3 is BSD-3-Clause, compatible with MIT.
//
// See also: Architecture Doc section 3.4, D-13.
//
// ## Security: sidecar argument validation
//
// The capabilities config (capabilities/default.json) uses `"args": true` for the
// iperf3 sidecar, which permits any argument list. A strict positional allowlist is
// not feasible because:
//
// 1. The Tauri v2 shell plugin only supports a SINGLE fixed-length positional arg
//    pattern per command name. It finds the first matching entry by name and
//    validates position-by-position; there is no alternative/fallback matching.
//
// 2. This module invokes iperf3 with 4 different arg patterns of varying lengths:
//    - TCP upload:    -c <ip> -t <dur> -P <streams> -J --omit 2         (9 args)
//    - TCP download:  -c <ip> -t <dur> -P <streams> -R -J --omit 2     (10 args)
//    - UDP test:      -c <ip> -u -b 0 -t <dur> -J                      (8 args)
//    - Server check:  -c <ip> -t 1 -J --connect-timeout 3000           (7 args)
//
// 3. The capability scope is only enforced for JavaScript-side calls via
//    `Command.create()`. All iperf3 invocations in this app go through Rust-side
//    `app.shell().sidecar()` (ShellExt), which bypasses scope validation entirely.
//    The frontend never calls the shell plugin directly for iperf3.
//
// Security mitigations enforced on the Rust side:
//   - `validate_server_ip()` rejects any character outside [a-zA-Z0-9.:-] in the
//     server IP, preventing command injection on the only user-supplied value.
//   - All other arguments (flags, duration, streams) are constructed from validated
//     Rust types (u32, enum), not from raw user strings.
//   - The sidecar binary itself is bundled at build time, not user-replaceable.

use serde::{Deserialize, Serialize};
use tauri_plugin_shell::ShellExt;

use crate::error::AppError;

// =============================================================================
// Configuration
// =============================================================================

/// Configuration for an iPerf3 test run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IperfConfig {
    /// IP address of the iPerf3 server
    pub server_ip: String,
    /// Port number (default: 5201)
    pub port: u16,
    /// Test duration in seconds
    pub duration: u32,
    /// Number of parallel streams (TCP only, default: 4)
    pub streams: u32,
    /// Protocol: TCP or UDP
    pub protocol: IperfProtocol,
}

impl Default for IperfConfig {
    fn default() -> Self {
        Self {
            server_ip: "192.168.1.1".to_string(),
            port: 5201,
            duration: 10,
            streams: 4,
            protocol: IperfProtocol::Tcp,
        }
    }
}

/// Protocol for iPerf3 test
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum IperfProtocol {
    Tcp,
    Udp,
}

// =============================================================================
// Result Types (matching iPerf3 JSON output structure)
// =============================================================================

/// Result of a TCP throughput test (upload or download).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IperfTcpResult {
    /// Total throughput in bits per second
    pub throughput_bps: f64,
    /// Number of TCP retransmissions
    pub retransmits: i32,
    /// Mean round-trip time in microseconds (if available)
    pub rtt_mean_us: Option<f64>,
    /// Test duration in seconds (actual measured)
    pub duration_s: f64,
    /// Number of parallel streams used
    pub streams: u32,
    /// Per-stream throughput details
    pub stream_results: Vec<IperfStreamResult>,
    /// Raw JSON output from iPerf3
    pub raw_json: String,
}

/// Result of a UDP quality test.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IperfUdpResult {
    /// Total throughput in bits per second
    pub throughput_bps: f64,
    /// Jitter in milliseconds
    pub jitter_ms: f64,
    /// Number of lost packets
    pub lost_packets: i32,
    /// Total number of packets sent
    pub total_packets: i32,
    /// Packet loss percentage (0.0 - 100.0)
    pub lost_percent: f64,
    /// Test duration in seconds (actual measured)
    pub duration_s: f64,
    /// Raw JSON output from iPerf3
    pub raw_json: String,
}

/// Per-stream result details.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IperfStreamResult {
    /// Stream ID
    pub id: i32,
    /// Throughput for this stream in bits per second
    pub throughput_bps: f64,
    /// Retransmits for this stream (TCP only)
    pub retransmits: Option<i32>,
}

/// Combined result from a full measurement suite (TCP up + down + UDP).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IperfFullResult {
    pub tcp_upload: Option<IperfTcpResult>,
    pub tcp_download: Option<IperfTcpResult>,
    pub udp: Option<IperfUdpResult>,
}

// =============================================================================
// iPerf3 JSON output structures (for deserialization)
// =============================================================================

/// Top-level iPerf3 JSON output structure.
#[derive(Debug, Deserialize)]
pub struct IperfJsonOutput {
    pub start: Option<IperfJsonStart>,
    pub end: Option<IperfJsonEnd>,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct IperfJsonStart {
    pub test_start: Option<IperfJsonTestStart>,
}

#[derive(Debug, Deserialize)]
pub struct IperfJsonTestStart {
    pub protocol: Option<String>,
    pub num_streams: Option<i32>,
    pub duration: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct IperfJsonEnd {
    pub sum_sent: Option<IperfJsonSum>,
    pub sum_received: Option<IperfJsonSum>,
    pub sum: Option<IperfJsonUdpSum>,
    pub streams: Option<Vec<IperfJsonStreamEnd>>,
}

#[derive(Debug, Deserialize)]
pub struct IperfJsonSum {
    pub bits_per_second: Option<f64>,
    pub retransmits: Option<i32>,
    pub seconds: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct IperfJsonUdpSum {
    pub bits_per_second: Option<f64>,
    pub jitter_ms: Option<f64>,
    pub lost_packets: Option<i32>,
    pub packets: Option<i32>,
    pub lost_percent: Option<f64>,
    pub seconds: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct IperfJsonStreamEnd {
    pub sender: Option<IperfJsonSum>,
    pub receiver: Option<IperfJsonSum>,
    pub udp: Option<IperfJsonUdpSum>,
}

// =============================================================================
// Input validation
// =============================================================================

/// Validates a server IP address to prevent command injection.
/// Only allows alphanumeric characters, dots (IPv4), and colons (IPv6).
fn validate_server_ip(ip: &str) -> Result<(), AppError> {
    if ip.is_empty() {
        return Err(AppError::Validation {
            message: "Server IP address must not be empty".into(),
        });
    }

    for ch in ip.chars() {
        if !ch.is_alphanumeric() && ch != '.' && ch != ':' && ch != '-' {
            return Err(AppError::Validation {
                message: format!(
                    "Invalid character '{}' in server IP. Only alphanumeric, dots, and colons are allowed.",
                    ch
                ),
            });
        }
    }

    Ok(())
}

// =============================================================================
// iPerf3 Manager
// =============================================================================

/// Manages iPerf3 sidecar execution via Tauri Shell plugin.
///
/// Requires the iPerf3 binary to be registered as a Tauri sidecar.
/// The binary is resolved at runtime via `app.shell().sidecar("binaries/iperf3")`.
pub struct IperfManager {
    /// Default configuration (can be overridden per test)
    pub default_config: IperfConfig,
}

impl IperfManager {
    pub fn new() -> Self {
        Self {
            default_config: IperfConfig::default(),
        }
    }

    pub fn with_config(config: IperfConfig) -> Self {
        Self {
            default_config: config,
        }
    }

    /// Runs a TCP upload test (client -> server).
    ///
    /// Uses iPerf3 args: `-c <ip> -t <duration> -P <streams> -J --omit 2`
    /// The `--omit 2` flag discards the first 2 seconds (TCP slow-start).
    ///
    /// # Arguments
    /// * `app` - Tauri AppHandle for shell plugin access
    /// * `server_ip` - iPerf3 server IP address
    /// * `duration` - Test duration in seconds
    /// * `streams` - Number of parallel TCP streams
    pub async fn run_tcp_upload(
        &self,
        app: &tauri::AppHandle,
        server_ip: &str,
        duration: u32,
        streams: u32,
    ) -> Result<IperfTcpResult, AppError> {
        validate_server_ip(server_ip)?;

        let output = app
            .shell()
            .sidecar("binaries/iperf3")
            .map_err(|e| AppError::IPerf {
                message: format!("Failed to create sidecar: {}", e),
            })?
            .args(&[
                "-c",
                server_ip,
                "-t",
                &duration.to_string(),
                "-P",
                &streams.to_string(),
                "-J",
                "--omit",
                "2",
            ])
            .output()
            .await
            .map_err(|e| AppError::IPerf {
                message: format!("iPerf3 execution failed: {}", e),
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::IPerf {
                message: format!("iPerf3 failed: {}", stderr),
            });
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let json: IperfJsonOutput = serde_json::from_str(&stdout).map_err(|e| AppError::IPerf {
            message: format!("Failed to parse iPerf3 output: {}", e),
        })?;

        parse_tcp_result(&json, &stdout)
    }

    /// Runs a TCP download test (server -> client, reverse mode).
    ///
    /// Uses iPerf3 args: `-c <ip> -t <duration> -P <streams> -R -J --omit 2`
    /// The `-R` flag activates reverse mode.
    ///
    /// # Arguments
    /// * `app` - Tauri AppHandle for shell plugin access
    /// * `server_ip` - iPerf3 server IP address
    /// * `duration` - Test duration in seconds
    /// * `streams` - Number of parallel TCP streams
    pub async fn run_tcp_download(
        &self,
        app: &tauri::AppHandle,
        server_ip: &str,
        duration: u32,
        streams: u32,
    ) -> Result<IperfTcpResult, AppError> {
        validate_server_ip(server_ip)?;

        let output = app
            .shell()
            .sidecar("binaries/iperf3")
            .map_err(|e| AppError::IPerf {
                message: format!("Failed to create sidecar: {}", e),
            })?
            .args(&[
                "-c",
                server_ip,
                "-t",
                &duration.to_string(),
                "-P",
                &streams.to_string(),
                "-R",
                "-J",
                "--omit",
                "2",
            ])
            .output()
            .await
            .map_err(|e| AppError::IPerf {
                message: format!("iPerf3 execution failed: {}", e),
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::IPerf {
                message: format!("iPerf3 failed: {}", stderr),
            });
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let json: IperfJsonOutput = serde_json::from_str(&stdout).map_err(|e| AppError::IPerf {
            message: format!("Failed to parse iPerf3 output: {}", e),
        })?;

        parse_tcp_result(&json, &stdout)
    }

    /// Runs a UDP quality test (jitter, packet loss).
    ///
    /// Uses iPerf3 args: `-c <ip> -u -b 0 -t <duration> -J`
    /// The `-b 0` flag means unlimited bitrate.
    ///
    /// # Arguments
    /// * `app` - Tauri AppHandle for shell plugin access
    /// * `server_ip` - iPerf3 server IP address
    /// * `duration` - Test duration in seconds
    pub async fn run_udp_test(
        &self,
        app: &tauri::AppHandle,
        server_ip: &str,
        duration: u32,
    ) -> Result<IperfUdpResult, AppError> {
        validate_server_ip(server_ip)?;

        let output = app
            .shell()
            .sidecar("binaries/iperf3")
            .map_err(|e| AppError::IPerf {
                message: format!("Failed to create sidecar: {}", e),
            })?
            .args(&[
                "-c",
                server_ip,
                "-u",
                "-b",
                "0",
                "-t",
                &duration.to_string(),
                "-J",
            ])
            .output()
            .await
            .map_err(|e| AppError::IPerf {
                message: format!("iPerf3 execution failed: {}", e),
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::IPerf {
                message: format!("iPerf3 failed: {}", stderr),
            });
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let json: IperfJsonOutput = serde_json::from_str(&stdout).map_err(|e| AppError::IPerf {
            message: format!("Failed to parse iPerf3 output: {}", e),
        })?;

        parse_udp_result(&json, &stdout)
    }

    /// Checks if the iPerf3 server is reachable by running a 1-second test.
    ///
    /// Uses iPerf3 args: `-c <ip> -t 1 -J --connect-timeout 3000`
    ///
    /// Returns `Ok(true)` if the server is reachable, `Ok(false)` if not.
    /// Only returns `Err` for validation errors, not for connection failures.
    pub async fn check_server(
        &self,
        app: &tauri::AppHandle,
        server_ip: &str,
    ) -> Result<bool, AppError> {
        validate_server_ip(server_ip)?;

        let result = app
            .shell()
            .sidecar("binaries/iperf3")
            .map_err(|e| AppError::IPerf {
                message: format!("Failed to create sidecar: {}", e),
            })?
            .args(&[
                "-c",
                server_ip,
                "-t",
                "1",
                "-J",
                "--connect-timeout",
                "3000",
            ])
            .output()
            .await;

        match result {
            Ok(output) => Ok(output.status.success()),
            Err(_) => Ok(false),
        }
    }

    /// Runs the full measurement suite: TCP upload, TCP download, UDP.
    ///
    /// Returns partial results if some tests fail.
    pub async fn run_full_suite(
        &self,
        app: &tauri::AppHandle,
        server_ip: &str,
        tcp_duration: u32,
        tcp_streams: u32,
        udp_duration: u32,
    ) -> Result<IperfFullResult, AppError> {
        let tcp_upload = self
            .run_tcp_upload(app, server_ip, tcp_duration, tcp_streams)
            .await
            .ok();
        let tcp_download = self
            .run_tcp_download(app, server_ip, tcp_duration, tcp_streams)
            .await
            .ok();
        let udp = self.run_udp_test(app, server_ip, udp_duration).await.ok();

        if tcp_upload.is_none() && tcp_download.is_none() && udp.is_none() {
            return Err(AppError::IPerf {
                message: "All iPerf3 tests failed. Check server connectivity.".into(),
            });
        }

        Ok(IperfFullResult {
            tcp_upload,
            tcp_download,
            udp,
        })
    }
}

// =============================================================================
// JSON parsing helpers
// =============================================================================

/// Parses a TCP test result from iPerf3 JSON output.
fn parse_tcp_result(json: &IperfJsonOutput, raw: &str) -> Result<IperfTcpResult, AppError> {
    if let Some(ref error) = json.error {
        return Err(AppError::IPerf {
            message: format!("iPerf3 error: {}", error),
        });
    }

    let end = json.end.as_ref().ok_or_else(|| AppError::IPerf {
        message: "Missing 'end' section in iPerf3 output".into(),
    })?;

    let sum = end
        .sum_received
        .as_ref()
        .or(end.sum_sent.as_ref())
        .ok_or_else(|| AppError::IPerf {
            message: "Missing sum data in iPerf3 TCP output".into(),
        })?;

    let stream_results = end
        .streams
        .as_ref()
        .map(|streams| {
            streams
                .iter()
                .enumerate()
                .map(|(i, s)| {
                    let recv = s.receiver.as_ref().or(s.sender.as_ref());
                    IperfStreamResult {
                        id: i as i32,
                        throughput_bps: recv.and_then(|r| r.bits_per_second).unwrap_or(0.0),
                        retransmits: recv.and_then(|r| r.retransmits),
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(IperfTcpResult {
        throughput_bps: sum.bits_per_second.unwrap_or(0.0),
        retransmits: sum.retransmits.unwrap_or(0),
        rtt_mean_us: None, // RTT not always available in iPerf3 JSON
        duration_s: sum.seconds.unwrap_or(0.0),
        streams: stream_results.len() as u32,
        stream_results,
        raw_json: raw.to_string(),
    })
}

/// Parses a UDP test result from iPerf3 JSON output.
fn parse_udp_result(json: &IperfJsonOutput, raw: &str) -> Result<IperfUdpResult, AppError> {
    if let Some(ref error) = json.error {
        return Err(AppError::IPerf {
            message: format!("iPerf3 error: {}", error),
        });
    }

    let end = json.end.as_ref().ok_or_else(|| AppError::IPerf {
        message: "Missing 'end' section in iPerf3 output".into(),
    })?;

    let sum = end.sum.as_ref().ok_or_else(|| AppError::IPerf {
        message: "Missing sum data in iPerf3 UDP output".into(),
    })?;

    Ok(IperfUdpResult {
        throughput_bps: sum.bits_per_second.unwrap_or(0.0),
        jitter_ms: sum.jitter_ms.unwrap_or(0.0),
        lost_packets: sum.lost_packets.unwrap_or(0),
        total_packets: sum.packets.unwrap_or(0),
        lost_percent: sum.lost_percent.unwrap_or(0.0),
        duration_s: sum.seconds.unwrap_or(0.0),
        raw_json: raw.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = IperfConfig::default();
        assert_eq!(config.port, 5201);
        assert_eq!(config.duration, 10);
        assert_eq!(config.streams, 4);
        assert_eq!(config.protocol, IperfProtocol::Tcp);
    }

    #[test]
    fn test_parse_tcp_result_success() {
        let json = IperfJsonOutput {
            start: None,
            end: Some(IperfJsonEnd {
                sum_sent: Some(IperfJsonSum {
                    bits_per_second: Some(100_000_000.0),
                    retransmits: Some(5),
                    seconds: Some(10.0),
                }),
                sum_received: Some(IperfJsonSum {
                    bits_per_second: Some(95_000_000.0),
                    retransmits: None,
                    seconds: Some(10.0),
                }),
                sum: None,
                streams: None,
            }),
            error: None,
        };

        let result = parse_tcp_result(&json, "{}").unwrap();
        assert!((result.throughput_bps - 95_000_000.0).abs() < 0.01);
        assert_eq!(result.duration_s, 10.0);
    }

    #[test]
    fn test_parse_udp_result_success() {
        let json = IperfJsonOutput {
            start: None,
            end: Some(IperfJsonEnd {
                sum_sent: None,
                sum_received: None,
                sum: Some(IperfJsonUdpSum {
                    bits_per_second: Some(50_000_000.0),
                    jitter_ms: Some(1.5),
                    lost_packets: Some(10),
                    packets: Some(10000),
                    lost_percent: Some(0.1),
                    seconds: Some(5.0),
                }),
                streams: None,
            }),
            error: None,
        };

        let result = parse_udp_result(&json, "{}").unwrap();
        assert!((result.jitter_ms - 1.5).abs() < 0.01);
        assert_eq!(result.lost_packets, 10);
        assert_eq!(result.total_packets, 10000);
    }

    #[test]
    fn test_parse_error_response() {
        let json = IperfJsonOutput {
            start: None,
            end: None,
            error: Some("unable to connect to server".into()),
        };

        let result = parse_tcp_result(&json, "{}");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_server_ip_valid() {
        assert!(validate_server_ip("192.168.1.1").is_ok());
        assert!(validate_server_ip("10.0.0.1").is_ok());
        assert!(validate_server_ip("::1").is_ok());
        assert!(validate_server_ip("fe80::1").is_ok());
        assert!(validate_server_ip("myserver").is_ok());
        assert!(validate_server_ip("my-server.local").is_ok());
        assert!(validate_server_ip("iperf-host").is_ok());
    }

    #[test]
    fn test_validate_server_ip_invalid() {
        assert!(validate_server_ip("").is_err());
        assert!(validate_server_ip("192.168.1.1; rm -rf /").is_err());
        assert!(validate_server_ip("$(whoami)").is_err());
        assert!(validate_server_ip("ip & echo bad").is_err());
        assert!(validate_server_ip("host|cmd").is_err());
    }
}
