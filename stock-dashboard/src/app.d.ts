// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

declare module '$env/static/private' {
	export const DB_HOST: string;
	export const DB_PORT: string;
	export const DB_NAME: string;
	export const DB_USER: string;
	export const DB_PASSWORD: string;
	export const KIS_BASE_URL: string;
	export const KIS_APP_KEY: string;
	export const KIS_APP_SECRET: string;
}

export {};
