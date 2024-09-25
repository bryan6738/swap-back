const express = require("express");
const { db } = require("../config/config");

const router = express.Router();

router.post("/log-exchange", async (req, res) => {
    console.log("Received a POST request to /log-exchange");

    const timestamp = new Date().toISOString();
    const exchange = req.body || {};

    const ipAddress =
        req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    const userAgent = exchange.UserAgent || null;
    const siteLanguage = exchange.SiteLanguage || null;
    const acceptLanguage = exchange.AcceptLanguage || null;
    const deviceTimezone = exchange.DeviceTimezone || null;
    const deviceOperatingSystem = exchange.DeviceOperatingSystem || null;
    const primaryRate = parseFloat(process.env.PRIMARY_RATE) || 0;
    const primaryReferralRewardUSD =
        parseFloat(exchange.InputTokenUSDTValue) >
        parseFloat(exchange.OutputTokenUSDTValue)
            ? parseFloat(exchange.OutputTokenUSDTValue || 0) * primaryRate
            : parseFloat(exchange.InputTokenUSDTValue || 0) *
              0.97 *
              primaryRate;
    const btcUsdRate = exchange.BTC_USDRate || 0;

    const exchangeID = exchange.ExchangeID || null;
    const userID = exchange.UserID || null;

    try {
        const exchangeLogsCollection = db.collection("exchange_logs");
        const usersCollection = db.collection("users");

        // Check if the record exists in exchange_logs
        const existingExchange = await exchangeLogsCollection.findOne({
            exchange_id: exchangeID,
        });

        if (existingExchange) {
            console.log(
                "Record already exists, updating exchange_finished and other fields:",
                exchangeID,
            );

            // Update the existing exchange log with new information
            await exchangeLogsCollection.updateOne(
                { exchange_id: exchangeID },
                {
                    $set: {
                        exchange_finished: exchange.ExchangeFinished || 0,
                        amount_from: exchange.AmountSent || null,
                        amount_to: exchange.AmountReceived || null,
                        currency_from: exchange.TokenSent || null,
                        currency_to: exchange.TokenReceived || null,
                        address_from: exchange.AddressSent || null,
                        address_to: exchange.AddressReceived || null,
                        inputUSD: exchange.InputTokenUSDTValue || null,
                        outputUSD: exchange.OutputTokenUSDTValue || null,
                        timestamp,
                        primary_rate: primaryRate,
                        primary_referral_reward_usd: primaryReferralRewardUSD,
                        btc_usd_rate: btcUsdRate,
                        ip_address: ipAddress,
                        user_agent: userAgent,
                        site_language: siteLanguage,
                        accept_language: acceptLanguage,
                        device_timezone: deviceTimezone,
                        device_operating_system: deviceOperatingSystem,
                        hash_from: exchange.HashSent,
                        hash_to: exchange.HashReceived,
                        status: exchange.Status,
                    },
                },
            );

            console.log("Exchange log updated:", exchangeID);
        } else {
            console.log(
                "Record does not exist, inserting new record:",
                exchangeID,
            );

            const newRecord = {
                user_id: userID,
                exchange_id: exchangeID,
                amount_from: exchange.AmountSent || null,
                amount_to: exchange.AmountReceived || null,
                currency_from: exchange.TokenSent || null,
                currency_to: exchange.TokenReceived || null,
                address_from: exchange.AddressSent || null,
                address_to: exchange.AddressReceived || null,
                inputUSD: exchange.InputTokenUSDTValue || null,
                outputUSD: exchange.OutputTokenUSDTValue || null,
                timestamp,
                primary_rate: primaryRate,
                primary_referral_reward_usd: primaryReferralRewardUSD,
                btc_usd_rate: btcUsdRate,
                exchange_finished: exchange.ExchangeFinished || 0,
                ip_address: ipAddress,
                user_agent: userAgent,
                site_language: siteLanguage,
                accept_language: acceptLanguage,
                device_timezone: deviceTimezone,
                device_operating_system: deviceOperatingSystem,
                hash_from: exchange.HashSent || null,
                hash_to: exchange.HashReceived || null,
                status: exchange.Status || null,
            };

            await exchangeLogsCollection.insertOne(newRecord);
            console.log("Exchange log added:", newRecord);
            console.log("UserName: ", exchange.UserName);
        }

        // Check if the user exists in users collection
        let user = await usersCollection.findOne({ user_id: userID });

        if (!user) {
            console.log("User does not exist, creating new user:", userID);

            // Create a new user if one does not exist
            await usersCollection.insertOne({
                user_id: userID,
                user_name: exchange.UserName || "Unknown",
                referred_by: null, // Assuming user has no referrer if not present
                reward_amount: 0, // Initial reward amount
            });
        } else {
            console.log("User exists, updating user info:", userID);

            // Update the existing user's information if necessary
            await usersCollection.updateOne(
                { user_id: userID },
                { $set: { user_name: exchange.UserName || user.user_name } },
            );
        }

        // If the user has a referrer and the exchange is finished, update the referrer's reward
        if (user && user.referred_by && exchange.ExchangeFinished) {
            const referrerID = user.referred_by;

            // Find the referrer user
            const referrerUser = await usersCollection.findOne({
                user_id: referrerID,
            });

            if (referrerUser) {
                // Update the referrer's reward_amount
                await usersCollection.updateOne(
                    { user_id: referrerID },
                    { $inc: { reward_amount: primaryReferralRewardUSD } },
                );

                console.log(
                    `Referrer ${referrerID}'s reward_amount updated by ${primaryReferralRewardUSD}`,
                );
            } else {
                console.log(`Referrer user with ID ${referrerID} not found`);
            }
        } else if (!user) {
            console.log(`User ${userID} does not have a referrer`);
        }

        res.status(200).send("Success");
    } catch (err) {
        console.error("Database Error:", err.message);
        res.status(500).send("Internal Server Error");
    }
});

router.get("/lang/:userID", async (req, res) => {
    try {
        const userID = parseFloat(req.params.userID);
        
        console.log("=========>", userID)
        const usersCollection = db.collection("users");
        const user = await usersCollection.findOne({ user_id: userID });
        
        if (!user) {
            return res.status(404).send("User not found");
        }
        
        res.status(200).send(user.language);
    } catch (error) {
        console.error("Error fetching user language:", error);
        res.status(500).send("Internal server error");
    }
});

module.exports = router;
