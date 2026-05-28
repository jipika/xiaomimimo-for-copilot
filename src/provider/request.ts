import vscode from 'vscode';
import { AuthManager } from '../auth';
import { MiMoClient } from '../client';
import { getApiModelId, getBaseUrl, getMaxTokens, getTemperature, getThinkingMode, getTopP } from '../config';
import { MODELS } from '../consts';
import type { MiMoRequest } from '../types';
import { convertMessages, convertTools, countMessageChars } from './convert';
import { logRequestDiagnostics } from './debug';
import type { ReplayMarkerMetadata } from './replay';
import type { ConversationSegment } from './segment';
import { stripImagesIfNeeded } from './vision';

export interface PreparedChatRequest {
	client: MiMoClient;
	request: MiMoRequest;
	isThinkingModel: boolean;
	totalRequestChars: number;
	replayMarkerMetadata: ReplayMarkerMetadata;
	segment: ConversationSegment;
}

export interface PrepareChatRequestOptions {
	authManager: AuthManager;
	modelInfo: vscode.LanguageModelChatInformation;
	segment: ConversationSegment;
	messages: readonly vscode.LanguageModelChatRequestMessage[];
	options: vscode.ProvideLanguageModelChatResponseOptions;
}

export async function prepareChatRequest({
	authManager,
	modelInfo,
	segment,
	messages,
	options,
}: PrepareChatRequestOptions): Promise<PreparedChatRequest> {
	const apiKey = await authManager.getApiKey();
	if (!apiKey) {
		throw new Error(
			'MiMo API key not configured. Run "MiMo: Set API Key" from the Command Palette.',
		);
	}

	const client = new MiMoClient(getBaseUrl(), apiKey);
	const modelDef = MODELS.find((m) => m.id === modelInfo.id);
	const isThinkingModel = modelDef?.capabilities.thinking ?? false;
	const maxTokens = getMaxTokens();
	const thinkingMode = getThinkingMode();
	const temperature = getTemperature();
	const topP = getTopP();

	// Determine if thinking should be enabled based on setting and model capability
	const enableThinking =
		thinkingMode === 'enabled' ? true : thinkingMode === 'disabled' ? false : isThinkingModel;

	// Strip images for models that don't support vision
	const resolvedMessages = stripImagesIfNeeded(messages, modelDef);
	const mimoMessages = convertMessages(resolvedMessages, isThinkingModel);
	const tools = modelDef?.capabilities.toolCalling ? convertTools(options.tools) : undefined;

	const totalRequestChars = countMessageChars(mimoMessages);

	const request: MiMoRequest = {
		model: getApiModelId(modelInfo.id),
		messages: mimoMessages,
		stream: true,
		tools,
		tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
		max_tokens: maxTokens,
		temperature,
		top_p: topP,
		thinking: enableThinking ? { type: 'enabled' } : { type: 'disabled' },
	};

	logRequestDiagnostics({
		segmentId: segment.segmentId,
		segmentReason: segment.reason,
		messageCount: mimoMessages.length,
		toolCount: tools?.length ?? 0,
		isThinkingModel,
		totalChars: totalRequestChars,
	});

	return {
		client,
		request,
		isThinkingModel,
		totalRequestChars,
		replayMarkerMetadata: {},
		segment,
	};
}
