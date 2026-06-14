// =========== THEME ===========
function toggleTheme() {
    const html = document.documentElement;
    const isLight = html.getAttribute('data-theme') === 'light';
    const next = isLight ? 'dark' : 'light';
    html.setAttribute('data-theme', next);
    localStorage.setItem('taskboard-theme', next);
    document.getElementById('themeToggle').textContent = next === 'light' ? '☼' : '☽';
}

// // Apply saved theme
// (function() {
//     const saved = localStorage.getItem('taskboard-theme') || 'dark';
//     if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
//     document.addEventListener('DOMContentLoaded', () => {
//         document.getElementById('themeToggle').textContent = saved === 'light' ? '☼' : '☽';
//     });
// })();