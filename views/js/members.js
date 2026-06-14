
// ═══════════════════════════════════════
//  STATE
// ═══════════════════════════════════════
let allMembers    = [];
let allTypes      = [];
let currentFilter = 'all';

// ═══════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([loadTypes(), loadMembers()]);

    document.getElementById('searchInput').addEventListener('input', renderMembers);

    document.getElementById('filterGroup').addEventListener('click', e => {
        if (!e.target.matches('.pill')) return;
        document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
        e.target.classList.add('active');
        currentFilter = e.target.dataset.filter;
        renderMembers();
    });

    document.getElementById('logoutBtn').addEventListener('click', async () => {
        if (!confirm('Are you sure you want to logout?')) return;
        try {
            const res = await fetch('/api/admin/logout', { method: 'POST' });
            if (res.ok) window.location.href = '/';
            else alert('Logout failed.');
        } catch { alert('Network error.'); }
    });

    // Close div-overlay modals on backdrop click
    // (credModal is intentionally excluded — must confirm copied first)
    ['addModal', 'editModal', 'resetPwModal', 'deleteModal'].forEach(id => {
        const el = document.getElementById(id);
        el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
    });
});

// ═══════════════════════════════════════
//  DATA LOADING
// ═══════════════════════════════════════
async function loadMembers() {
    try {
        const res = await fetch('/api/admin/members');
        if (res.status === 401) { window.location.href = '/login'; return; }
        allMembers = await res.json();
        renderMembers();
        updateStats();
    } catch {
        document.getElementById('membersBody').innerHTML =
            '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">⚠️</div><p>Failed to load members.</p></div></td></tr>';
    }
}

async function loadTypes() {
    try {
        const res = await fetch('/api/admin/members/types');
        allTypes  = await res.json();
        populateTypeSelects();
    } catch { console.error('Failed to load member types'); }
}

function populateTypeSelects() {
    const opts = allTypes.map(t =>
        `<option value="${t.type_id}">${esc(t.type_name)}</option>`
    ).join('');
    document.getElementById('add_type').innerHTML  = opts;
    document.getElementById('edit_type').innerHTML = opts;
}

