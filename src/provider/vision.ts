import vscode from 'vscode';
import { logger } from '../logger';
import type { ModelDefinition } from '../types';
import { createVisionResolver } from './vision/resolve';

/**
 * Strip image parts from messages when the model doesn't support vision.
 * Uses vision proxy to describe images when available, otherwise strips them.
 */
export async function stripImagesIfNeeded(
	messages: readonly vscode.LanguageModelChatRequestMessage[],
	modelDef: ModelDefinition | undefined,
): Promise<readonly vscode.LanguageModelChatRequestMessage[]> {
	logger.info(`[Vision] Checking model: ${modelDef?.id}, imageInput: ${modelDef?.capabilities.imageInput}`);

	if (modelDef?.capabilities.imageInput) {
		logger.info(`[Vision] Model supports vision, passing images through`);
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

	logger.info(`[Vision] Found ${imageCount} images in messages`);

	if (imageCount === 0) {
		return messages;
	}

	logger.info(
		`[Vision] Model "${modelDef?.id}" does not support vision. Using vision proxy to describe ${imageCount} image(s).`,
	);

	const resolver = createVisionResolver();
	try {
		const result = await resolver.resolve(messages);
		logger.info(`[Vision] Successfully resolved images`);
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
