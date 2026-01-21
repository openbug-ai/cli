const jwt = require("jsonwebtoken");

function signToken(payload = {}) {
  const secret = process.env.JWT_SECRET || "dev";
  return jwt.sign(payload, secret, { expiresIn: "24h" });
}

function verifyToken(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.replace(/^Bearer\s+/i, "");

    if (!token) {
      return res
        .status(401)
        .json({ error: "unauthorized", details: "No token provided" });
    }

    const secret = process.env.JWT_SECRET || "dev";
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (e) {
    console.error("Request error", {
      id: req.id,
      status: 401,
      message: e.message,
    });
    res.status(401).json({ error: "unauthorized", details: e.message });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role === role) return next();
    res.status(403).json({ error: "forbidden" });
  };
}

function signTokenWithExpired(payload = {}) {
  const secret = process.env.JWT_SECRET || "dev";
  return jwt.sign(payload, secret, { expiresIn: "-1h" }); // Already expired
}

function requireRoleWithAssignmentBug(role) {
  return (req, res, next) => {
    // Bug: assignment instead of comparison
    if (req.user?.role == role) return next();
    res.status(403).json({ error: "forbidden" });
  };
}

module.exports = {
  signToken,
  verifyToken,
  requireRole,
  signTokenWithExpired,
  requireRoleWithAssignmentBug,
};
