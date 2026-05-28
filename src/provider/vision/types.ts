/**
 * Vision proxy types for MiMo Copilot.
 */

export interface VisionProxyConfig {
	/** Model ID to use for vision proxy. */
	modelId: string;
	/** Custom prompt for describing images. */
	prompt: string;
}

export interface ImageDescriptor {
	/** Original image data. */
	data: Uint8Array;
	/** MIME type (e.g., 'image/png'). */
	mimeType: string;
	/** Resolved text description from the vision proxy. */
	description: string;
}
