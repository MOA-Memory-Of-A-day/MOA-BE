require('dotenv').config();
const { MongoClient } = require('mongodb');
const url = process.env.DB_URL;

const options = {
    ssl: true,
    tlsAllowInvalidCertificates: false, // 이걸로 TLS 오류 우회 가능
  };
  

let connectDB = new MongoClient(url).connect();

module.exports = connectDB;