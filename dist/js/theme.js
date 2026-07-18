// Dark/light theme toggle — persists preference to localStorage('theme-pref')
(function () {
    function getTheme() {
        return document.documentElement.getAttribute('data-theme') || 'light';
    }

    function updateIcon(theme) {
        var icon = document.getElementById('theme-icon');
        if (!icon) return;
        icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        var btn = document.getElementById('theme-toggle');
        if (btn) btn.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    }

    document.addEventListener('DOMContentLoaded', function () {
        updateIcon(getTheme());

        var btn = document.getElementById('theme-toggle');
        if (!btn) return;

        btn.addEventListener('click', function () {
            var next = getTheme() === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme-pref', next);
            updateIcon(next);
        });
    });
})();
