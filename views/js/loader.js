// loader.js
async function loadComponent(id, file) {
    const container = document.getElementById(id);
    if (!container) return;

    try {
        const response = await fetch(file);
        if (!response.ok) throw new Error(`Could not load ${file}`);
        container.innerHTML = await response.text();
    } catch (err) {
        console.error(err);
    }
}

// Initialize all components
document.addEventListener('DOMContentLoaded', () => {
    loadComponent('navbar-container', '/navbar.html');
    loadComponent('footer-container', '/footer.html');
    // Add more here as needed, e.g., loadComponent('sidebar-container', './sidebar.html');
});