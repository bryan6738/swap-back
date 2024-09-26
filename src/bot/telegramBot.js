const TelegramBot = require("node-telegram-bot-api");
const i18next = require("i18next");
const Backend = require("i18next-fs-backend");
const { db } = require("../config/config");
const axios = require('axios');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

i18next.use(Backend).init({
    fallbackLng: "en",
    preload: ["en", "ru", "ch"],
    backend: {
        loadPath: "./src/locales/{{lng}}/translation.json",
    },
    debug: false,
});

const getUserLanguage = async (userId) => {
    const user = await db.collection("users").findOne({ user_id: userId });
    return user && user.language ? user.language : "en";
};

const sendTranslatedMessage = async (chatId, key, options = {}) => {
    const language = await getUserLanguage(chatId);
    await i18next.changeLanguage(language);
    const message = i18next.t(key, options);
    bot.sendMessage(chatId, message, { parse_mode: "HTML" });
};

const updateUserLanguage = async (userId, language) => {
    await db
        .collection("users")
        .updateOne({ user_id: userId }, { $set: { language: language } });
};

const sendInfoMessage = async (chatId) => {
    try {
        const totalRegisters = await db.collection("users").countDocuments();
        const uniqueUsers = await db
            .collection("exchange_logs")
            .aggregate([
                {
                    $match: {
                        $or: [
                            { exchange_finished: 1 },
                            { exchange_finished: true },
                        ],
                    },
                },
                {
                    $group: {
                        _id: "$user_id",
                    },
                },
                {
                    $count: "uniqueUserCount",
                },
            ])
            .toArray();
        const totalUsers = uniqueUsers[0].uniqueUserCount || 0;

        const totalExchanges = await db
            .collection("exchange_logs")
            .countDocuments({
                $or: [{ exchange_finished: 1 }, { exchange_finished: true }],
            });

        const totalVolumeDocs = await db
            .collection("exchange_logs")
            .aggregate([
                {
                    $match: {
                        $or: [
                            { exchange_finished: 1 },
                            { exchange_finished: true },
                        ],
                    },
                },
                {
                    $group: {
                        _id: null,
                        totalOutputUSDValue: {
                            $sum: {
                                $toDouble: {
                                    $ifNull: ["$outputUSD", 0],
                                },
                            },
                        },
                    },
                },
            ])
            .toArray();

        const totalVolume =
            totalVolumeDocs.length > 0
                ? totalVolumeDocs[0].totalOutputUSDValue
                : 0;

        const totalRevShare = totalVolume * 0.005;
        sendTranslatedMessage(chatId, "mainInfo", {
            totalUsers,
            totalExchanges,
            totalVolume: totalVolume.toFixed(2),
            totalRevShare: totalRevShare.toFixed(2),
        });
    } catch (err) {
        console.error("Error fetching statistics:", err.message);
        bot.sendMessage(
            chatId,
            "An error occurred while fetching the statistics.",
        );
    }
};

const requestTonCoinAddress = (chatId, userId) => {
    sendTranslatedMessage(
        chatId,
        "Please provide your TON coin address to receive your rewards (e.g., EQA-B8bcD...)",
    );
    bot.once("message", async (msg) => {
        if (msg.chat.id === chatId) {
            const tonCoinAddress = msg.text.trim();
            try {
                await db
                    .collection("users")
                    .updateOne(
                        { user_id: userId },
                        { $set: { ton_coin_address: tonCoinAddress } },
                    );
                sendTranslatedMessage(
                    chatId,
                    "Your TON coin address has been updated successfully! ✅",
                );
            } catch (err) {
                sendTranslatedMessage(
                    chatId,
                    "There was an error saving your address. Please try again.",
                );
            }
        }
    });
};

bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const referredBy = match[1] ? parseInt(match[1]) : null;
    const userId = msg.from.id;
    const username = msg.from.username || "unknown";
    try {
        const user = await db.collection("users").findOne({ user_id: userId });
        if (user) {
            if (!user.ton_coin_address) {
                requestTonCoinAddress(chatId, userId, username, referredBy);
                // } else if (user.referred_by === null && referredBy !== null) {
                //     await db
                //         .collection("users")
                //         .updateOne(
                //             { user_id: userId },
                //             { $set: { referred_by: referredBy } },
                //         );
                //     console.log(
                //         `User ${username}'s referral updated to ${referredBy}`,
                //     );
                //     sendInfoMessage(chatId);
            } else {
                sendInfoMessage(chatId);
            }
        } else {
            sendInfoMessage(chatId);
            await db.collection("users").insertOne({
                user_id: userId,
                username,
                referred_by: userId == referredBy ? null : referredBy,
                reward_amount: 0,
                language: "en",
            });
            console.log("New user added:", username);
            setTimeout(() => {
                requestTonCoinAddress(chatId, userId, username);
            }, 1000);
        }
    } catch (err) {
        sendTranslatedMessage(chatId, "An error occurred. Please try again.");
    }
});

bot.onText(/\/run/, async (msg) => {
    const chatId = msg.chat.id;
    const webAppUrl = "https://t.me/TeleSwapAppBot?startapp";
    const language = await getUserLanguage(chatId);
    await i18next.changeLanguage(language);
    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: i18next.t("Open TeleSwap Mini App"), url: webAppUrl }],
                [
                    {
                        text: i18next.t("Get Referral Link"),
                        callback_data: "get_referral_link",
                    },
                    {
                        text: i18next.t("Update Address"),
                        callback_data: "update_address",
                    },
                ],
            ],
        },
    };

    bot.sendMessage(
        chatId,
        i18next.t("Click one of the options below:"),
        options,
    );
});

bot.onText(/\/referral/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
        const referredUsers = await db
            .collection("users")
            .find({ referred_by: { $ne: null } })
            .toArray();

        const exchangeLogs = await db
            .collection("exchange_logs")
            .find({
                user_id: { $in: referredUsers.map((user) => user.user_id) },
                $or: [{ exchange_finished: 1 }, { exchange_finished: true }],
            })
            .toArray();

        let TotalVolume = 0;
        let TotalRewards = 0;
        let TotalReferrals = referredUsers.length;
        let MyVolume = 0;
        let MyRewards = 0;
        let MyReferrals = 0;

        const exchangeLogsByUser = exchangeLogs.reduce((acc, log) => {
            if (!acc[log.user_id]) {
                acc[log.user_id] = [];
            }
            acc[log.user_id].push(log);
            return acc;
        }, {});

        for (const user of referredUsers) {
            const userExchangeLogs = exchangeLogsByUser[user.user_id] || [];

            TotalVolume += userExchangeLogs.reduce(
                (total, log) => total + parseFloat(log.outputUSD || 0),
                0,
            );
            TotalRewards += userExchangeLogs.reduce(
                (total, log) =>
                    total + parseFloat(log.primary_referral_reward_usd || 0),
                0,
            );

            if (user.referred_by === userId) {
                MyReferrals += 1;
                MyVolume += userExchangeLogs.reduce(
                    (total, log) => total + parseFloat(log.outputUSD || 0),
                    0,
                );
                MyRewards += userExchangeLogs.reduce(
                    (total, log) =>
                        total +
                        parseFloat(log.primary_referral_reward_usd || 0),
                    0,
                );
            }
        }

        const referralLink = `https://t.me/TeleSwapAppBot?start=${userId}`;
        sendTranslatedMessage(chatId, "referralInfo", {
            MyReferrals,
            MyVolume: MyVolume.toFixed(2),
            MyRewards: MyRewards.toFixed(2),
            TotalReferrals,
            TotalVolume: TotalVolume.toFixed(2),
            TotalRewards: TotalRewards.toFixed(2),
            referralLink,
        });
    } catch (err) {
        console.error("Error handling /referral command:", err.message);
        sendTranslatedMessage(chatId, "An error occurred. Please try again.");
    }
});

bot.onText(/\/update_address/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    requestTonCoinAddress(chatId, userId);
});

bot.onText(/\/update_language/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const language = await getUserLanguage(chatId);
    await i18next.changeLanguage(language);
    const availableLanguages = ["en", "ru", "ch"];

    const languageOptions = availableLanguages.map((lang) => ({
        text: lang.toUpperCase(),
        callback_data: `update_language_${lang}`,
    }));

    const options = {
        reply_markup: {
            inline_keyboard: [languageOptions],
        },
    };

    bot.sendMessage(
        chatId,
        i18next.t("Please select your preferred language:"),
        options,
    );
});

