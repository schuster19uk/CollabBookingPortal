
      document.addEventListener('DOMContentLoaded', function() {
        const calendarEl   = document.getElementById('calendar');
        const logoutBtn    = document.getElementById('logoutBtn');
        const modal        = document.getElementById('bookingModal');
        const modalTitle   = document.getElementById('modalTitle');
        const modalNoShowBtn = document.getElementById('modalNoShowBtn');
        const modalCancelBtn = document.getElementById('modalCancelBtn');
        const modalCloseBtn  = document.getElementById('modalCloseBtn');

        let selectedEvent = null;
        let isMobile = window.innerWidth < 768;

        function handleAuthError() {
            alert("Your session has expired. Please log in again.");
            window.location.href = '/login';
        }

        const calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: isMobile ? 'timeGridDay' : 'timeGridWeek',
            timeZone: 'local',
            allDaySlot: false,
            height: 'auto',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: isMobile ? '' : 'timeGridWeek,timeGridDay'
            },

            dayHeaderContent: function(arg) {
                const allEvents = calendar.getEvents();
                const activeBookings = allEvents.filter(event => {
                    const isSameDay = event.start.toDateString() === arg.date.toDateString();
                    return isSameDay && !event.extendedProps.available && !event.extendedProps.noShow;
                }).length;

                const countClass = activeBookings === 0
                    ? 'hdr-count management-count hdr-zero'
                    : 'hdr-count management-count';
                const label = activeBookings === 1 ? '1 Active Booking' : `${activeBookings} Active Bookings`;
                return { html: `<div class="hdr-date">${arg.text}</div><div class="${countClass}">${label}</div>` };
            },

            windowResize: function() {
                calendar.changeView(window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek');
            },

            events: async function(info, successCallback, failureCallback) {
                try {
                    const res = await fetch('/api/admin/bookings');
                    if (res.status === 401) { handleAuthError(); return; }

                    const data = await res.json();
                    const formatted = data.map(row => ({
                        id: row.id,
                        title: row.title + ' ' + row.slot_category,
                        start: row.start,
                        backgroundColor: row.title.includes('🚩') ? '#f43f5e' :
                                         (row.title === 'Available' ? '#22d3a0' : '#3b82f6'),
                        allDay: false,
                        extendedProps: { available: row.is_available, noShow: row.is_no_show }
                    }));
                    successCallback(formatted);
                    calendar.render();
                } catch (err) {
                    console.error("Management Fetch Error:", err);
                    failureCallback(err);
                }
            },

            eventClick: function(info) {
                const props = info.event.extendedProps;
                if (props.available) { alert("This slot is still available."); return; }

                selectedEvent = info.event;
                modalNoShowBtn.style.display = props.noShow ? 'none' : 'block';
                modalTitle.innerText = `Manage: ${selectedEvent.title}`;
                modal.showModal();
            }
        });

        calendar.render();

        modalNoShowBtn.addEventListener('click', async () => {
            if (!selectedEvent) return;
            try {
                const res = await fetch(`/api/admin/noshow/${selectedEvent.id}`, { method: 'POST' });
                if (res.status === 401) { handleAuthError(); return; }
                if (res.ok) { modal.close(); calendar.refetchEvents(); }
                else alert("Failed to update status.");
            } catch { alert("Error connecting to server."); }
        });

        modalCancelBtn.addEventListener('click', async () => {
            if (!selectedEvent) return;
            try {
                const res = await fetch(`/api/admin/cancel/${selectedEvent.id}`, { method: 'POST' });
                if (res.status === 401) { handleAuthError(); return; }
                if (res.ok) { modal.close(); calendar.refetchEvents(); }
                else alert("Failed to cancel booking.");
            } catch { alert("Error connecting to server."); }
        });

        modalCloseBtn.addEventListener('click', () => modal.close());

        logoutBtn.addEventListener('click', async () => {
            if (confirm("Are you sure you want to logout?")) {
                try {
                    const res = await fetch('/api/admin/logout', { method: 'POST' });
                    if (res.ok) window.location.href = '/';
                    else alert("Logout failed.");
                } catch { alert("Network error trying to log out."); }
            }
        });
      });
    