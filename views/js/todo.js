

// Run verification checks immediately on page entry
// Global Session Registry
let loggedInUser = null; 

(async function verifySessionOnLoad() {
    try {
        const res = await fetch('/api/todo/tasks');
        if (res.status === 401) {
            window.location.href = '/todo-login';
        } else {
            if (typeof loadTasks === 'function') await loadTasks();
            if (typeof loadMetadata === 'function') await loadMetadata();
            
            // OPTIONAL/RECOMMENDED: Fetch profile info if your API provides it
            // Replace '/api/todo/me' with your actual endpoint if different
            try {
                const userRes = await fetch('/api/todo/me');
                if (userRes.ok) {
                    loggedInUser = await userRes.json(); // Expecting { member_id: X, display_name: '...' }
                }
            } catch { console.warn("Could not load current user profile fallback."); }
        }
    } catch (err) {
        console.error("Session lookup halted.", err);
    }
})();

let allTasks = [];
let allMembers = [];
let allProjects = [];
let currentFilter = 'all';
let assigningTaskId = null;
let selectedMemberId = null;
let editingTaskId = null;

const priorityMap = { 1: 'High', 2: 'Medium', 3: 'Low' };
const statusMap   = { 1: 'To Do', 2: 'In Progress', 3: 'Done' };

document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([loadTasks(), loadMembers(), loadProjects()]);

    document.getElementById('statusFilters').addEventListener('click', e => {
        if (!e.target.matches('.pill')) return;
        document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
        e.target.classList.add('active');
        currentFilter = e.target.dataset.status;
        renderTasks();
    });

    document.getElementById('searchInput').addEventListener('input', renderTasks);
});

// =========== DATA ===========
async function loadTasks() {
    try {
        const res = await fetch('/api/todo/tasks');
        allTasks = await res.json();
      
        updateStats();
        renderTasks();
    } catch(err) {
        document.getElementById('taskBody').innerHTML =
            '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">&#x26A0;&#xFE0F;</div><p>Failed to load tasks.</p></div></td></tr>';
    }
}

async function loadMembers() {
    try {
        const res = await fetch('/api/todo/members');
        allMembers = await res.json();
        populateMemberSelects();
    } catch(err) { console.error('Failed to load members', err); }
}

async function loadProjects() {
    try {
        const res = await fetch('/api/todo/projects');
        allProjects = await res.json();
        populateProjectSelects();
    } catch(err) { console.error('Failed to load projects', err); }
}

async function quickCreateTask() {
    const titleInput = document.getElementById('quick_title');
    const title = titleInput.value.trim();
    
    if (!title) { 
        alert('Please enter a task title.'); 
        return; 
    }

    // 1. Resolve Project: Use selected filter option, otherwise fallback to null (None)
    const selectedProject = document.getElementById('filter_project').value;
    const projectId = selectedProject ? parseInt(selectedProject) : null;

    // 2. Resolve Assignee: Use selected filter option, otherwise fall back to logged-in session user
    const selectedAssignee = document.getElementById('filter_assignee').value;
    let assigneeId = selectedAssignee ? parseInt(selectedAssignee) : null;

    if (!assigneeId) {
        if (loggedInUser && loggedInUser.member_id) {
            assigneeId = loggedInUser.member_id;
        } else if (allMembers.length > 0) {
            // Safe fallback: grab the first active member in system context if session profile wasn't found
            assigneeId = allMembers[0].member_id; 
        } else {
            alert('Cannot determine an assignee. Please assign via the "+ New Task" modal or select a filter.');
            return;
        }
    }

    // 3. Assemble Payload (Defaults: Priority Medium (2), Status To Do (1))
    const payload = {
        title: title,
        description: null,
        priorityId: 2, 
        statusId: 1,   
        assigneeId: assigneeId,
        projectId: projectId,
        dueDate: null
    };

    try {
        const res = await fetch('/api/todo/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) { 
            titleInput.value = ''; // Clean out the quick entry box
            await loadTasks();     // Re-fetch records and sync workspace
        } else { 
            alert('Failed to quick create task: ' + await res.text()); 
        }
    } catch { 
        alert('Connection error encountered during quick creation.'); 
    }
}


