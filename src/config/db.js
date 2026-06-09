const mariadb = require("mariadb");
require("dotenv").config();

const rawPool = mariadb.createPool({
  host: process.env.DB_HOST.trim(),
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME.trim(),
  user: process.env.DB_USER.trim(),
  password: process.env.DB_PASSWORD,

  connectionLimit: 5,
  connectTimeout: 60000,
  socketTimeout: 60000,
  acquireTimeout: 60000,

  ssl: false
});

const pool = {
  async query(sql, params = []) {
    const result = await rawPool.query(sql, params);
    return [result];
  },

  async getConnection() {
    return rawPool.getConnection();
  },

  rawPool
};

module.exports = pool;