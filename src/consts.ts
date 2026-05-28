import type { ModelDefinition } from './types';

/**
 * Compile-time constants shared across the extension.
 *
 * These do NOT depend on the VS Code runtime (no workspace configuration,
 * no secrets API). For run-time settings reads see `config.ts`.
 */

/** VS Code configuration section prefix for all extension settings. */
export const CONFIG_SECTION = 'mimo-copilot';

// ---- Secret keys ----

/** SecretStorage key for the MiMo API key. */
export const API_KEY_SECRET = 'mimo-copilot.apiKey';

/** memento key tracking whether the welcome walkthrough has been shown. */
export const WELCOME_SHOWN_KEY = 'mimo-copilot.welcomeShown';

// ---- Walkthrough ----

/** Walkthrough contribution ID. */
export const WALKTHROUGH_ID = 'sdmapvstool.xiaomimimo-for-copilot#mimoGettingStarted';

// ---- Model picker ----

/** Detail text shown in the model picker when no API key is configured. */
export const API_KEY_REQUIRED_DETAIL = 'Please run MiMo: Set API Key to configure.';

// ---- Model registry ----

/**
 * Available MiMo models exposed through the language model provider.
 *
 * Context window and max output values from:
 * https://platform.xiaomimimo.com/docs/zh-CN/quick-start/model
 *
 * maxInputTokens = contextWindow - maxOutputTokens
 */
export const MODELS: ModelDefinition[] = [
	{
		id: 'mimo-v2.5-pro',
		name: 'MiMo V2.5 Pro',
		family: 'mimo',
		version: 'v2.5',
		detail: '1M context, 128K output — most capable reasoning model',
		maxInputTokens: 917504, // 1M context - 128K output
		maxOutputTokens: 131072, // 128K
		capabilities: {
			toolCalling: true,
			imageInput: false,
			thinking: true,
		},
		requiresThinkingParam: false,
	},
	{
		id: 'mimo-v2.5',
		name: 'MiMo V2.5',
		family: 'mimo',
		version: 'v2.5',
		detail: '1M context, 128K output — fast model with vision support',
		maxInputTokens: 917504, // 1M context - 128K output
		maxOutputTokens: 131072, // 128K
		capabilities: {
			toolCalling: true,
			imageInput: true,
			thinking: true,
		},
		requiresThinkingParam: false,
	},
	{
		id: 'mimo-v2-flash',
		name: 'MiMo V2 Flash',
		family: 'mimo',
		version: 'v2',
		detail: '256K context, 64K output — fast and efficient',
		maxInputTokens: 196608, // 256K context - 64K output
		maxOutputTokens: 65536, // 64K
		capabilities: {
			toolCalling: true,
			imageInput: false,
			thinking: false, // disabled by default per docs
		},
		requiresThinkingParam: false,
	},
];