// =========== RENDER ===========
function renderTasks() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const targetProject  = document.getElementById('filter_project').value;
    const targetAssignee = document.getElementById('filter_assignee').value;

    let filteredTasks = allTasks.filter(t => {
        // Status filter: "all" now excludes Done (status_id 3)
        const matchStatus = currentFilter === 'all' 
            ? String(t.status_id) !== '3' 
            : String(t.status_id) === currentFilter;
        
        // Search bar filter
        const matchSearch = !search ||
            t.title.toLowerCase().includes(search) ||
            (t.description || '').toLowerCase().includes(search) ||
            (t.assignee_name || '').toLowerCase().includes(search);
            
        // Top-level Project filter
        const matchProject = !targetProject || String(t.project_id) === String(targetProject);
        
        // Top-level Assignee filter
        const matchAssignee = !targetAssignee || String(t.assignee_id) === String(targetAssignee);

        return matchStatus && matchSearch && matchProject && matchAssignee;
    });

    if (filteredTasks.length === 0) {
        document.getElementById('taskBody').innerHTML =
            '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">&#x2713;</div><p>No tasks found.</p></div></td></tr>';
        return;
    }

    document.getElementById('taskBody').innerHTML = filteredTasks.map(t => {
        const isDone = t.status_id === 3;
        const dueStr = t.due_date ? new Date(t.due_date).toLocaleDateString('en-GB', { day:'numeric', month:'short' }) : '&#x2014;';
        const isOverdue = t.due_date && !isDone && new Date(t.due_date) < new Date();

        return '<tr class="' + (isDone ? 'done' : '') + '">' +
            '<td>' +
                '<div class="task-title ' + (isDone ? 'done-text' : '') + '">' + escHtml(t.title) + '</div>' +
                (t.description ? '<div class="task-desc">' + escHtml(t.description.substring(0,80)) + (t.description.length>80?'&#x2026;':'') + '</div>' : '') +
                (t.project_name ? '<div class="task-desc" style="color:var(--accent-2);margin-top:3px">&#x25C8; ' + escHtml(t.project_name) + '</div>' : '') +
            '</td>' +
            '<td><span class="assignee-chip">' + escHtml(t.assignee_name || '&#x2014;') + '</span></td>' +
            '<td><span class="badge badge-priority-' + t.priority_id + '">' + (priorityMap[t.priority_id] || t.priority_id) + '</span></td>' +
            '<td><span class="badge badge-status-' + t.status_id + '">' + (statusMap[t.status_id] || t.status_id) + '</span></td>' +
            '<td class="font-mono" style="font-size:0.75rem;' + (isOverdue ? 'color:var(--danger)' : 'color:var(--text-secondary)') + '">' + dueStr + (isOverdue?' &#x26A0;':'') + '</td>' +
            '<td><div class="task-actions">' +
                (!isDone ? '<button class="btn btn-success btn-sm" onclick="completeTask(' + t.task_id + ')" title="Mark complete">&#x2713;</button>' : '') +
                '<button class="btn btn-warn btn-sm" onclick="openEditModal(' + t.task_id + ')" title="Edit">&#x270E;</button>' +
                '<button class="btn btn-ghost btn-sm" onclick="openAssignModal(' + t.task_id + ')" title="Reassign">&#x21BA;</button>' +
                (isDone ? '<button class="btn btn-ghost btn-sm" onclick="reopenTask(' + t.task_id + ')" title="Reopen">&#x21A9;</button>' : '') +
            '</div></td>' +
        '</tr>';
    }).join('');
}
// Simply route top-level dropdown actions to the unified render function
function applyBoardFilters() {
    renderTasks();
}

// Reset the dropdown elements and trigger a fresh unified render
function clearBoardFilters() {
    document.getElementById('filter_project').value = "";
    document.getElementById('filter_assignee').value = "";
    renderTasks();
}


function updateStats() {
    document.getElementById('statTotal').textContent      = allTasks.length;
    document.getElementById('statTodo').textContent       = allTasks.filter(t => t.status_id === 1).length;
    document.getElementById('statInProgress').textContent = allTasks.filter(t => t.status_id === 2).length;
    document.getElementById('statDone').textContent       = allTasks.filter(t => t.status_id === 3).length;
}

// =========== COMPLETE / REOPEN ===========
async function completeTask(taskId) {
    try {
        const res = await fetch('/api/todo/tasks/' + taskId + '/complete', { method: 'POST' });
        if (res.ok) await loadTasks();
        else alert('Failed: ' + await res.text());
    } catch { alert('Connection error.'); }
}

async function reopenTask(taskId) {
    try {
        const res = await fetch('/api/todo/tasks/' + taskId + '/reopen', { method: 'POST' });
        if (res.ok) await loadTasks();
        else alert('Failed: ' + await res.text());
    } catch { alert('Connection error.'); }
}

// =========== EDIT TASK ===========
function openEditModal(taskId) {
    const t = allTasks.find(x => x.task_id === taskId);
    if (!t) return;
    editingTaskId = taskId;
    document.getElementById('et_title').value    = t.title || '';
    document.getElementById('et_desc').value     = t.description || '';
    document.getElementById('et_priority').value = t.priority_id;
    document.getElementById('et_status').value   = t.status_id;
    document.getElementById('et_assignee').value = t.assignee_id || '';
    document.getElementById('et_project').value  = t.project_id || '';
    document.getElementById('et_due').value      = t.due_date ? t.due_date.substring(0, 10) : '';
    openModal('editTaskModal');
}

async function saveEdit() {
    const title = document.getElementById('et_title').value.trim();
    if (!title) { alert('Title is required.'); return; }

    const payload = {
        title,
        description: document.getElementById('et_desc').value.trim() || null,
        priorityId:  parseInt(document.getElementById('et_priority').value),
        statusId:    parseInt(document.getElementById('et_status').value),
        assigneeId:  parseInt(document.getElementById('et_assignee').value),
        projectId:   document.getElementById('et_project').value || null,
        dueDate:     document.getElementById('et_due').value || null,
    };

    try {
        const res = await fetch('/api/todo/tasks/' + editingTaskId, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) { closeModal('editTaskModal'); await loadTasks(); }
        else alert('Failed: ' + await res.text());
    } catch { alert('Connection error.'); }
}

