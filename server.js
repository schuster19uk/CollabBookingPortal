const express = require('express');
const path = require('path');
const pool = require('./database/pool'); // Imports your native mariadb pool
const session = require('express-session'); // Added express-session
require('dotenv').config();

const app = express();
app.use(express.json());

// --- SESSION CONFIGURATION ---
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secure_string_12345',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 15 * 60 * 1000, // Session auto-expires after 15 minutes of inactivity
        secure: false,          // Set to true if your server uses HTTPS/SSL in production
        httpOnly: true          // Helps protect against Cross-Site Scripting (XSS) attacks
    }
}));

// --- AUTH MIDDLEWARE ---

// Protects standard management routes
const adminAuth = (req, res, next) => {
    if (req.session && req.session.isAdmin) {
        return next();
    }
    res.status(401).json({ error: 'Authentication required. Session expired.' });
};

// NEW: Protects multi-timezone management routes
const multiAdminAuth = (req, res, next) => {
    if (req.session && req.session.isMultiAdmin) {
        return next();
    }
    res.status(401).json({ error: 'Authentication required. Session expired.' });
};


// --- AUTHENTICATION API ENDPOINTS ---

// Standard Login endpoint
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        req.session.isAdmin = true; // Store authenticated status inside the session
        return res.json({ success: true, message: 'Logged in successfully' });
    }
    
    res.status(401).json({ error: 'Invalid credentials' });
});

// NEW: Multi-timezone Login endpoint
app.post('/api/multi-admin/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === process.env.MULTI_ADMIN_USERNAME && password === process.env.MULTI_ADMIN_PASSWORD) {
        req.session.isMultiAdmin = true; // Store multi-admin authenticated status inside the session
        return res.json({ success: true, message: 'Logged in successfully' });
    }
    
    res.status(401).json({ error: 'Invalid credentials' });
});

// Explicit Logout endpoint (Clears both session flags)
app.post('/api/admin/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Could not log out');
        }
        res.clearCookie('connect.sid'); // Clears the session identifier cookie from browser
        res.sendStatus(200);
    });
});

// --- VIP PUBLIC API ---

// Fetch available slots
app.get('/api/available-slots', async (req, res) => {
    try {
        const rows = await pool.query(
            "SELECT slot_id, start_time , slot_category FROM booking_slots WHERE is_available = TRUE AND is_special_slot = TRUE AND start_time >= NOW()"
        );

        const formatted = rows.map(r => ({
            id: r.slot_id,
            title: 'Available' + (r.slot_category ? ` - ${r.slot_category}` : ''), 
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
        
        result.affectedRows > 0 ? res.sendStatus(200) : res.status(400).send("Slot already taken");
    } catch (err) {
        console.error(err);
        res.status(500).send("Database error");
    }
});

// --- MANAGEMENT PRIVATE API ---

// Standard Admin Bookings
app.get('/api/admin/bookings', adminAuth, async (req, res) => {
    try {
        const rows = await pool.query("SELECT * FROM booking_slots ORDER BY start_time ASC");
        
        const formattedData = rows.map(row => {
            let title = 'Available';
            if (row.is_no_show) {
                title = `🚩 ${row.booked_by_name || 'No Show'}`;
            } else if (!row.is_available) {
                title = row.booked_by_name || 'Booked';
            }

            return {
                id: row.slot_id,
                title: title , 
                start: row.start_time.replace(" ", "T") + "Z" ,
                is_available: row.is_available,
                is_no_show: row.is_no_show,
                slot_category: row.slot_category
            };
        });

        res.json(formattedData);
    } catch (err) {
        console.error(err);
        res.status(500).send("Database error");
    }
});

// NEW: Multi-Admin Bookings API Endpoint (uses multiAdminAuth)
app.get('/api/multi-admin/bookings', multiAdminAuth, async (req, res) => {
    try {
        const rows = await pool.query("SELECT * FROM booking_slots ORDER BY start_time ASC");
        
        const formattedData = rows.map(row => {
            let title = 'Available';
            if (row.is_no_show) {
                title = `🚩 ${row.booked_by_name || 'No Show'}`;
            } else if (!row.is_available) {
                title = row.booked_by_name || 'Booked';
            }

            return {
                id: row.slot_id,
                title: title , 
                start: row.start_time.replace(" ", "T") + "Z" ,
                is_available: row.is_available,
                is_no_show: row.is_no_show,
                slot_category: row.slot_category
            };
        });

        res.json(formattedData);
    } catch (err) {
        console.error(err);
        res.status(500).send("Database error");
    }
});

// // Toggle No Show status from the standard dashboard
// app.post('/api/admin/noshow/:id', adminAuth, async (req, res) => {
//     try {
//         await pool.query(
//             "UPDATE booking_slots SET is_no_show = TRUE WHERE slot_id = ?",
//             [req.params.id]
//         );
//         res.sendStatus(200);
//     } catch (err) {
//         console.error(err);
//         res.status(500).send("Failed to update status");
//     }
// });

// // NEW: Toggle No Show status from the multi dashboard
// app.post('/api/multi-admin/noshow/:id', multiAdminAuth, async (req, res) => {
//     try {
//         await pool.query(
//             "UPDATE booking_slots SET is_no_show = TRUE WHERE slot_id = ?",
//             [req.params.id]
//         );
//         res.sendStatus(200);
//     } catch (err) {
//         console.error(err);
//         res.status(500).send("Failed to update status");
//     }
// });


// --- SERVE PAGES ---

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views/calendar.html')));

// Standard Login Page
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'views/login.html')));

// NEW: Multi Login Page
app.get('/multi-login', (req, res) => res.sendFile(path.join(__dirname, 'views/multi-login.html')));

// Protected Standard Management Page
app.get('/manage', (req, res) => {
    if (req.session && req.session.isAdmin) {
        return res.sendFile(path.join(__dirname, 'views/management.html'));
    }
    res.redirect('/login');
});

// NEW: Protected Multi-Management Page
app.get('/multi', (req, res) => {
    if (req.session && req.session.isMultiAdmin) {
        return res.sendFile(path.join(__dirname, 'views/calendarMultiTimezone.html')); // Or wherever your multi dashboard HTML sits
    }
    res.redirect('/multi-login');
});

// Toggle No Show status from the standard dashboard
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

// NEW: Cancel and Reset booking slot from standard dashboard
app.post('/api/admin/cancel/:id', adminAuth, async (req, res) => {
    try {
        await pool.query(
            `UPDATE booking_slots 
             SET booked_by_id = NULL, booked_by_name = NULL, is_available = TRUE, is_no_show = FALSE 
             WHERE slot_id = ?`,
            [req.params.id]
        );
        res.sendStatus(200);
    } catch (err) {
        console.error(err);
        res.status(500).send("Failed to cancel booking");
    }
});

// NEW: Toggle No Show status from the multi dashboard
app.post('/api/multi-admin/noshow/:id', multiAdminAuth, async (req, res) => {
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

// NEW: Cancel and Reset booking slot from multi dashboard
app.post('/api/multi-admin/cancel/:id', multiAdminAuth, async (req, res) => {
    try {
        await pool.query(
            `UPDATE booking_slots 
             SET booked_by_id = NULL, booked_by_name = NULL, is_available = TRUE, is_no_show = FALSE 
             WHERE slot_id = ?`,
            [req.params.id]
        );
        res.sendStatus(200);
    } catch (err) {
        console.error(err);
        res.status(500).send("Failed to cancel booking");
    }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Portal running on http://localhost:${PORT}`));