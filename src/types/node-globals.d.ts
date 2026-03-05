// Minimal Node.js globals/types to allow `tsc` build in environments
// where `@types/node` is not available.

declare const process: {
	env: Record<string, string | undefined>
	uptime(): number
	exit(code?: number): never
}

declare namespace NodeJS {
	interface ProcessEnv {
		[key: string]: string | undefined
	}
}

declare function require(id: string): any
declare const __dirname: string
declare const __filename: string
