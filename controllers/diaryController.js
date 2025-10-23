// controllers/diaryController.js
const axios = require('axios');
const { ObjectId } = require('mongodb');
const { toAIPayload } = require('../utils/aiAdapter');
const { getSignedReadUrl } = require('../utils/s3');
const { getUserOr401 } = require('../utils/auth');

const AI_URL = process.env.AI_SERVICE_URL;

function kstDayRange(dateStr) {
  const now = new Date();
  let y, m, d;
  if (dateStr) {
    const [Y, M, D] = String(dateStr).split('-').map(Number);
    y = Y; m = M; d = D;
  } else {
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    y = kstNow.getUTCFullYear();
    m = kstNow.getUTCMonth() + 1;
    d = kstNow.getUTCDate();
  }
  const startUtc = new Date(Date.UTC(y, m - 1, d, -9, 0, 0));
  const endUtc   = new Date(Date.UTC(y, m - 1, d + 1, -9, 0, 0));
  return { startUtc, endUtc };
}

exports.createDiary = async (req, res) => {
  try {
    const db = req.app.locals.db;

    const user = getUserOr401(req, res);
    if (!user) return;
    const userId = user.uid;

    const { date, persona = 0 } = req.body || {};
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      return res.status(400).json({ message: 'date (YYYY-MM-DD) is required' });
    }

    const { startUtc, endUtc } = kstDayRange(date);
    const records = await db.collection('records')
      .find({
        userId: new ObjectId(userId),
        createdAt: { $gte: startUtc, $lt: endUtc },
      })
      .sort({ createdAt: 1 })
      .toArray();

    if (records.length === 0) {
      return res.status(404).json({ message: 'no records for the specified date' });
    }

    // ==== 핵심: AI에 보낼 items 구성 (이미지에는 presigned URL을 path로 포함) ====
    const items = await Promise.all(records.map(async (r) => {
      // 기본값
      const context = r.context ?? '';

      if ((r.type === 'image' || r.type === 'text+image') && r.media?.key) {
        const url = await getSignedReadUrl(r.media.key); // presigned URL
        if (r.type === 'text+image') {
          // 서버의 app.py가 text+image를 image_with_text로 매핑해서 처리함
          return { type: 'text+image', content: context, path: url };
        }
        return { type: 'image', path: url };
      }

      if (r.type === 'audio' && r.media?.key) {
        const url = await getSignedReadUrl(r.media.key);
        // 서버의 app.py가 voice->audio 매핑도 지원하지만 여기서는 이미 audio로 보냄
        return { type: 'audio', path: url };
      }

      // 텍스트만
      return { type: 'text', content: context };
    }));

    // 모든 항목이 빈 텍스트이거나 path 없는 경우 방어
    const hasContent = items.some(it =>
      (it.type === 'text' && it.content && it.content.trim().length > 0) ||
      (it.path && typeof it.path === 'string' && it.path.length > 0)
    );
    if (!hasContent) {
      return res.status(400).json({ message: 'no valid items to send to AI' });
    }

    // ==== AI 호출 ====
    let aiResp;
    try {
      aiResp = await axios.post(
        `${AI_URL}/diary/generate`,
        { items, persona },
        { timeout: 60_000 }
      );
    } catch (e) {
      const detail = e?.response?.data || e?.message || e;
      console.error('AI call failed:', detail);
      return res.status(502).json({ message: 'AI service error', detail });
    }

    const diaryText = aiResp.data?.diary || '';
    if (!diaryText) {
      return res.status(502).json({ message: 'AI empty response' });
    }

    // 클라이언트 미리보기용 이미지 URL과, DB 저장용 key 리스트 구성
    const imagePresigned = [];
    const imageKeys = [];
    for (const r of records) {
      if (r.media?.type === 'image' && r.media?.key) {
        const url = await getSignedReadUrl(r.media.key);
        imagePresigned.push({ url, createdAt: r.createdAt });
        imageKeys.push({ key: r.media.key, createdAt: r.createdAt });
      }
    }

    const emotion = null;

    const now = new Date();
    const diaryDoc = {
      userId: new ObjectId(userId),
      text: diaryText,
      persona,
      emotion,
      images: imageKeys,
      sources: records.map(r => ({
        recordId: r._id,
        type: r.type,
        createdAt: r.createdAt,
      })),
      createdAt: now,
      updatedAt: now,
      date,
    };
    const result = await db.collection('diaries').insertOne(diaryDoc);

    return res.status(201).json({
      message: 'diary created',
      diary: {
        id: result.insertedId.toString(),
        text: diaryText,
        persona,
        emotion,
        date,
        createdAt: now,
        images: imagePresigned,
      },
    });
  } catch (err) {
    console.error('createDiary failed:', err);
    return res.status(500).json({ message: 'server error' });
  }
};

