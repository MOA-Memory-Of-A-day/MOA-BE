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

    
    const items = await Promise.all(records.map(async (r) => {
      const context = r.context ?? '';

    
      if ((r.type === 'image' || r.type === 'text+image') && r.media?.key) {
        const url = await getSignedReadUrl(r.media.key);
        if (r.type === 'text+image') {
          return { type: 'text+image', content: context, path: url };
        }
        return { type: 'image', path: url };
      }

      
      return { type: 'text', content: context };
    }));

    
    const hasContent = items.some(it =>
      (it.type === 'text' && it.content && it.content.trim().length > 0) ||
      (it.path && typeof it.path === 'string' && it.path.length > 0)
    );
    if (!hasContent) {
      return res.status(400).json({ message: 'no valid items to send to AI' });
    }

    
    const base = (AI_URL || '').replace(/\/+$/, '');

    
    let aiResp;
    try {
      aiResp = await axios.post(
        `${base}/diary/generate`,
        { items, persona },
        { timeout: 150_000 }
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

    
    const imagePresigned = [];
    const imageKeys = [];
    for (const r of records) {
      if (r.media?.type === 'image' && r.media?.key) {
        const url = await getSignedReadUrl(r.media.key);
        imagePresigned.push(url);
        // imageKeys.push({ key: r.media.key });
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

    const images = [];
    const stored = Array.isArray(diary.images) ? diary.images : [];
    for (const it of stored) {
      if (!it?.key) continue;
      try {
        const url = await getSignedReadUrl(it.key);
        images.push({
          url,
          createdAt: it.createdAt ?? diary.createdAt, // createdAt 없으면 대체
        });
      } catch {
        // presign 실패 시 해당 항목 스킵
      }
    }

    return res.status(200).json({
      diary : {
        id: diary._id.toString(),
        text: diary.text,
        persona: diary.persona,
        emotion: diary.emotion ?? null,
        date: diary.date ?? null,
        createdAt: diary.createdAt,
        updatedAt: diary.updatedAt,
        images,
      }
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

        const images = [];

        for (const s of src) {
          const rec = recordMap.get(s.recordId?.toString());
          if (!rec) continue;

          if ((rec.type === 'image' || rec.type === 'text+image') && rec.media?.key) {
            try {
              const imageUrl = await getSignedReadUrl(rec.media.key);
              images.push(imageUrl);
            } catch {
              // S3 서명 실패 시 무시
            }
          }
        }

        return {
          id: d._id.toString(),
          text: d.text,
          persona: d.persona ?? 0,
          date: d.date ?? null,
          createdAt: d.createdAt,
          images: images,
          emotion: d.emotion
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