// =========== ASSIGN ===========
function openAssignModal(taskId) {
    assigningTaskId = taskId;
    selectedMemberId = null;
    const list = document.getElementById('memberList');
    list.innerHTML = allMembers.map(m =>
        '<div class="member-item" data-id="' + m.member_id + '" onclick="selectMember(this,' + m.member_id + ')">' +
            '<div>' +
                '<div class="member-name">' + escHtml(m.display_name) + '</div>' +
                '<div class="member-type">' + escHtml(m.type_name || '') + '</div>' +
            '</div>' +
        '</div>'
    ).join('');
    openModal('assignModal');
}

function selectMember(el, memberId) {
    document.querySelectorAll('.member-item').forEach(i => i.classList.remove('selected'));
    el.classList.add('selected');
    selectedMemberId = memberId;
}

async function confirmAssign() {
    if (!selectedMemberId) { alert('Please select a member.'); return; }
    try {
        const res = await fetch('/api/todo/tasks/' + assigningTaskId + '/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assigneeId: selectedMemberId })
        });
        if (res.ok) { closeModal('assignModal'); await loadTasks(); }
        else alert('Failed: ' + await res.text());
    } catch { alert('Connection error.'); }
}

// =========== NEW TASK ===========
function openNewTaskModal() {
    document.getElementById('nt_title').value    = '';
    document.getElementById('nt_desc').value     = '';
    document.getElementById('nt_priority').value = '2';
    document.getElementById('nt_status').value   = '1';
    document.getElementById('nt_assignee').value = loggedInUser ? loggedInUser.member_id : '';
    document.getElementById('nt_due').value      = '';
    openModal('newTaskModal');
}

async function createTask() {
    const title      = document.getElementById('nt_title').value.trim();
    const assigneeId = document.getElementById('nt_assignee').value;
    if (!title)      { alert('Title is required.'); return; }
    if (!assigneeId) { alert('Please select an assignee.'); return; }

    const payload = {
        title,
        description: document.getElementById('nt_desc').value.trim() || null,
        priorityId:  parseInt(document.getElementById('nt_priority').value),
        statusId:    parseInt(document.getElementById('nt_status').value),
        assigneeId:  parseInt(assigneeId),
        projectId:   document.getElementById('nt_project').value || null,
        dueDate:     document.getElementById('nt_due').value || null,
    };

    try {
        const res = await fetch('/api/todo/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) { closeModal('newTaskModal'); await loadTasks(); }
        else alert('Failed: ' + await res.text());
    } catch { alert('Connection error.'); }
}



// =========== NEW PROJECT PIPELINE ===========
function openNewProjectModal() {
    document.getElementById('np_name').value = '';
    openModal('newProjectModal');
}

async function createProject() {
    const projectNameInput = document.getElementById('np_name');
    const projectName = projectNameInput.value.trim();
    // Read the description field value
    const projectDesc = document.getElementById('np_desc').value.trim();

    if (!projectName) {
        alert('Project name is required.');
        return;
    }

    // Include description in the payload sent to the backend API
    const payload = {
        projectName: projectName,
        description: projectDesc || null
    };

    try {
        const res = await fetch('/api/todo/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            projectNameInput.value = '';
            document.getElementById('np_desc').value = ''; // Reset description field
            closeModal('newProjectModal');
            await loadProjects(); 
        } else {
            alert('Failed to create project: ' + await res.text());
        }
    } catch (err) {
        alert('Connection error encountered during project setup.');
        console.error(err);
    }
}


// =========== SELECTS ===========
function populateMemberSelects() {
    const opts = '<option value="">— Select member —</option>' +
        allMembers.map(m => '<option value="' + m.member_id + '">' + escHtml(m.display_name) + '</option>').join('');
    document.getElementById('nt_assignee').innerHTML = opts;
    document.getElementById('et_assignee').innerHTML = opts;

    // POPULATE FILTER DROPDOWN
    const filterOpts = '<option value="">All Assignees</option>' +
        allMembers.map(m => '<option value="' + m.member_id + '">' + escHtml(m.display_name) + '</option>').join('');
    document.getElementById('filter_assignee').innerHTML = filterOpts;
}

function populateProjectSelects() {
    const opts = '<option value="">None</option>' +
        allProjects.map(p => '<option value="' + p.project_id + '">' + escHtml(p.project_name) + '</option>').join('');
    document.getElementById('nt_project').innerHTML = opts;
    document.getElementById('et_project').innerHTML = opts;

    // POPULATE FILTER DROPDOWN
    const filterOpts = '<option value="">All Projects</option>' +
        allProjects.map(p => '<option value="' + p.project_id + '">' + escHtml(p.project_name) + '</option>').join('');
    document.getElementById('filter_project').innerHTML = filterOpts;
}

// =========== MODAL HELPERS ===========
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
});

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}


