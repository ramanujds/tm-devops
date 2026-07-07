// Simple API key check for /orders routes.
// Expects header: x-api-key: <API_KEY env var value>
function requireApiKey(req, res, next) {
  const providedKey = req.get("x-api-key");

  if (!providedKey || providedKey !== process.env.API_KEY) {
    return res.status(401).json({ error: "unauthorized: missing or invalid x-api-key header" });
  }

  next();
}

module.exports = { requireApiKey };
