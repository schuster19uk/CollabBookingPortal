/**
 * routes/members.js
 * User management API — Collaborators Booking Portal
 *
 * Mount in server.js:
 * const membersRouter = require('./routes/members');
 * app.use('/api/admin/members', requireAdminSession, membersRouter);
 *
 * npm install bcrypt
 */

'use strict';

const express = require('express');
const bcrypt  = require('bcrypt');
const crypto  = require('crypto');   // built-in Node — no install needed
const router  = express.Router();

const SALT_ROUNDS = 12;

// ── DB shorthand ───────────────────────────────────────────────────────────
const db = req => req.app.locals.db;

// ── Random password generator ──────────────────────────────────────────────
function generatePassword(length = 16) {
    const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I/O (ambiguous)
    const lower   = 'abcdefghjkmnpqrstuvwxyz';     // no l/o (ambiguous)
    const digits  = '23456789';                     // no 0/1 (ambiguous)
    const symbols = '!@#$%^&*-_=+?';
    const all     = upper + lower + digits + symbols;

    const pick = pool => pool[crypto.randomInt(pool.length)];
    const required = [pick(upper), pick(lower), pick(digits), pick(symbols)];

    const rest = Array.from({ length: length - required.length }, () =>
        pick(all)
    );

    const combined = [...required, ...rest];
    for (let i = combined.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [combined[i], combined[j]] = [combined[j], combined[i]];
    }

    return combined.join('');
}

// ─────────────────────────────────────────────────────────────────────────
//  GET /api/admin/members
// ─────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        // FIXED: Removed array destructuring [rows] to match native mariadb driver
        const rows = await db(req).query(`
            SELECT
                pm.member_id,
                pm.display_name,
                pm.username,
                pm.discord_id,
                pm.type_id,
                lt.type_name,
                pm.is_active,
                pm.last_login_at,
                pm.created_at,
                (pm.password_hash IS NOT NULL) AS has_login
            FROM  project_members pm
            LEFT JOIN lk_member_types lt ON lt.type_id = pm.type_id
            ORDER BY pm.is_active DESC, pm.display_name ASC
        `);
        res.json(rows);
    } catch (err) {
        console.error('[members GET]', err);
        res.status(500).json({ error: 'Database error.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────
//  GET /api/admin/members/types
// ─────────────────────────────────────────────────────────────────────────
router.get('/types', async (req, res) => {
    try {
        // FIXED: Removed array destructuring [rows]
        const rows = await db(req).query(
            'SELECT type_id, type_name FROM lk_member_types ORDER BY type_id'
        );
        res.json(rows);
    } catch (err) {
        console.error('[members/types GET]', err);
        res.status(500).json({ error: 'Database error.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────
//  POST /api/admin/members
// ─────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    const { display_name, username, discord_id, type_id, is_active = true } = req.body;

    if (!display_name?.trim()) return res.status(400).json({ error: 'display_name is required.' });
    if (!type_id)              return res.status(400).json({ error: 'type_id is required.' });

    let password_hash  = null;
    let plain_password = null;   

    if (username?.trim()) {
        plain_password = generatePassword();
        password_hash  = await bcrypt.hash(plain_password, SALT_ROUNDS);
    }

    try {
        // FIXED: Removed array destructuring [result]
        const result = await db(req).query(
            `INSERT INTO project_members
                (display_name, username, discord_id, type_id, is_active, password_hash)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                display_name.trim(),
                username?.trim() || null,
                discord_id?.trim() || null,
                type_id,
                is_active ? 1 : 0,
                password_hash,
            ]
        );

        // FIXED: Stringified BigInt insertId safely to prevent JSON crashes
        res.status(201).json({
            member_id:      result.insertId ? result.insertId.toString() : null,
            plain_password, 
        });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Username already exists.' });
        }
        console.error('[members POST]', err);
        res.status(500).json({ error: 'Database error.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────
//  PATCH /api/admin/members/:id
// ─────────────────────────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    const { display_name, username, discord_id, type_id, is_active } = req.body;

    const fields = [];
    const values = [];

    if (display_name !== undefined) { fields.push('display_name = ?'); values.push(display_name.trim()); }
    if (username     !== undefined) { fields.push('username = ?');     values.push(username?.trim() || null); }
    if (discord_id   !== undefined) { fields.push('discord_id = ?');   values.push(discord_id?.trim() || null); }
    if (type_id      !== undefined) { fields.push('type_id = ?');      values.push(type_id); }
    if (is_active    !== undefined) { fields.push('is_active = ?');    values.push(is_active ? 1 : 0); }

    if (!fields.length) return res.status(400).json({ error: 'No fields to update.' });

    values.push(id);
    try {
        // FIXED: Removed array destructuring [result]
        const result = await db(req).query(
            `UPDATE project_members SET ${fields.join(', ')} WHERE member_id = ?`, values
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Member not found.' });
        res.json({ success: true });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Username already exists.' });
        console.error('[members PATCH]', err);
        res.status(500).json({ error: 'Database error.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────
//  POST /api/admin/members/:id/reset-password
// ─────────────────────────────────────────────────────────────────────────
router.post('/:id/reset-password', async (req, res) => {
    const { id } = req.params;

    try {
        // FIXED: Access rows via indexing memberRows[0] instead of nested array destructuring [[member]]
        const memberRows = await db(req).query(
            'SELECT member_id, display_name, username FROM project_members WHERE member_id = ?', [id]
        );
        const member = memberRows[0];

        if (!member) return res.status(404).json({ error: 'Member not found.' });
        if (!member.username) return res.status(400).json({
            error: 'This member has no portal username. Edit their profile to add one first.'
        });

        const plain_password = generatePassword();
        const hash           = await bcrypt.hash(plain_password, SALT_ROUNDS);

        await db(req).query(
            'UPDATE project_members SET password_hash = ? WHERE member_id = ?', [hash, id]
        );

        res.json({ plain_password });
    } catch (err) {
        console.error('[members reset-password]', err);
        res.status(500).json({ error: 'Database error.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────
//  POST /api/admin/members/:id/remove-login
// ─────────────────────────────────────────────────────────────────────────
router.post('/:id/remove-login', async (req, res) => {
    const { id } = req.params;
    try {
        await db(req).query(
            'UPDATE project_members SET password_hash = NULL, username = NULL WHERE member_id = ?', [id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('[members remove-login]', err);
        res.status(500).json({ error: 'Database error.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────
//  PATCH /api/admin/members/:id/toggle-active
// ─────────────────────────────────────────────────────────────────────────
router.patch('/:id/toggle-active', async (req, res) => {
    const { id } = req.params;
    try {
        // FIXED: Removed array destructuring [result]
        const result = await db(req).query(
            'UPDATE project_members SET is_active = NOT is_active WHERE member_id = ?', [id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Member not found.' });
        res.json({ success: true });
    } catch (err) {
        console.error('[members toggle-active]', err);
        res.status(500).json({ error: 'Database error.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────
//  DELETE /api/admin/members/:id
// ─────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // FIXED: Removed array destructuring [result]
        const result = await db(req).query(
            'DELETE FROM project_members WHERE member_id = ?', [id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Member not found.' });
        res.json({ success: true });
    } catch (err) {
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(409).json({
                error: 'Cannot delete: member has linked records. Deactivate them instead.'
            });
        }
        console.error('[members DELETE]', err);
        res.status(500).json({ error: 'Database error.' });
    }
});

module.exports = router;