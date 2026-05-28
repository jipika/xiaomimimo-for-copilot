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
	if (modelDef?.capabilities.imageInput) {
		return messages;
	}

	const hasImages = messages.some((m) =>
		m.content.some(
			(p) => p instanceof vscode.LanguageModelDataPart && p.mimeType.startsWith('image/'),
		),
	);

	if (!hasImages) {
		return messages;
	}

	logger.info(
		`Model "${modelDef?.id}" does not support vision. Using vision proxy to describe images.`,
	);

	const resolver = createVisionResolver();
	try {
		return await resolver.resolve(messages);
	} catch (error) {
		logger.warn('Vision proxy failed, stripping images:', error);
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
