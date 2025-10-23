const { ObjectId } = require('mongodb');
const { uploadBufferToS3, getSignedReadUrl, deleteFromS3 } = require('../utils/s3');
const { transcribeAudioBuffer } = require('../utils/stt');
const { getUserOr401 } = require('../utils/auth');
const mime = require('mime-types');

exports.recordCreate = async (req, res) => {
  try {
    const db = req.app.locals.db;

    const user = getUserOr401(req, res);
    if (!user) return;
    const userId = user.uid;

    let context = (req.body?.context ?? '').trim();
    const hasText = context.length > 0;
    const file = req.file || null;

    let media = null;
    let type = 'text';

    if (file) {
      const isImage = file.mimetype?.startsWith('image/');
      const isAudio = file.mimetype?.startsWith('audio/');

      if (isImage) {
        const allowedImg = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
        if (!allowedImg.includes(file.mimetype)) {
          return res.status(400).json({ message: 'unsupported image type' });
        }

        const ext = mime.extension(file.mimetype) || 'bin';
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const uuid = Math.random().toString(36).slice(2) + Date.now().toString(36);
        const key = `records/${userId}/${y}/${m}/${uuid}.${ext}`;

        await uploadBufferToS3({
          buffer: file.buffer,
          key,
          contentType: file.mimetype,
        });

        media = {
          type: 'image',
          bucket: process.env.AWS_S3_BUCKET,
          key,
          mime: file.mimetype,
          size: file.size,
        };

        type = hasText ? 'text+image' : 'image';
      } else if (isAudio) {
        const allowedAud = [
          'audio/mpeg', 'audio/mp3', 'audio/mp4',
          'audio/wav', 'audio/x-wav',
          'audio/aac', 'audio/x-m4a', 'audio/m4a',
          'audio/ogg', 'audio/webm',
        ];
        if (!allowedAud.includes(file.mimetype)) {
          return res.status(400).json({ message: 'unsupported audio type' });
        }

        const filename = `audio.${mime.extension(file.mimetype) || 'bin'}`;
        const transcript = await transcribeAudioBuffer(file.buffer, filename, 'ko');

        context = [context, transcript].filter(Boolean).join('\n');
        if (!context) {
          return res.status(502).json({ message: 'STT failed: empty transcript' });
        }

        media = null;
        type = 'text';
      } else {
        return res.status(400).json({ message: 'unsupported file type' });
      }
    } else {
      if (!hasText) {
        return res.status(400).json({ message: 'text or file required' });
      }
      type = 'text';
    }

    const now = new Date();
    const doc = {
      userId: new ObjectId(userId),
      type,
      context: context || null,
      media,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection('records').insertOne(doc);

    let imageUrl = null;
    if (media?.key) {
      imageUrl = await getSignedReadUrl(media.key);
    }

    return res.status(201).json({
      message: 'record created',
      record: {
        id: result.insertedId.toString(),
        type: doc.type,
        context: doc.context,
        imageUrl,
        createdAt: doc.createdAt,
      },
    });
  } catch (err) {
    console.error('createRecord failed:', err);
    return res.status(500).json({ message: 'server error' });
  }
};

exports.recordList = async (req, res) => {
  try {
    const db = req.app.locals.db;

    const user = getUserOr401(req, res);
    if (!user) return;
    const userId = user.uid;

    const records = await db.collection('records')
      .find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .toArray();

    const mapped = await Promise.all(records.map(async (r) => {
      let imageUrl = null;
      if (r.media?.key) {
        imageUrl = await getSignedReadUrl(r.media.key);
      }
      return {
        id: r._id.toString(),
        type: r.type,
        context: r.context,
        imageUrl,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    }));

    return res.status(200).json({
      message: 'record 목록 불러오기 성공',
      count: mapped.length,
      records: mapped,
    });
  } catch (err) {
    console.error('record list failed:', err);
    return res.status(500).json({ message: 'server error' });
  }
};

exports.recordUpdate = async (req, res) => {
  try {
    const db = req.app.locals.db;

    const user = getUserOr401(req, res);
    if (!user) return;
    const ownerId = user.uid;

    const { _id } = req.body;
    if (!_id) return res.status(400).json({ message: 'record _id is required' });

    const record = await db.collection('records').findOne({ _id: new ObjectId(_id) });
    if (!record) return res.status(404).json({ message: 'record not found' });
    if (record.userId.toString() !== ownerId) {
      return res.status(403).json({ message: '수정 권한이 없습니다.' });
    }

    const contextIn = req.body.context;
    const finalContext = (contextIn !== undefined)
      ? (String(contextIn).trim() || null)
      : record.context;

    const removeImage = req.body.removeImage === 'true' || req.body.removeImage === true;

    let newMedia = null;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

    if (req.file) {
      if (!allowed.includes(req.file.mimetype)) {
        return res.status(400).json({ message: 'unsupported file type' });
      }
      const ext = mime.extension(req.file.mimetype) || 'bin';
      const y = new Date().getFullYear();
      const m = String(new Date().getMonth() + 1).padStart(2, '0');
      const uuid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      const key = `records/${ownerId}/${y}/${m}/${uuid}.${ext}`;

      await uploadBufferToS3({
        buffer: req.file.buffer,
        key,
        contentType: req.file.mimetype,
      });

      newMedia = {
        type: 'image',
        bucket: process.env.AWS_S3_BUCKET,
        key,
        mime: req.file.mimetype,
        size: req.file.size,
      };

      if (record.media?.key) {
        try {
          await deleteFromS3(record.media.key);
        } catch (e) {
          console.error('old image delete failed:', e);
        }
      }
    } else if (removeImage && record.media?.key) {
      try {
        await deleteFromS3(record.media.key);
      } catch (e) {
        console.error('image delete failed:', e);
      }
      newMedia = null;
    } else {
      newMedia = record.media ?? null;
    }

    const willHaveImage = !!(newMedia && newMedia.key);
    const hasText = !!finalContext;
    const newType = willHaveImage && hasText ? 'text+image' : (willHaveImage ? 'image' : 'text');

    const updateFields = {
      context: finalContext,
      media: willHaveImage ? newMedia : null,
      type: newType,
      updatedAt: new Date(),
    };

    const noChange =
      (finalContext === record.context) &&
      JSON.stringify(updateFields.media) === JSON.stringify(record.media) &&
      updateFields.type === record.type;

    if (noChange) {
      return res.status(400).json({ message: '변경된 내용이 없습니다.' });
    }

    await db.collection('records').updateOne(
      { _id: new ObjectId(_id) },
      { $set: updateFields }
    );

    return res.status(200).json({ message: 'update 성공' });
  } catch (err) {
    console.error('record update failed:', err);
    return res.status(500).json({ message: 'server error' });
  }
};

exports.recordDelete = async (req, res) => {
  try {
    const db = req.app.locals.db;

    const user = getUserOr401(req, res);
    if (!user) return;
    const ownerId = user.uid;

    const { _id } = req.body;
    if (!_id) return res.status(400).json({ message: 'record _id is required' });

    const record = await db.collection('records').findOne({ _id: new ObjectId(_id) });
    if (!record) return res.status(404).json({ message: 'record not found' });
    if (record.userId.toString() !== ownerId) {
      return res.status(403).json({ message: '삭제 권한이 없습니다.' });
    }

    if (record.media?.key) {
      try {
        await deleteFromS3(record.media.key);
      } catch (e) {
        console.error('s3 image delete failed:', e);
      }
    }

    await db.collection('records').deleteOne({ _id: new ObjectId(_id) });
    return res.status(200).json({ message: 'delete 성공' });
  } catch (err) {
    console.error('record delete failed:', err);
    return res.status(500).json({ message: 'server error' });
  }
};