module.exports = {
	apps: [
		{
			name: 'telegram-reception-bot',
			cwd: __dirname,
			script: 'dist/index.js',
			interpreter: 'node',
			exec_mode: 'fork',
			autorestart: true,
			watch: false,
			max_restarts: 10,
			restart_delay: 3000,
			env: {
				NODE_ENV: 'production'
			}
		}
	]
}
