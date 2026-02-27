pub mod calibration;
pub mod iperf;
pub mod rssi;

// TODO: Implement measurement orchestration in Phase 8d
//
// The measurement module coordinates:
// 1. RSSI reading via platform-specific WiFi API
// 2. iPerf3 throughput tests via sidecar process
// 3. Result aggregation and quality assessment
