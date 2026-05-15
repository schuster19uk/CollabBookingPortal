const express = require('express');
const path = require('path');
const pool = require('./database/pool'); // Imports your native mariadb pool
require('dotenv').config();

const app = express();
app.use(express.json());

// --- AUTH MIDDLEWARE ---
// Protects management routes using credentials from .env
const adminAuth = (req, res, next) => {
    const auth = { user: process.env.ADMIN_USERNAME, pass: process.env.ADMIN_PASSWORD };
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [user, pass] = Buffer.from(b64auth, 'base64').toString().split(':');
    
    if (user === auth.user && pass === auth.pass) return next();
    
    res.set('WWW-Authenticate', 'Basic realm="401"');
    res.status(401).send('Authentication required.');
};

// --- VIP PUBLIC API ---

// Fetch available slots
// app.get('/api/available-slots', async (req, res) => {
//     try {
//         // With 'mariadb' package, you query the pool directly
//         const rows = await pool.query(
//             "SELECT slot_id, start_time FROM booking_slots WHERE is_available = TRUE AND start_time >= NOW()"
//         );
//         // Mapping 'slot_id' to 'id' for FullCalendar compatibility
//         res.json(rows.map(r => ({ id: r.slot_id, title: 'Available', start: r.start_time })));
//     } catch (err) {
//         console.error(err);
//         res.status(500).send("Database error");
//     }
// });

app.get('/api/available-slots', async (req, res) => {
    try {
        const rows = await pool.query(
            "SELECT slot_id, start_time FROM booking_slots WHERE is_available = TRUE AND is_special_slot = TRUE AND start_time >= NOW()"
        );
        
        const formatted = rows.map(r => ({
            id: r.slot_id,
            title: 'Available',
            // MUST MATCH: replace space with T and add Z
            start: r.start_time.replace(" ", "T") + "Z" 
        }));
        
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});

// Book a slot
app.post('/api/book', async (req, res) => {
    const { slotId, userName } = req.body;
    try {
        const result = await pool.query(
            `UPDATE booking_slots 
             SET booked_by_id = 'WEB_VIP', booked_by_name = ?, is_available = FALSE 
             WHERE slot_id = ? AND is_available = TRUE AND is_special_slot = TRUE`, 
            [userName, slotId]
        );
        
        // MariaDB returns 'affectedRows' on the result object
        result.affectedRows > 0 ? res.sendStatus(200) : res.status(400).send("Slot already taken");
    } catch (err) {
        console.error(err);
        res.status(500).send("Database error");
    }
});

// --- MANAGEMENT PRIVATE API ---

// Get all bookings
app.get('/api/admin/bookings', adminAuth, async (req, res) => {
    try {
        const rows = await pool.query("SELECT * FROM booking_slots ORDER BY start_time ASC");
        
        const formattedData = rows.map(row => {
            // Determine the status for the title
            let title = 'Available';
            if (row.is_no_show) {
                title = `🚩 ${row.booked_by_name || 'No Show'}`;
            } else if (!row.is_available) {
                title = row.booked_by_name || 'Booked';
            }

            return {
                id: row.slot_id,
                title: title,
                // Ensure the date is ISO-8601 with Zulu (UTC) flag
                start: row.start_time.replace(" ", "T") + "Z",
                // Pass these as extra flags so the frontend can still use them for logic
                is_available: row.is_available,
                is_no_show: row.is_no_show
            };
        });

        res.json(formattedData);
    } catch (err) {
        console.error(err);
        res.status(500).send("Database error");
    }
});
// NEW: Toggle No Show status from the dashboard
app.post('/api/admin/noshow/:id', adminAuth, async (req, res) => {
    try {
        await pool.query(
            "UPDATE booking_slots SET is_no_show = TRUE WHERE slot_id = ?",
            [req.params.id]
        );
        res.sendStatus(200);
    } catch (err) {
        console.error(err);
        res.status(500).send("Failed to update status");
    }
});

// --- SERVE PAGES ---

// Public VIP Page
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views/calendar.html')));

// Protected Management Page
app.get('/manage', adminAuth, (req, res) => res.sendFile(path.join(__dirname, 'views/management.html')));

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Portal running on http://localhost:${PORT}`));