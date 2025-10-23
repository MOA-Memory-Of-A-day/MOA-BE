// utils/jwt.js
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require('uuid');

/**
 * access token: 기존과 동일하게 유지 (짧게)
 */
function signAccess(user) {
  return jwt.sign(
    {
      uid: user._id.toString(),
      provider: user.provider,
      providerID: user.providerID,
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "15m" }
  );
}

/**
 * refresh token: jti 포함, DB에 sessions 레코드 생성
 * - db: MongoDB 데이터베이스 객체 (req.app.locals.db)
 * - user: user document
 * - meta: optional (ip, userAgent 등)
 */
async function signRefresh(user, db, meta = {}) {

  if (!db) {
    throw new Error("signRefresh: db is undefined. Pass req.app.locals.db as the 2nd argument.");
  }
  const jti = uuidv4();
  const expiresInSeconds = 30 * 24 * 3600; // 30 days

  const payload = {
    uid: user._id.toString(),
    jti,
    provider: user.provider,
    providerID: user.providerID,
  };

  const token = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: `${expiresInSeconds}s`,
  });

  const now = new Date();
  const sessionDoc = {
    userId: user._id,
    jti,
    createdAt: now,
    expiresAt: new Date(now.getTime() + expiresInSeconds * 1000),
    revokedAt: null,
    ip: meta.ip || null,
    userAgent: meta.userAgent || null,
  };

  // sessions 콜렉션에 레코드 저장
  await db.collection('sessions').insertOne(sessionDoc);

  return token;
}

module.exports = { signAccess, signRefresh };