// ═══════════════════════════════════════
//  RENDER TABLE
// ═══════════════════════════════════════
function renderMembers() {
    const search = document.getElementById('searchInput').value.toLowerCase();

    const filtered = allMembers.filter(m => {
        const matchFilter =
            currentFilter === 'all'      ? true :
            currentFilter === 'active'   ? m.is_active :
            currentFilter === 'inactive' ? !m.is_active :
            currentFilter === 'login'    ? m.has_login :
            currentFilter === 'no-login' ? !m.has_login : true;

        const matchSearch = !search ||
            (m.display_name || '').toLowerCase().includes(search) ||
            (m.username     || '').toLowerCase().includes(search) ||
            (m.discord_id   || '').toLowerCase().includes(search);

        return matchFilter && matchSearch;
    });

    if (filtered.length === 0) {
        document.getElementById('membersBody').innerHTML =
            '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">👤</div><p>No members found.</p></div></td></tr>';
        return;
    }

    document.getElementById('membersBody').innerHTML = filtered.map(m => {
        const lastSeen = m.last_login_at
            ? new Date(m.last_login_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
            : '—';

        return `
        <tr class="${m.is_active ? '' : 'inactive'}">
            <td>
                <div class="member-name-cell">${esc(m.display_name)}</div>
                ${m.username   ? `<div class="member-username">@${esc(m.username)}</div>` : ''}
                ${m.discord_id ? `<div class="member-discord">Discord: ${esc(m.discord_id)}</div>` : ''}
            </td>
            <td><span class="badge badge-type">${esc(m.type_name || '—')}</span></td>
            <td>
                <span class="badge ${m.is_active ? 'badge-active' : 'badge-inactive'}">
                    ${m.is_active ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>
                <span class="badge ${m.has_login ? 'badge-login' : 'badge-no-login'}">
                    ${m.has_login ? '✓ Enabled' : 'None'}
                </span>
            </td>
            <td style="font-family:var(--font-mono);font-size:0.75rem;color:var(--text-secondary)">${lastSeen}</td>
            <td>
                <div class="row-actions">
                    <button class="btn btn-ghost btn-sm"   onclick="openEditModal(${m.member_id})">Edit</button>
                    <button class="btn btn-warn btn-sm"    onclick="openResetPwModal(${m.member_id})">🔑 Reset PW</button>
                    <button class="btn ${m.is_active ? 'btn-ghost' : 'btn-success'} btn-sm"
                            onclick="toggleActive(${m.member_id})">
                        ${m.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    ${m.has_login ? `<button class="btn btn-danger btn-sm" onclick="removeLogin(${m.member_id})">Revoke Login</button>` : ''}
                    <button class="btn btn-danger btn-sm"  onclick="openDeleteModal(${m.member_id})">Delete</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function updateStats() {
    document.getElementById('statTotal').textContent     = allMembers.length;
    document.getElementById('statActive').textContent    = allMembers.filter(m => m.is_active).length;
    document.getElementById('statWithLogin').textContent = allMembers.filter(m => m.has_login).length;
    document.getElementById('statInactive').textContent  = allMembers.filter(m => !m.is_active).length;
}

// ═══════════════════════════════════════
//  ADD MEMBER
// ═══════════════════════════════════════
function openAddModal() {
    document.getElementById('add_name').value     = '';
    document.getElementById('add_username').value = '';
    document.getElementById('add_discord').value  = '';
    document.getElementById('add_active').checked = true;
    if (allTypes.length) document.getElementById('add_type').value = allTypes[0].type_id;
    showFeedback('add_error', '');
    setLoading('add_submit_btn', false, 'Add Member');
    openModal('addModal');
}

async function submitAdd() {
    const name     = document.getElementById('add_name').value.trim();
    const username = document.getElementById('add_username').value.trim();
    const discord  = document.getElementById('add_discord').value.trim();
    const type_id  = document.getElementById('add_type').value;
    const is_active= document.getElementById('add_active').checked;

    if (!name) return showFeedback('add_error', 'Display name is required.');
    showFeedback('add_error', '');
    setLoading('add_submit_btn', true, 'Adding…');

    const body = { display_name: name, type_id, is_active };
    if (username) body.username   = username;
    if (discord)  body.discord_id = discord;

    try {
        const res  = await fetch('/api/admin/members', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();

        if (res.ok) {
            closeModal('addModal');
            await loadMembers();

            if (data.plain_password && username) {
                // Show credentials exactly once
                showCredModal(
                    '// new_member_credentials',
                    username,
                    data.plain_password
                );
            }
        } else {
            showFeedback('add_error', data.error || 'Failed to add member.');
            setLoading('add_submit_btn', false, 'Add Member');
        }
    } catch {
        showFeedback('add_error', 'Connection error.');
        setLoading('add_submit_btn', false, 'Add Member');
    }
}

// ═══════════════════════════════════════
//  CREDENTIAL REVEAL MODAL
// ═══════════════════════════════════════
function showCredModal(title, username, password) {
    document.getElementById('cred_modal_title').textContent = title;
    document.getElementById('cred_username').textContent    = username;
    document.getElementById('cred_password').textContent    = password;
    document.getElementById('cred_confirm_check').checked   = false;

    const closeBtn = document.getElementById('cred_close_btn');
    closeBtn.disabled   = true;
    closeBtn.style.opacity = '0.4';
    closeBtn.style.cursor  = 'not-allowed';

    openModal('credModal');
}

function toggleCredClose() {
    const checked  = document.getElementById('cred_confirm_check').checked;
    const closeBtn = document.getElementById('cred_close_btn');
    closeBtn.disabled      = !checked;
    closeBtn.style.opacity = checked ? '1' : '0.4';
    closeBtn.style.cursor  = checked ? 'pointer' : 'not-allowed';
}

function closeCredModal() {
    if (!document.getElementById('cred_confirm_check').checked) return;
    // Zero out the displayed values before closing so they can't be scraped
    document.getElementById('cred_password').textContent = '••••••••••••••••';
    closeModal('credModal');
}

async function copyField(elementId, btn) {
    const text = document.getElementById(elementId).textContent;
    try {
        await navigator.clipboard.writeText(text);
        const orig = btn.textContent;
        btn.textContent = '✓ Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
    } catch { btn.textContent = 'Copy failed'; }
}

async function copyBoth() {
    const username = document.getElementById('cred_username').textContent;
    const password = document.getElementById('cred_password').textContent;
    const text = `Username: ${username}\nPassword: ${password}`;
    try {
        await navigator.clipboard.writeText(text);
        const btn = event.currentTarget;
        const orig = btn.textContent;
        btn.textContent = '✓ Copied both!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
    } catch { alert('Copy failed — please copy manually.'); }
}

// ═══════════════════════════════════════
//  EDIT MEMBER
// ═══════════════════════════════════════
function openEditModal(id) {
    const m = allMembers.find(x => x.member_id === id);
    if (!m) return;
    document.getElementById('edit_id').value       = m.member_id;
    document.getElementById('edit_name').value     = m.display_name;
    document.getElementById('edit_username').value = m.username || '';
    document.getElementById('edit_discord').value  = m.discord_id || '';
    document.getElementById('edit_type').value     = m.type_id;
    document.getElementById('edit_active').checked = !!m.is_active;
    showFeedback('edit_error', '');
    showFeedback('edit_success', '');
    openModal('editModal');
}

async function submitEdit() {
    const id       = document.getElementById('edit_id').value;
    const name     = document.getElementById('edit_name').value.trim();
    const username = document.getElementById('edit_username').value.trim();
    const discord  = document.getElementById('edit_discord').value.trim();
    const type_id  = document.getElementById('edit_type').value;
    const is_active= document.getElementById('edit_active').checked;

    if (!name) return showFeedback('edit_error', 'Display name is required.');
    showFeedback('edit_error', '');

    try {
        const res  = await fetch(`/api/admin/members/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                display_name: name,
                username: username || null,
                discord_id: discord || null,
                type_id,
                is_active
            })
        });
        const data = await res.json();
        if (res.ok) {
            showFeedback('edit_success', '✓ Changes saved.');
            await loadMembers();
            setTimeout(() => closeModal('editModal'), 900);
        } else {
            showFeedback('edit_error', data.error || 'Failed to save changes.');
        }
    } catch { showFeedback('edit_error', 'Connection error.'); }
}

