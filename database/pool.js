const mariadb = require('mariadb');
require('dotenv').config();

const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    timezone: 'Z',
    connectionLimit: 10,
    dateStrings: true, // This stops the driver from turning '13:00' into a local Date object
    connectTimeout: 10000, // 10 seconds
    acquireTimeout: 10000
});

module.exports = pool;