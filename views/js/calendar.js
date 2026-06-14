document.addEventListener('DOMContentLoaded', function() {
    const calendarEl = document.getElementById('calendar');
    let isMobile = window.innerWidth < 768;
    const todayStr = new Date().toISOString().split('T')[0];

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: isMobile ? 'timeGridDay' : 'timeGridWeek',
        timeZone: 'local',
        allDaySlot: false,
        height: 'auto',
        validRange: { start: todayStr },
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: isMobile ? '' : 'timeGridWeek,timeGridDay'
        },

        dayHeaderContent: function(arg) {
            const allEvents = calendar.getEvents();
            const count = allEvents.filter(event =>
                event.start.toDateString() === arg.date.toDateString()
            ).length;

            const isPast = arg.date < new Date().setHours(0,0,0,0);
            if (isPast) {
                return { html: `<div class="hdr-date">${arg.text}</div>` };
            }

            const countClass = count === 0 ? 'hdr-count hdr-zero' : 'hdr-count';
            const label = count === 1 ? '1 slot' : `${count} slots`;
            return { html: `<div class="hdr-date">${arg.text}</div><div class="${countClass}">${label}</div>` };
        },

        windowResize: function() {
            calendar.changeView(window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek');
        },

        events: async function(info, successCallback, failureCallback) {
            try {
                const res = await fetch('/api/available-slots');
                const data = await res.json();
                const formatted = data.map(row => ({
                    id: row.id, title: row.title, start: row.start,
                    backgroundColor: '#22d3a0', borderColor: '#16a37a'
                }));
                successCallback(formatted);
            } catch (err) { failureCallback(err); }
        },

        eventClick: function(info) {
            const dateLabel = info.event.start.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
            const timeLabel = info.event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            if (info.event.start < new Date()) {
                alert("This slot has already started or passed.");
                return;
            }

            const userName = prompt(`Booking: ${dateLabel} at ${timeLabel}.\n\nEnter your name:`);
            if (userName && userName.trim()) {
                bookSlot(info.event.id, userName.trim());
            }
        }
    });

    async function bookSlot(slotId, userName) {
        try {
            const response = await fetch('/api/book', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slotId, userName })
            });

            if (response.ok) {
                alert(`Success! Thanks ${userName}, your slot is confirmed.`);
                calendar.refetchEvents();
            } else {
                alert("Booking failed: " + await response.text());
            }
        } catch (err) {
            alert("Connection error.");
        }
    }

    calendar.render();
});
