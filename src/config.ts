import vscode from 'vscode';
import { CONFIG_SECTION } from './consts';

/**
 * Get MiMo API base URL from settings.
 * Falls back to the official endpoint when not configured.
 */
export function getBaseUrl(): string {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	return config.get<string>('baseUrl') || 'https://api.xiaomimimo.com/v1';
}

/**
 * Resolve the API model ID to send to the endpoint.
 *
 * Users can override model IDs via the `modelIdOverrides` setting object
 * (e.g. for third-party API proxies). Falls back to the VS Code model ID
 * when no override is configured.
 */
export function getApiModelId(vscodeModelId: string): string {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	const overrides = config.get<Record<string, string>>('modelIdOverrides');
	const override = overrides?.[vscodeModelId]?.trim();
	return override || vscodeModelId;
}

/**
 * Get the configured max output tokens limit.
 * Returns `undefined` when set to 0 (API default — no limit).
 */
export function getMaxTokens(): number | undefined {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	const value = config.get<number>('maxTokens', 0);
	return value > 0 ? value : undefined;
}

export type ThinkingMode = 'auto' | 'enabled' | 'disabled';

/**
 * Get the configured thinking mode.
 * 'auto' enables thinking for thinking-capable models,
 * 'enabled' forces it on, 'disabled' forces it off.
 */
export function getThinkingMode(): ThinkingMode {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	return config.get<ThinkingMode>('thinkingMode', 'auto');
}

/**
 * Get the configured temperature.
 * Returns `undefined` when set to -1 (use API default per model).
 */
export function getTemperature(): number | undefined {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	const value = config.get<number>('temperature', -1);
	return value >= 0 ? value : undefined;
}

/**
 * Get the configured top_p.
 * Returns `undefined` when set to -1 (use API default).
 */
export function getTopP(): number | undefined {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	const value = config.get<number>('topP', -1);
	return value >= 0 ? value : undefined;
}