// exports.createDiary = async (req, res) => {
//   try {
//     const db = req.app.locals.db;

//     const user = getUserOr401(req, res);
//     if (!user) return;
//     const userId = user.uid;

//     const { date, persona = 0 } = req.body || {};
//     if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
//       return res.status(400).json({ message: 'date (YYYY-MM-DD) is required' });
//     }

//     const { startUtc, endUtc } = kstDayRange(date);
//     const records = await db.collection('records')
//       .find({
//         userId: new ObjectId(userId),
//         createdAt: { $gte: startUtc, $lt: endUtc },
//       })
//       .sort({ createdAt: 1 })
//       .toArray();

//     if (records.length === 0) {
//       return res.status(404).json({ message: 'no records for the specified date' });
//     }

//     const aiItems = await toAIPayload(records);

//     let aiResp;
//     try {
//       aiResp = await axios.post(
//         `${AI_URL}/diary/generate`,
//         { items: aiItems, persona },
//         { timeout: 60_000 }
//       );
//     } catch (e) {
//       const detail = e?.response?.data || e?.message || e;
//       console.error('AI call failed:', detail);
//       return res.status(502).json({ message: 'AI service error', detail });
//     }

//     const diaryText = aiResp.data?.diary || '';
//     if (!diaryText) {
//       return res.status(502).json({ message: 'AI empty response' });
//     }

//     const imagePresigned = [];
//     const imageKeys = [];
//     for (const r of records) {
//       if (r.media?.type === 'image' && r.media?.key) {
//         const url = await getSignedReadUrl(r.media.key);
//         imagePresigned.push({ url, createdAt: r.createdAt });
//         imageKeys.push({ key: r.media.key, createdAt: r.createdAt });
//       }
//     }

//     const emotion = null;

//     const now = new Date();
//     const diaryDoc = {
//       userId: new ObjectId(userId),
//       text: diaryText,
//       persona,
//       emotion,
//       images: imageKeys,
//       sources: records.map(r => ({
//         recordId: r._id,
//         type: r.type,
//         createdAt: r.createdAt,
//       })),
//       createdAt: now,
//       updatedAt: now,
//       date,
//     };
//     const result = await db.collection('diaries').insertOne(diaryDoc);

//     return res.status(201).json({
//       message: 'diary created',
//       diary: {
//         id: result.insertedId.toString(),
//         text: diaryText,
//         persona,
//         emotion,
//         date,
//         createdAt: now,
//         images: imagePresigned,
//       },
//     });
//   } catch (err) {
//     console.error('createDiary failed:', err);
//     return res.status(500).json({ message: 'server error' });
//   }
// };

exports.getDiary = async (req, res) => {
  try {
    const db = req.app.locals.db;

    const user = getUserOr401(req, res);
    if (!user) return;
    const userId = user.uid;

    const { id } = req.body || req.params || {};
    if (!id) return res.status(400).json({ message: 'diary id is required' });

    const diary = await db.collection('diaries').findOne({
      _id: new ObjectId(id),
      userId: new ObjectId(userId),
    });
    if (!diary) return res.status(404).json({ message: 'diary not found' });

    return res.status(200).json({
      id: diary._id.toString(),
      text: diary.text,
      persona: diary.persona,
      emotion: diary.emotion ?? null,
      date: diary.date ?? null,
      createdAt: diary.createdAt,
      updatedAt: diary.updatedAt,
      sources:
        diary.sources?.map(s => ({
          recordId: s.recordId.toString(),
          type: s.type,
          createdAt: s.createdAt,
        })) ?? [],
    });
  } catch (err) {
    console.error('getDiary failed:', err);
    return res.status(500).json({ message: 'server error' });
  }
};

