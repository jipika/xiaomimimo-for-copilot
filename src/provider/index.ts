import vscode from 'vscode';
import { AuthManager } from '../auth';
import { API_KEY_REQUIRED_DETAIL, MODELS } from '../consts';
import { logger } from '../logger';
import type { ModelDefinition } from '../types';
import { prepareChatRequest } from './request';
import { resolveConversationSegment } from './segment';
import { streamChatCompletion } from './stream';

/**
 * NOTE: Non-public API surface.
 *
 * The fields below (`modelConfiguration` on response options, plus
 * `isUserSelectable` / `statusIcon`) are not part of the stable
 * `vscode.LanguageModelChat*` typings yet. They are the same shape
 * currently consumed by GitHub Copilot Chat to render the model picker.
 */

/**
 * Non-public: extra fields on `LanguageModelChatInformation` consumed by the
 * Copilot Chat model picker — `isUserSelectable` controls picker visibility,
 * `statusIcon` renders a leading icon (e.g. warning when key missing).
 */
type ModelPickerChatInformation = vscode.LanguageModelChatInformation & {
	readonly isUserSelectable: boolean;
	readonly statusIcon?: vscode.ThemeIcon;
};

/**
 * MiMo Chat Provider — implements vscode.LanguageModelChatProvider so
 * MiMo models appear directly in the Copilot Chat model picker.
 */
export class MiMoChatProvider implements vscode.LanguageModelChatProvider {
	private readonly authManager: AuthManager;
	private readonly onDidChangeLanguageModelChatInformationEmitter = new vscode.EventEmitter<void>();
	private isActive = true;

	readonly onDidChangeLanguageModelChatInformation =
		this.onDidChangeLanguageModelChatInformationEmitter.event;

	/**
	 * Adaptive chars-per-token ratio, calibrated from actual usage data.
	 * Updated via exponential moving average each time the API reports real token counts.
	 */
	private charsPerToken = 4.0;

	constructor(context: vscode.ExtensionContext) {
		this.authManager = new AuthManager(context);

		context.subscriptions.push(
			this.onDidChangeLanguageModelChatInformationEmitter,
			// Settings-based fallback API key changes.
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration('mimo-copilot.apiKey')) {
					this.onDidChangeLanguageModelChatInformationEmitter.fire();
				}
			}),
			// Multi-window: SecretStorage changes don't fire onDidChangeConfiguration.
			// When another window sets/clears the API key, refresh this window's
			// model picker so the warning state stays in sync.
			context.secrets.onDidChange((e) => {
				if (e.key === 'mimo-copilot.apiKey') {
					this.onDidChangeLanguageModelChatInformationEmitter.fire();
				}
			}),
		);
	}

	// ---- Public commands ----

	async configureApiKey(): Promise<void> {
		const saved = await this.authManager.promptForApiKey();
		if (saved) {
			this.onDidChangeLanguageModelChatInformationEmitter.fire();
		}
	}

	async clearApiKey(): Promise<void> {
		await this.authManager.deleteApiKey();
		this.onDidChangeLanguageModelChatInformationEmitter.fire();
		vscode.window.showInformationMessage('MiMo API key removed.');
	}

	async hasApiKey(): Promise<boolean> {
		return this.authManager.hasApiKey();
	}

	async prepareForDeactivate(): Promise<void> {
		this.isActive = false;
		this.onDidChangeLanguageModelChatInformationEmitter.fire();

		// Force the host to re-pull `provideLanguageModelChatInformation` synchronously
		// before the extension unloads. With `isActive = false` we now return [],
		// which makes Copilot Chat drop MiMo models from the picker immediately
		// instead of leaving stale entries behind after deactivate.
		try {
			await vscode.lm.selectChatModels({ vendor: 'mimo' });
		} catch (error) {
			logger.warn('Failed to refresh MiMo models during deactivate', error);
		}
	}

	// ---- LanguageModelChatProvider ----

	async provideLanguageModelChatInformation(
		_options: vscode.PrepareLanguageModelChatModelOptions,
		_token: vscode.CancellationToken,
	): Promise<vscode.LanguageModelChatInformation[]> {
		if (!this.isActive) {
			return [];
		}

		const hasKey = await this.authManager.hasApiKey();
		return MODELS.map((model) => toChatInfo(model, hasKey));
	}

	async provideLanguageModelChatResponse(
		modelInfo: vscode.LanguageModelChatInformation,
		messages: readonly vscode.LanguageModelChatRequestMessage[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken,
	): Promise<void> {
		const segment = resolveConversationSegment(messages);

		const prepared = await prepareChatRequest({
			authManager: this.authManager,
			modelInfo,
			segment,
			messages,
			options,
		});

		return streamChatCompletion({
			prepared,
			progress,
			token,
			getCharsPerToken: () => this.charsPerToken,
			setCharsPerToken: (charsPerToken) => {
				this.charsPerToken = charsPerToken;
			},
		});
	}

	async provideTokenCount(
		_modelInfo: vscode.LanguageModelChatInformation,
		text: string | vscode.LanguageModelChatRequestMessage,
		_token: vscode.CancellationToken,
	): Promise<number> {
		if (typeof text === 'string') {
			return Math.max(1, Math.ceil(text.length / this.charsPerToken));
		}

		if (!text?.content || !Array.isArray(text.content)) {
			return 1;
		}

		let total = 0;
		for (const part of text.content) {
			if (part instanceof vscode.LanguageModelTextPart) {
				total += part.value.length;
			}
		}
		return Math.max(1, Math.ceil(total / this.charsPerToken));
	}
}

// ---- Helpers ----

function toChatInfo(m: ModelDefinition, hasApiKey: boolean): ModelPickerChatInformation {
	return {
		id: m.id,
		name: m.name,
		family: m.family,
		version: m.version,
		detail: hasApiKey ? m.detail : API_KEY_REQUIRED_DETAIL,
		tooltip: hasApiKey ? undefined : API_KEY_REQUIRED_DETAIL,
		statusIcon: hasApiKey ? undefined : new vscode.ThemeIcon('warning'),
		maxInputTokens: m.maxInputTokens,
		maxOutputTokens: m.maxOutputTokens,
		isUserSelectable: true,
		capabilities: {
			toolCalling: m.capabilities.toolCalling,
			imageInput: m.capabilities.imageInput,
		},
	};
}
