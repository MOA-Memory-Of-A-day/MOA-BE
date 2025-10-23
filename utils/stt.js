const fs = require('fs');
const os = require('os');
const path = require('path');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


async function transcribeAudioBuffer(buffer, filename = 'audio.webm', language = 'ko') {
  const tmpPath = path.join(
    os.tmpdir(),
    `moa_${Date.now()}_${Math.random().toString(36).slice(2)}_${filename}`
  );

  await fs.promises.writeFile(tmpPath, buffer);
  try {
    const resp = await openai.audio.transcriptions.create({
      // 최신 SDK는 fs.createReadStream를 받습니다.
      file: fs.createReadStream(tmpPath),
      model: 'whisper-1',       // 또는 최신: 'gpt-4o-transcribe'
      language,                 // 'ko' 힌트
      // prompt: '...',         // 도메인 맞춤 힌트가 있으면 여기에
    });
    return resp?.text || '';
  } finally {
    fs.promises.unlink(tmpPath).catch(() => {});
  }
}

module.exports = { transcribeAudioBuffer };