exports.listDiaries = async (req, res) => {
  try {
    const db = req.app.locals.db;

    const user = getUserOr401(req, res);
    if (!user) return;
    const userId = user.uid;

    const diaries = await db.collection('diaries')
      .find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .toArray();

    if (diaries.length === 0) {
      return res.status(200).json({ count: 0, diaries: [] });
    }

    const allRecordIds = [];
    for (const d of diaries) {
      const src = Array.isArray(d.sources) ? d.sources : [];
      for (const s of src) {
        if (s.recordId) allRecordIds.push(s.recordId);
      }
    }
    const uniqueIds = [...new Set(allRecordIds.map(id => id.toString()))]
      .map(id => new ObjectId(id));

    const allRecords = uniqueIds.length
      ? await db.collection('records')
          .find({ _id: { $in: uniqueIds }, userId: new ObjectId(userId) })
          .toArray()
      : [];

    const recordMap = new Map(allRecords.map(r => [r._id.toString(), r]));

    const payload = await Promise.all(
      diaries.map(async (d) => {
        const src = Array.isArray(d.sources) ? d.sources : [];
        src.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        const records = [];
        const images = [];

        for (const s of src) {
          const rec = recordMap.get(s.recordId?.toString());
          if (!rec) continue;

          const item = {
            createdAt: rec.createdAt,
            type: rec.type,
            context: rec.context ?? null,
            imageUrl: null,
            audio: null,
          };

          if ((rec.type === 'image' || rec.type === 'text+image') && rec.media?.key) {
            try {
              const imageUrl = await getSignedReadUrl(rec.media.key);
              item.imageUrl = imageUrl;
              images.push({ imageUrl, createdAt: rec.createdAt });
            } catch {
              item.imageUrl = null;
            }
          }

          if (rec.type === 'audio' && rec.media?.key) {
            try {
              const audioUrl = await getSignedReadUrl(rec.media.key);
              item.audio = audioUrl;
            } catch {
              item.audio = null;
            }
          }

          records.push(item);
        }

        return {
          createdAt: d.date ?? null,
          context: d.text,
          recordList: records,
          imageUrlList: images,
          emotion: d.emotion ?? null,
          meta: {
            id: d._id.toString(),
            persona: d.persona,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          },
        };
      })
    );

    return res.status(200).json({
      count: payload.length,
      diaries: payload,
    });
  } catch (err) {
    console.error('listDiaries failed:', err);
    return res.status(500).json({ message: 'server error' });
  }
};

exports.updateDiary = async (req, res) => {
  try {
    const db = req.app.locals.db;

    const user = getUserOr401(req, res);
    if (!user) return;
    const userId = user.uid;

    const { id, text, persona, emotion, images } = req.body || {};
    if (!id) return res.status(400).json({ message: 'diary id is required' });

    const diary = await db.collection('diaries').findOne({
      _id: new ObjectId(id),
      userId: new ObjectId(userId),
    });
    if (!diary) return res.status(404).json({ message: 'diary not found' });

    const set = {};
    if (typeof text === 'string') set.text = text.trim();
    if (typeof persona === 'number') set.persona = persona;
    if (typeof emotion === 'string') set.emotion = emotion;

    if (Array.isArray(images)) {
      const sanitized = images
        .filter(it => it && typeof it.key === 'string')
        .map(it => ({
          key: it.key,
          createdAt: it.createdAt ? new Date(it.createdAt) : new Date(),
        }));
      set.images = sanitized;
    }

    if (Object.keys(set).length === 0) {
      return res.status(400).json({ message: 'no fields to update' });
    }

    set.updatedAt = new Date();

    await db.collection('diaries').updateOne(
      { _id: new ObjectId(id) },
      { $set: set }
    );

    return res.status(200).json({ message: 'diary updated' });
  } catch (err) {
    console.error('updateDiary failed:', err);
    return res.status(500).json({ message: 'server error' });
  }
};