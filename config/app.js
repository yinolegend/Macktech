const PORT = Number(process.env.PORT) || 3000;
const HOST = String(process.env.HOST || '0.0.0.0').trim() || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const JWT_EXPIRES_IN = '12h';
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

module.exports = {
  PORT,
  HOST,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  SESSION_MAX_AGE_MS,
};
