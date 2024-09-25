const { db } = require("../config/config");

const createCollections = async () => {
    const users = db.collection('users');
    const exchangeLogs = db.collection('exchange_logs');

    console.log('Collections ready');
};

module.exports = { createCollections, db };