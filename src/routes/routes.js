const express = require('express');
const { db } = require('../config/config');

const router = express.Router();

router.post('/log-exchange', (req, res) => {
    console.log('Received a POST request to /log-exchange');

    const timestamp = new Date().toISOString();
    const exchange = req.body || {};

    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = exchange.UserAgent || null;
    const siteLanguage = exchange.SiteLanguage || null;
    const acceptLanguage = exchange.AcceptLanguage || null;
    const deviceTimezone = exchange.DeviceTimezone || null;
    const deviceOperatingSystem = exchange.DeviceOperatingSystem || null;
    const primaryRate = 0.0025;
    const primaryReferralRewardUSD = (exchange.OutputTokenUSDTValue || 0) * primaryRate;
    const btcUsdRate = exchange.BTC_USDRate || 0;

    const exchangeID = exchange.ExchangeID || null;

    const checkQuery = 'SELECT * FROM exchange_logs WHERE exchange_id = ?';
    db.get(checkQuery, [exchangeID], (err, row) => {
        if (err) {
            console.error('Database Error:', err.message);
            return res.status(500).send('Internal Server Error');
        }

        if (row) {
            console.log('Record already exists:', exchangeID);
            return res.status(200).send('Record already exists');
        }

        const insertQuery = `
            INSERT INTO exchange_logs (
                user_id, exchange_id, amount_from, amount_to, currency_from, currency_to, 
                address_from, address_to, inputUSD, outputUSD, timestamp, primary_rate, 
                primary_referral_reward_usd, btc_usd_rate, exchange_finished, ip_address, 
                user_agent, site_language, accept_language, device_timezone, device_operating_system
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            exchange.UserID || null,
            exchange.ExchangeID || null,
            exchange.AmountFrom || null,
            exchange.AmountTo || null,
            exchange.CurrencyFrom || null,
            exchange.CurrencyTo || null,
            exchange.AddressFrom || null,
            exchange.AddressTo || null,
            exchange.InputTokenUSDTValue || null,
            exchange.OutputTokenUSDTValue || null,
            timestamp,
            primaryRate,
            primaryReferralRewardUSD,
            btcUsdRate,
            0,
            ipAddress,
            userAgent,
            siteLanguage,
            acceptLanguage,
            deviceTimezone,
            deviceOperatingSystem
        ];

        db.run(insertQuery, params, function (err) {
            if (err) {
                console.error('Database Error:', err.message);
                return res.status(500).send('Internal Server Error');
            }

            console.log('Exchange log added:', this.lastID);
            res.status(200).send('Success');
        });
    });
});

module.exports = router;