// ═══════════════════════════════════════
//  RESET PASSWORD
// ═══════════════════════════════════════
function openResetPwModal(id) {
    const m = allMembers.find(x => x.member_id === id);
    if (!m) return;
    document.getElementById('reset_pw_id').value         = m.member_id;
    document.getElementById('reset_pw_name').textContent = m.display_name;
    showFeedback('reset_pw_error', '');
    setLoading('reset_pw_submit', false, 'Generate New Password');
    openModal('resetPwModal');
}

async function submitResetPassword() {
    const id = document.getElementById('reset_pw_id').value;
    const m  = allMembers.find(x => x.member_id === parseInt(id));
    showFeedback('reset_pw_error', '');
    setLoading('reset_pw_submit', true, 'Generating…');

    try {
        const res  = await fetch(`/api/admin/members/${id}/reset-password`, { method: 'POST' });
        const data = await res.json();

        if (res.ok) {
            closeModal('resetPwModal');
            await loadMembers();
            showCredModal(
                '// new_password',
                m?.username || '(see member profile)',
                data.plain_password
            );
        } else {
            showFeedback('reset_pw_error', data.error || 'Failed to reset password.');
            setLoading('reset_pw_submit', false, 'Generate New Password');
        }
    } catch {
        showFeedback('reset_pw_error', 'Connection error.');
        setLoading('reset_pw_submit', false, 'Generate New Password');
    }
}

// ═══════════════════════════════════════
//  REVOKE LOGIN
// ═══════════════════════════════════════
async function removeLogin(id) {
    const m = allMembers.find(x => x.member_id === id);
    if (!confirm(`Revoke portal login for ${m?.display_name}?\n\nTheir profile is kept but they can no longer log in.`)) return;
    try {
        const res = await fetch(`/api/admin/members/${id}/remove-login`, { method: 'POST' });
        if (res.ok) { await loadMembers(); }
        else { const d = await res.json(); alert(d.error || 'Failed.'); }
    } catch { alert('Connection error.'); }
}

// ═══════════════════════════════════════
//  TOGGLE ACTIVE
// ═══════════════════════════════════════
async function toggleActive(id) {
    try {
        const res = await fetch(`/api/admin/members/${id}/toggle-active`, { method: 'PATCH' });
        if (res.ok) { await loadMembers(); }
        else { const d = await res.json(); alert(d.error || 'Failed.'); }
    } catch { alert('Connection error.'); }
}

// ═══════════════════════════════════════
//  DELETE
// ═══════════════════════════════════════
function openDeleteModal(id) {
    const m = allMembers.find(x => x.member_id === id);
    if (!m) return;
    document.getElementById('delete_id').value         = m.member_id;
    document.getElementById('delete_name').textContent = m.display_name;
    showFeedback('delete_error', '');
    openModal('deleteModal');
}

async function submitDelete() {
    const id = document.getElementById('delete_id').value;
    try {
        const res  = await fetch(`/api/admin/members/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
            closeModal('deleteModal');
            await loadMembers();
        } else {
            showFeedback('delete_error', data.error || 'Delete failed.');
        }
    } catch { showFeedback('delete_error', 'Connection error.'); }
}

// ═══════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function showFeedback(id, msg) {
    const el = document.getElementById(id);
    el.textContent   = msg;
    el.style.display = msg ? 'block' : 'none';
}

function setLoading(btnId, loading, label) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled     = loading;
    btn.textContent  = label;
    btn.style.opacity = loading ? '0.6' : '1';
}

function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
