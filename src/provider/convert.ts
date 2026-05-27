import vscode from 'vscode';
import type { MiMoContentPart, MiMoMessage, MiMoTool, MiMoToolCall } from '../types';
import { parseFirstReplayMarker } from './replay';

/**
 * Convert VS Code chat messages to MiMo format.
 * Injects marker-replayed reasoning_content for assistant messages.
 */
export function convertMessages(
	messages: readonly vscode.LanguageModelChatRequestMessage[],
	isThinkingModel: boolean,
): MiMoMessage[] {
	const result: MiMoMessage[] = [];

	for (const message of messages) {
		const role = mapRole(message.role);

		let textContent = '';
		const imageParts: MiMoContentPart[] = [];
		const toolCalls: MiMoToolCall[] = [];
		const toolResults: Array<{ callId: string; content: string }> = [];

		for (const part of message.content) {
			if (part instanceof vscode.LanguageModelTextPart) {
				textContent += part.value;
			} else if (isLanguageModelThinkingPart(part)) {
				// Thinking parts are handled via replay markers, skip here
			} else if (part instanceof vscode.LanguageModelDataPart) {
				if (part.mimeType.startsWith('image/')) {
					const base64 = Buffer.from(part.data).toString('base64');
					imageParts.push({
						type: 'image_url',
						image_url: { url: `data:${part.mimeType};base64,${base64}` },
					});
				}
				// Replay marker DataParts are parsed separately, skip here
			} else if (part instanceof vscode.LanguageModelToolCallPart) {
				toolCalls.push({
					id: part.callId,
					type: 'function',
					function: {
						name: part.name,
						arguments: JSON.stringify(part.input),
					},
				});
			} else if (part instanceof vscode.LanguageModelToolResultPart) {
				let toolContent = '';
				for (const item of part.content) {
					if (item instanceof vscode.LanguageModelTextPart) {
						toolContent += item.value;
					}
				}
				toolResults.push({
					callId: part.callId,
					content: toolContent || JSON.stringify(part.content),
				});
			}
		}

		if (role === 'assistant') {
			if (textContent || toolCalls.length > 0) {
				const replayMarker = isThinkingModel ? parseFirstReplayMarker(message) : undefined;
				const msg: MiMoMessage = {
					role: 'assistant' as const,
					content: textContent || '',
				};

				if (toolCalls.length > 0) {
					msg.tool_calls = toolCalls;
				}

				if (isThinkingModel) {
					msg.reasoning_content = getReasoningContent(replayMarker);
				}

				result.push(msg);
			}
		} else if (textContent || imageParts.length > 0) {
			// Build multipart content when images are present
			const content: MiMoMessage['content'] =
				imageParts.length > 0
					? [...(textContent ? [{ type: 'text' as const, text: textContent }] : []), ...imageParts]
					: textContent;

			result.push({
				role: role as 'user' | 'assistant',
				content,
			});
		}

		// Tool result messages follow their associated assistant message
		for (const tr of toolResults) {
			result.push({
				role: 'tool',
				content: tr.content,
				tool_call_id: tr.callId,
			});
		}
	}

	return result;
}

function getReasoningContent(
	replayMarker: ReturnType<typeof parseFirstReplayMarker>,
): string {
	if (replayMarker?.valid && replayMarker.reasoningText) {
		return replayMarker.reasoningText;
	}
	return '';
}

function isLanguageModelThinkingPart(part: unknown): part is vscode.LanguageModelThinkingPart {
	return (
		typeof vscode.LanguageModelThinkingPart === 'function' &&
		part instanceof vscode.LanguageModelThinkingPart
	);
}

function mapRole(role: vscode.LanguageModelChatMessageRole): 'user' | 'assistant' {
	switch (role) {
		case vscode.LanguageModelChatMessageRole.User:
			return 'user';
		case vscode.LanguageModelChatMessageRole.Assistant:
			return 'assistant';
		default:
			return 'user';
	}
}

/**
 * Convert VS Code tool definitions to MiMo format.
 */
export function convertTools(
	tools: readonly vscode.LanguageModelChatTool[] | undefined,
): MiMoTool[] | undefined {
	if (!tools || tools.length === 0) {
		return undefined;
	}

	return tools.map((tool) => ({
		type: 'function' as const,
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.inputSchema as Record<string, unknown> | undefined,
		},
	}));
}

/**
 * Count total characters across all messages to calibrate chars-per-token ratio.
 */
export function countMessageChars(messages: MiMoMessage[]): number {
	let total = 0;
	for (const msg of messages) {
		total += msg.content?.length ?? 0;
		if (msg.tool_calls) {
			for (const tc of msg.tool_calls) {
				total += tc.function?.name?.length ?? 0;
				total += tc.function?.arguments?.length ?? 0;
			}
		}
	}
	return total;
}
