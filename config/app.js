const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const JWT_EXPIRES_IN = '12h';

module.exports = {
  PORT,
  JWT_SECRET,
  JWT_EXPIRES_IN,
};
