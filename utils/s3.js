const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3 = new S3Client({region: process.env.AWS_REGION});

async function uploadBufferToS3({ buffer, key, contentType }) {
  const cmd = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });
  await s3.send(cmd);
  return key;
}

async function deleteFromS3(key) {
    const cmd = new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key });
    await s3.send(cmd);
}

async function getSignedReadUrl(key, expiresInSec = 60 * 60) {
  const cmd = new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: expiresInSec });
}

module.exports = { s3, uploadBufferToS3, getSignedReadUrl, deleteFromS3 };