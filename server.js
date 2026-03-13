const { startServer } = require('./backend/server');

startServer().catch((error) => {
	console.error('failed to start server', error && error.message ? error.message : error);
	process.exit(1);
});
