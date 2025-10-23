const { ObjectId } = require('mongodb');
const { getUserOr401 } = require('../utils/auth');

exports.todoCreate = async (req, res) => {
  try {
    const db = req.app.locals.db;

    const user = getUserOr401(req, res);
    if (!user) return;
    const userId = user.uid;

    const { context, date } = req.body;
    if (!context) return res.status(400).json({ message: '내용을 입력해주세요' });

    const now = new Date();
    const doc = {
      userId: new ObjectId(userId),
      context,
      date: date ?? null,
      done: false,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('todos').insertOne(doc);
    return res.status(201).json({ message: 'created' });
  } catch (err) {
    console.error('todo create failed:', err);
    return res.status(500).json({ message: 'server error' });
  }
};

exports.todoList = async (req, res) => {
  try {
    const db = req.app.locals.db;

    const user = getUserOr401(req, res);
    if (!user) return;
    const userId = user.uid;

    const todos = await db.collection('todos')
      .find({ userId: new ObjectId(userId) })
      .sort({ date: 1, createdAt: -1 })
      .toArray();

    return res.status(200).json({
      message: 'todo 목록 불러오기 성공',
      count: todos.length,
      todos: todos.map(t => ({
        id: t._id.toString(),
        context: t.context,
        date: t.date ?? null,
        done: !!t.done,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    });
  } catch (err) {
    console.error('todo list failed:', err);
    return res.status(500).json({ message: 'server error' });
  }
};

exports.todoUpdate = async (req, res) => {
  try {
    const db = req.app.locals.db;

    const user = getUserOr401(req, res);
    if (!user) return;
    const ownerId = user.uid;

    const { _id, context, date, done } = req.body;
    if (!_id) return res.status(400).json({ message: 'todo _id is required' });

    const todo = await db.collection('todos').findOne({ _id: new ObjectId(_id) });
    if (!todo) return res.status(404).json({ message: 'todo not found' });
    if (todo.userId.toString() !== ownerId) {
      return res.status(403).json({ message: '수정 권한이 없습니다.' });
    }

    const updateFields = {};
    if (context !== undefined) updateFields.context = context;
    if (date !== undefined) updateFields.date = date;
    if (done !== undefined) updateFields.done = !!done;
    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ message: '수정할 필드를 적어도 하나는 입력해주세요.' });
    }

    updateFields.updatedAt = new Date();

    await db.collection('todos').updateOne(
      { _id: new ObjectId(_id) },
      { $set: updateFields }
    );
    return res.status(200).json({ message: 'update 성공' });
  } catch (err) {
    console.error('todo update failed:', err);
    return res.status(500).json({ message: 'server error' });
  }
};

exports.todoDelete = async (req, res) => {
  try {
    const db = req.app.locals.db;

    const user = getUserOr401(req, res);
    if (!user) return;
    const ownerId = user.uid;

    const { _id } = req.body;
    if (!_id) return res.status(400).json({ message: 'todo _id is required' });

    const todo = await db.collection('todos').findOne({ _id: new ObjectId(_id) });
    if (!todo) return res.status(404).json({ message: 'todo not found' });
    if (todo.userId.toString() !== ownerId) {
      return res.status(403).json({ message: '수정 권한이 없습니다.' });
    }

    await db.collection('todos').deleteOne({ _id: new ObjectId(_id) });
    return res.status(200).json({ message: 'delete 성공' });
  } catch (err) {
    console.error('todo delete failed:', err);
    return res.status(500).json({ message: 'server error' });
  }
};