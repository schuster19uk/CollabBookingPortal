document.addEventListener('DOMContentLoaded', function() {
    const calendarEl    = document.getElementById('calendar');
    const tzSelectorEl  = document.getElementById('tz-selector');
    const modal         = document.getElementById('bookingModal');
    const modalTitle    = document.getElementById('modalTitle');
    const modalNoShowBtn = document.getElementById('modalNoShowBtn');
    const modalCancelBtn = document.getElementById('modalCancelBtn');
    const modalCloseBtn  = document.getElementById('modalCloseBtn');

    let selectedEvent = null;
    let isMobile = window.innerWidth < 768;
    let rawFetchedSlots = [];

    function handleAuthError() {
        alert("Your session has expired. Please log in again.");
        window.location.href = '/multi-login';
    }

    function getTimezoneOffset(timeZone, date) {
        if (timeZone === 'local') return -date.getTimezoneOffset();
        const tz = timeZone === 'UTC' ? 'GMT' : timeZone;
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false
        });
        const parts = formatter.formatToParts(date);
        const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
        const targetUTC = Date.UTC(map.year, map.month - 1, map.day,
            map.hour === '24' ? 0 : map.hour, map.minute, map.second);
        return Math.round((targetUTC - date.getTime()) / 60000);
    }

    function shiftToZone(dateInput, targetZone) {
        const base = new Date(dateInput);
        const offset = getTimezoneOffset(targetZone, base);
        return new Date(base.getTime() + (offset * 60000));
    }

    function getFormatDateString(date) {
        return date.getUTCFullYear() + '-' +
            String(date.getUTCMonth() + 1).padStart(2, '0') + '-' +
            String(date.getUTCDate()).padStart(2, '0');
    }

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: isMobile ? 'timeGridDay' : 'timeGridWeek',
        timeZone: 'UTC',
        allDaySlot: false,
        height: 'auto',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: isMobile ? '' : 'timeGridWeek,timeGridDay'
        },

        dayHeaderContent: function(arg) {
            const selectedZone = tzSelectorEl.value;
            const targetDayStr = getFormatDateString(arg.date);
            const count = rawFetchedSlots.filter(slot => {
                const shifted = shiftToZone(slot.start, selectedZone);
                return getFormatDateString(shifted) === targetDayStr && slot.is_available && !slot.is_no_show;
            }).length;

            const countClass = count === 0 ? 'hdr-count hdr-zero' : 'hdr-count';
            const label = count === 1 ? '1 slot' : `${count} slots`;
            return { html: `<div class="hdr-date">${arg.text}</div><div class="${countClass}">${label}</div>` };
        },

        windowResize: function() {
            calendar.changeView(window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek');
        },

        events: async function(info, successCallback, failureCallback) {
            try {
                const res = await fetch('/api/multi-admin/bookings');
                if (res.status === 401) { handleAuthError(); return; }

                const data = await res.json();
                rawFetchedSlots = data;
                const selectedZone = tzSelectorEl.value;

                const formatted = data.map(row => {
                    const shifted = shiftToZone(row.start, selectedZone);
                    return {
                        id: row.id,
                        title: row.title + (row.slot_category ? ` [${row.slot_category}]` : ''),
                        start: shifted.toISOString().replace("Z", ""),
                        backgroundColor: row.title.includes('🚩') ? '#f43f5e' :
                                         (row.title === 'Available' ? '#22d3a0' : '#3b82f6'),
                        allDay: false,
                        extendedProps: { available: row.is_available, noShow: row.is_no_show }
                    };
                });
                successCallback(formatted);
                requestAnimationFrame(() => calendar.render());
            } catch (err) { failureCallback(err); }
        },

        eventClick: function(info) {
            const props = info.event.extendedProps;
            selectedEvent = info.event;

            if (props.available) {
                const matchedRaw = rawFetchedSlots.find(s => String(s.id) === String(info.event.id));
                const baseTime = matchedRaw ? new Date(matchedRaw.start) : info.event.start;
                if (baseTime < new Date()) { alert("This slot has already started or passed."); return; }
                const userName = prompt(`Booking selection window.\n\nEnter your name to claim:`);
                if (userName && userName.trim()) bookSlot(info.event.id, userName.trim());
                return;
            }

            modalNoShowBtn.style.display = props.noShow ? 'none' : 'block';
            modalTitle.innerText = `Manage Slot: ${selectedEvent.title}`;
            modal.showModal();
        }
    });

    tzSelectorEl.addEventListener('change', () => calendar.refetchEvents());

    async function bookSlot(slotId, userName) {
        try {
            const response = await fetch('/api/book', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slotId, userName })
            });
            if (response.ok) calendar.refetchEvents();
            else alert("Booking failed: " + await response.text());
        } catch (err) { alert("Connection error."); }
    }

    modalNoShowBtn.addEventListener('click', async () => {
        if (!selectedEvent) return;
        try {
            const res = await fetch(`/api/multi-admin/noshow/${selectedEvent.id}`, { method: 'POST' });
            if (res.status === 401) { handleAuthError(); return; }
            if (res.ok) { modal.close(); calendar.refetchEvents(); }
            else alert("Failed to mark as No Show.");
        } catch { alert("Error connecting to server."); }
    });

    modalCancelBtn.addEventListener('click', async () => {
        if (!selectedEvent) return;
        try {
            const res = await fetch(`/api/multi-admin/cancel/${selectedEvent.id}`, { method: 'POST' });
            if (res.status === 401) { handleAuthError(); return; }
            if (res.ok) { modal.close(); calendar.refetchEvents(); }
            else alert("Failed to cancel booking.");
        } catch { alert("Error connecting to server."); }
    });

    modalCloseBtn.addEventListener('click', () => modal.close());

    calendar.render();
});
