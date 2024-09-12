const { db } = require('../config/config');

const createTables = () => {
    db.serialize(() => {
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                referred_by INTEGER
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS exchange_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                exchange_id TEXT,
                amount_from TEXT,
                amount_to TEXT,
                currency_from TEXT,
                currency_to TEXT,
                address_from TEXT,
                address_to TEXT,
                inputUSD TEXT,
                outputUSD TEXT,
                timestamp TEXT,
                primary_rate REAL,
                primary_referral_reward_usd REAL,
                btc_usd_rate REAL,
                exchange_finished INTEGER,
                ip_address TEXT,
                user_agent TEXT,
                site_language TEXT,
                accept_language TEXT,
                device_timezone TEXT,
                device_operating_system TEXT
            )
        `);
    });
};

module.exports = { createTables, db };
