import vscode from 'vscode';
import { logger } from '../../logger';
import {
	IMAGE_DESCRIPTION_PREFIX,
	IMAGE_DESCRIPTION_SUFFIX,
	IMAGE_DESCRIPTION_UNAVAILABLE,
} from './consts';
import { getVisionPrompt, createVisionModelGetter } from './model';

/**
 * Vision proxy resolver.
 * Uses another model to describe images when the target model doesn't support vision.
 */
export function createVisionResolver(): {
	resolve: (messages: readonly vscode.LanguageModelChatRequestMessage[]) => Promise<readonly vscode.LanguageModelChatRequestMessage[]>;
	dispose: () => void;
} {
	const visionModelGetter = createVisionModelGetter();

	return {
		async resolve(messages) {
			// Count images in messages
			let imageCount = 0;
			for (const m of messages) {
				for (const p of m.content) {
					if (p instanceof vscode.LanguageModelDataPart && p.mimeType.startsWith('image/')) {
						imageCount++;
					}
				}
			}

			logger.info(`[VisionResolver] Resolving ${imageCount} images`);

			if (imageCount === 0) {
				return messages;
			}

			// Get the vision proxy model
			const visionModel = await visionModelGetter.get();
			if (!visionModel) {
				logger.warn('[VisionResolver] No vision proxy model available, stripping images');
				return stripImages(messages);
			}

			logger.info(`[VisionResolver] Using model: ${visionModel.id}`);

			// Resolve each message with images
			const resolved: vscode.LanguageModelChatRequestMessage[] = [];
			for (const message of messages) {
				const imageParts = message.content.filter(
					(p): p is vscode.LanguageModelDataPart =>
						p instanceof vscode.LanguageModelDataPart && p.mimeType.startsWith('image/'),
				);

				if (imageParts.length === 0) {
					resolved.push(message);
					continue;
				}

				logger.info(`[VisionResolver] Processing ${imageParts.length} images in message`);

				// Get text content from the message
				const textParts = message.content.filter(
					(p) => p instanceof vscode.LanguageModelTextPart,
				);
				const textContent = textParts.map((p) => (p as vscode.LanguageModelTextPart).value).join('\n');

				// Describe images using the vision proxy
				const descriptions: string[] = [];
				for (const img of imageParts) {
					try {
						logger.info(`[VisionResolver] Describing image: ${img.mimeType}, size: ${img.data.length} bytes`);
						const description = await describeImage(visionModel, img);
						logger.info(`[VisionResolver] Got description: ${description.substring(0, 100)}...`);
						descriptions.push(description);
					} catch (error) {
						logger.error('[VisionResolver] Failed to describe image:', error);
						descriptions.push(IMAGE_DESCRIPTION_UNAVAILABLE);
					}
				}

				// Build resolved message with descriptions
				const descriptionText = descriptions.join('\n\n');
				const resolvedContent = textContent
					? `${textContent}\n\n${IMAGE_DESCRIPTION_PREFIX}${descriptionText}${IMAGE_DESCRIPTION_SUFFIX}`
					: `${IMAGE_DESCRIPTION_PREFIX}${descriptionText}${IMAGE_DESCRIPTION_SUFFIX}`;

				resolved.push({
					role: message.role,
					content: [new vscode.LanguageModelTextPart(resolvedContent)],
				} as unknown as vscode.LanguageModelChatRequestMessage);
			}

			return resolved;
		},

		dispose() {
			visionModelGetter.reset();
		},
	};
}

async function describeImage(
	visionModel: vscode.LanguageModelChat,
	imagePart: vscode.LanguageModelDataPart,
): Promise<string> {
	const prompt = getVisionPrompt();

	const messages = [
		vscode.LanguageModelChatMessage.User([new vscode.LanguageModelTextPart(prompt), imagePart]),
	];

	const response = await visionModel.sendRequest(
		messages,
		{},
		new vscode.CancellationTokenSource().token,
	);

	let description = '';
	for await (const part of response.stream) {
		if (part instanceof vscode.LanguageModelTextPart) {
			description += part.value;
		}
	}

	return description.trim() || IMAGE_DESCRIPTION_UNAVAILABLE;
}

function stripImages(
	messages: readonly vscode.LanguageModelChatRequestMessage[],
): readonly vscode.LanguageModelChatRequestMessage[] {
	return messages.map((m) => {
		const filtered = m.content.filter(
			(p) => !(p instanceof vscode.LanguageModelDataPart && p.mimeType.startsWith('image/')),
		);
		return {
			role: m.role,
			content: filtered,
		} as unknown as vscode.LanguageModelChatRequestMessage;
	});
}