bot.onText(/\/support/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username || "";
    sendTranslatedMessage(chatId, "welcomeMessage", { username });
    bot.once("message", async (msg) => {
        if (msg.chat.id === chatId) {
            const exchange_id = msg.text.trim();
            try {
                const exchange = await db
                    .collection("exchange_logs")
                    .findOne({ exchange_id: exchange_id });
                if (exchange) {
                    const res = await axios.get(`https://api.simpleswap.io/get_exchange?api_key=${process.env.API_KEY}&id=${exchange_id}`);
                    const fromCurrency = exchange.currency_from
                        ? exchange.currency_from.toUpperCase()
                        : "Unknown";
                    const toCurrency = exchange.currency_to
                        ? exchange.currency_to.toUpperCase()
                        : "Unknown";

                    switch (res.data.status || exchange.status) {
                        case "waiting":
                            sendTranslatedMessage(chatId, "waitingMessage", {
                                fromCurrency,
                            });
                            break;
                        case "confirming":
                            const hash_from = res.data.currencies[res.data.currency_from].tx_explorer.replace("{}", res.data.tx_from);
                            sendTranslatedMessage(chatId, "confirmingMessage", {
                                fromCurrency,
                                hash_from: exchange.hash_from || hash_from,
                            });
                            break;
                        case "exchanging":
                            sendTranslatedMessage(chatId, "exchangingMessage", {
                                fromCurrency,
                                toCurrency,
                            });
                            break;
                        case "sending":
                            sendTranslatedMessage(chatId, "sendingMessage", {
                                fromCurrency,
                                toCurrency,
                            });
                            break;
                        case "finished":
                        case "confirmed":
                            const hash_to = res.data.currencies[res.data.currency_to].tx_explorer.replace("{}", res.data.tx_to);
                            sendTranslatedMessage(chatId, "finishedMessage", {
                                fromCurrency,
                                toCurrency,
                                hash_to: exchange.hash_to || hash_to,
                            });
                            break;
                        default:
                            sendTranslatedMessage(chatId, "unableSupport");
                            break;
                    }
                } else {
                    sendTranslatedMessage(
                        chatId,
                        "This Transaction ID does not exist. Please input the correct transaction ID.",
                    );
                }
            } catch (err) {
                console.error("Error Input Transaction ID:", err.message);
                sendTranslatedMessage(
                    chatId,
                    "There was an error finding your transaction. Please try again.",
                );
            }
        }
    });
});

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    sendTranslatedMessage(chatId, "helpMessage");
});

bot.on("callback_query", async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const callbackData = callbackQuery.data;
    const userId = callbackQuery.from.id;
    const username = callbackQuery.from.username || "unknown";

    try {
        if (callbackData === "get_referral_link") {
            const referralLink = `https://t.me/TeleSwapAppBot?start=${userId}`;
            sendTranslatedMessage(chatId, "referralLink", {referralLink});
        } else if (callbackData === "update_address") {
            sendTranslatedMessage(
                chatId,
                "Please provide your new TON coin address:",
            );

            bot.once("message", async (msg) => {
                if (msg.chat.id === chatId) {
                    const tonCoinAddress = msg.text.trim();

                    try {
                        await db
                            .collection("users")
                            .updateOne(
                                { user_id: userId },
                                { $set: { ton_coin_address: tonCoinAddress } },
                            );

                        sendTranslatedMessage(
                            chatId,
                            "Your TON coin address has been updated successfully! ✅",
                        );
                        console.log(
                            `User ${username}'s TON coin address updated to ${tonCoinAddress}`,
                        );
                    } catch (err) {
                        console.error(
                            "Error updating TON coin address:",
                            err.message,
                        );
                        sendTranslatedMessage(
                            chatId,
                            "There was an error saving your address. Please try again.",
                        );
                    }
                }
            });
        } else if (callbackData.startsWith("update_language_")) {
            const selectedLanguage = callbackData.split("_")[2];
            await updateUserLanguage(userId, selectedLanguage);

            await sendTranslatedMessage(
                chatId,
                "Your language has been updated successfully!",
            );
            await sendInfoMessage(chatId);
        }
    } catch (err) {
        console.error("Error handling callback query:", err.message);
        sendTranslatedMessage(chatId, "An error occurred. Please try again.");
    }
});
