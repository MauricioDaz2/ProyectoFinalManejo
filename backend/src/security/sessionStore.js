const crypto = require('crypto');

function createSessionStore({ lifetime = 8 * 60 * 60 * 1000, now = Date.now, capacity = 10000 } = {}) {
    const sessions = new Map();
    const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');
    function read(token) {
        if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
        const key = hash(token);
        const session = sessions.get(key);
        if (!session || session.expires <= now()) { sessions.delete(key); return null; }
        return session;
    }
    return {
        lifetime,
        create(userId) {
            for (const [key, value] of sessions) if (value.expires <= now()) sessions.delete(key);
            if (sessions.size >= capacity) throw new Error('Capacidad de sesiones alcanzada');
            const token = crypto.randomBytes(32).toString('hex');
            sessions.set(hash(token), { userId, expires: now() + lifetime });
            return token;
        },
        read,
        revokeUser(userId) { for (const [key, session] of sessions) if (session.userId === userId) sessions.delete(key); },
        revoke(token) { if (typeof token === 'string') sessions.delete(hash(token)); }
    };
}
module.exports = { createSessionStore, store: createSessionStore() };
