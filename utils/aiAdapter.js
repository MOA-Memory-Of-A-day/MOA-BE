// utils/aiAdapter.js
const { getSignedReadUrl } = require('../utils/s3');

function mapTypeForAI(recordType) {
  const t = (recordType || '').toLowerCase();
  if (t === 'text+image') return 'image_with_text'; // AI 포맷으로 치환
  if (t === 'voice') return 'audio';               // 과거 데이터 호환
  return t; // text, image, audio
}

/**
 * @param {Array} records - DB에서 꺼낸 기록들
 * 반환: AI에 바로 넘길 payload 배열
 */
async function toAIPayload(records) {
  const items = [];
  for (const r of records) {
    const type = mapTypeForAI(r.type);
    const time_stamp = r.createdAt ? new Date(r.createdAt).toISOString() : null;

    if (type === 'text') {
      items.push({ type: 'text', content: r.context || '', time_stamp });

    } else if (type === 'image') {
      if (r.media?.key) {
        const path = await getSignedReadUrl(r.media.key);
        items.push({ type: 'image', path, time_stamp });
      }

    } else if (type === 'image_with_text') {
      const path = r.media?.key ? await getSignedReadUrl(r.media.key) : null;
      items.push({
        type: 'image_with_text',
        content: r.context || '',
        path,
        time_stamp,
      });

    } else if (type === 'audio') {
      if (r.media?.key) {
        const path = await getSignedReadUrl(r.media.key);
        items.push({ type: 'audio', path, time_stamp });
      }
    }
  }
  // 안전하게 time_stamp 기준 오름차순 정렬(없으면 기존 순서 유지)
  items.sort((a, b) => {
    if (!a.time_stamp || !b.time_stamp) return 0;
    return new Date(a.time_stamp) - new Date(b.time_stamp);
  });
  return items;
}

module.exports = { toAIPayload };