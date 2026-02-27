// Heatmap image export (PNG/JPEG)
//
// Renders the heatmap to a static image for sharing.
//
// TODO: Implement in Phase 8e

use crate::error::AppError;

/// Exports the heatmap as a PNG or JPEG image.
pub fn export_heatmap_image(
    _project_id: &str,
    _output_path: &str,
    _format: &str,
) -> Result<(), AppError> {
    Err(AppError::Export {
        message: "Image export not yet implemented".into(),
    })
}
