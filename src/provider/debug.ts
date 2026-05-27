import { logger } from '../logger';

export interface RequestDiagnostics {
	segmentId: string;
	segmentReason: string;
	messageCount: number;
	toolCount: number;
	isThinkingModel: boolean;
	totalChars: number;
}

export function logRequestDiagnostics(diag: RequestDiagnostics): void {
	logger.info(
		`request: segment=${diag.segmentId.slice(0, 8)} reason=${diag.segmentReason}` +
			` msgs=${diag.messageCount} tools=${diag.toolCount}` +
			` thinking=${diag.isThinkingModel} chars=${diag.totalChars}`,
	);
}

export function logUsageDiagnostics(
	usage: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
		prompt_tokens_details?: { cached_tokens?: number };
		completion_tokens_details?: { reasoning_tokens?: number };
	},
	charsPerToken: number,
): void {
	const cacheHit = usage.prompt_tokens_details?.cached_tokens ?? 0;
	const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens ?? 0;
	const hitRate =
		usage.prompt_tokens > 0 ? ((cacheHit / usage.prompt_tokens) * 100).toFixed(0) : 'n/a';
	logger.info(
		`tokens: prompt=${usage.prompt_tokens} completion=${usage.completion_tokens}` +
			` | cache: hit=${cacheHit} rate=${hitRate}%` +
			` | reasoning=${reasoningTokens}` +
			` | chars/tok=${charsPerToken.toFixed(2)}`,
	);
}
