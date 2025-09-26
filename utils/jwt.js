const jwt = require("jsonwebtoken");

function signAccess(user) {
  return jwt.sign(
    {
      uid: user._id.toString(),
      provider: user.provider,
      providerID: user.providerID,
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "4h" }
  );
}

function signRefresh(user) {
  return jwt.sign(
    {
      uid: user._id.toString(),
      provider: user.provider,
      providerID: user.providerID,
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "30d" }
  );
}

module.exports = { signAccess, signRefresh };