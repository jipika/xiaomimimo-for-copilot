import vscode from 'vscode';
import { logger } from '../logger';
import type { ModelDefinition } from '../types';
import { createVisionResolver } from './vision/resolve';

/**
 * Process images for models without native vision support.
 * Uses vision proxy to describe images, then passes descriptions to the model.
 */
export async function stripImagesIfNeeded(
	messages: readonly vscode.LanguageModelChatRequestMessage[],
	modelDef: ModelDefinition | undefined,
): Promise<readonly vscode.LanguageModelChatRequestMessage[]> {
	// Check if model has native vision support
	if (modelDef?.nativeVision) {
		logger.info(`[Vision] Model "${modelDef.id}" has native vision support, passing images through`);
		return messages;
	}

	// Count images in messages
	let imageCount = 0;
	for (const m of messages) {
		for (const p of m.content) {
			if (p instanceof vscode.LanguageModelDataPart && p.mimeType.startsWith('image/')) {
				imageCount++;
			}
		}
	}

	logger.info(`[Vision] Found ${imageCount} images in messages for model "${modelDef?.id}"`);

	if (imageCount === 0) {
		return messages;
	}

	logger.info(
		`[Vision] Model "${modelDef?.id}" does not have native vision. Using vision proxy to describe ${imageCount} image(s).`,
	);

	const resolver = createVisionResolver();
	try {
		const result = await resolver.resolve(messages);
		logger.info(`[Vision] Successfully resolved ${imageCount} images via proxy`);
		return result;
	} catch (error) {
		logger.error('[Vision] Proxy failed, stripping images:', error);
		return messages.map((m) => {
			const filtered = m.content.filter(
				(p) => !(p instanceof vscode.LanguageModelDataPart && p.mimeType.startsWith('image/')),
			);
			return {
				role: m.role,
				content: filtered,
			} as unknown as vscode.LanguageModelChatRequestMessage;
		});
	} finally {
		resolver.dispose();
	}
}
