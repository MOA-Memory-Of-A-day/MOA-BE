// routes/auth.js
const express = require('express');
const { OAuth2Client } = require('google-auth-library');

const router = express.Router();

// .env에 GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';
const client = new OAuth2Client(CLIENT_ID);

// POST /auth/google  ← 여기로 cURL 보내면 됨
router.post('/google', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ message: 'idToken required' });

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: CLIENT_ID, // 반드시 웹 클라 ID
    });
    const payload = ticket.getPayload();
    console.log(payload);

    // 디버깅용 응답
    return res.json({
      message: 'Google token verified',
      userid: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      email_verified: payload.email_verified,
    });
  } catch (err) {
    console.error('❌ verifyIdToken failed:', err.message);
    return res.status(401).json({ message: 'Invalid Google ID token' });
  }
});

module.exports = router;