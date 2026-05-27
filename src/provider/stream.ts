import vscode from 'vscode';
import { logger } from '../logger';
import type { MiMoToolCall, MiMoUsage } from '../types';
import { logUsageDiagnostics } from './debug';
import { createReplayMarkerPart, hasReplayMarkerMetadata, type ReplayMarkerMetadata } from './replay';
import type { PreparedChatRequest } from './request';

interface ResponseStreamState {
	accumulatedReasoning: string;
	emittedToolCallIds: string[];
	replayMarkerReported: boolean;
}

const COPILOT_USAGE_DATA_PART_MIME = 'usage';

export interface StreamChatCompletionOptions {
	prepared: PreparedChatRequest;
	progress: vscode.Progress<vscode.LanguageModelResponsePart>;
	token: vscode.CancellationToken;
	getCharsPerToken: () => number;
	setCharsPerToken: (charsPerToken: number) => void;
}

export function streamChatCompletion({
	prepared,
	progress,
	token,
	getCharsPerToken,
	setCharsPerToken,
}: StreamChatCompletionOptions): Promise<void> {
	const state: ResponseStreamState = {
		accumulatedReasoning: '',
		emittedToolCallIds: [],
		replayMarkerReported: false,
	};

	return prepared.client
		.streamChatCompletion(
			prepared.request,
			{
				onContent: (content: string) => {
					progress.report(new vscode.LanguageModelTextPart(content));
				},

				onThinking: (text: string) => {
					state.accumulatedReasoning += text;
					progress.report(
						new vscode.LanguageModelThinkingPart(text) as unknown as vscode.LanguageModelResponsePart,
					);
				},

				onToolCall: (toolCall: MiMoToolCall) => {
					state.emittedToolCallIds.push(toolCall.id);
					try {
						const args = JSON.parse(toolCall.function.arguments);
						progress.report(
							new vscode.LanguageModelToolCallPart(toolCall.id, toolCall.function.name, args),
						);
					} catch {
						progress.report(
							new vscode.LanguageModelToolCallPart(toolCall.id, toolCall.function.name, {}),
						);
					}
				},

				onError: (error: Error) => {
					throw error;
				},

				onDone: () => {
					reportReplayMarkerOnce(prepared, progress, state);
				},

				onUsage: (usage) => {
					const charsPerToken = updateCharsPerToken(
						prepared.totalRequestChars,
						usage,
						getCharsPerToken(),
					);
					setCharsPerToken(charsPerToken);
					logUsageDiagnostics(usage, charsPerToken);
					reportCopilotContextUsage(progress, usage);
				},
			},
			token,
		)
		.then(undefined, (error) => {
			// Report replay marker even on cancellation/error
			if (!state.replayMarkerReported) {
				state.replayMarkerReported = true;
				logger.warn('Stream ended before replay marker could be reported');
			}
			throw error;
		});
}

function reportReplayMarkerOnce(
	prepared: PreparedChatRequest,
	progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	state: ResponseStreamState,
): void {
	if (state.replayMarkerReported) {
		return;
	}
	state.replayMarkerReported = true;

	const metadata: ReplayMarkerMetadata = {
		...prepared.replayMarkerMetadata,
		reasoningText: state.accumulatedReasoning || undefined,
	};

	if (!hasReplayMarkerMetadata(metadata)) {
		return;
	}

	try {
		const markerPart = createReplayMarkerPart(metadata);
		progress.report(markerPart);
	} catch (error) {
		logger.warn('Failed to report replay marker', error);
	}
}

function updateCharsPerToken(
	totalRequestChars: number,
	usage: MiMoUsage,
	charsPerToken: number,
): number {
	if (totalRequestChars > 0 && usage.prompt_tokens > 0) {
		const observedRatio = totalRequestChars / usage.prompt_tokens;
		return charsPerToken * 0.7 + observedRatio * 0.3;
	}
	return charsPerToken;
}

function reportCopilotContextUsage(
	progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	usage: MiMoUsage,
): void {
	const data = {
		prompt_tokens: usage.prompt_tokens,
		completion_tokens: usage.completion_tokens,
		total_tokens: usage.total_tokens,
		prompt_tokens_details: {
			cached_tokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
		},
	};

	progress.report(
		new vscode.LanguageModelDataPart(
			new TextEncoder().encode(JSON.stringify(data)),
			COPILOT_USAGE_DATA_PART_MIME,
		),
	);
}
