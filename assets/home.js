(function () {
  const page = document.body.dataset.page;
  const themeButtons = Array.from(document.querySelectorAll("[data-theme-toggle]"));
  const supportedThemes = new Set(["light", "dark"]);
  const storageKey = "euclid-site-theme";

  function setActiveNav() {
    document.querySelectorAll("[data-nav]").forEach((link) => {
      if (link.dataset.nav === page) {
        link.classList.add("is-active");
      }
    });
  }

  function updateButton(themeButton, activeTheme) {
    const nextTheme = activeTheme === "dark" ? "light" : "dark";
    themeButton.textContent = nextTheme[0].toUpperCase() + nextTheme.slice(1);
    themeButton.setAttribute("aria-label", `Switch to ${nextTheme} theme`);
    themeButton.setAttribute("aria-pressed", activeTheme === "dark" ? "true" : "false");
    themeButton.dataset.nextTheme = nextTheme;
  }

  function applyTheme(theme, persist) {
    const activeTheme = supportedThemes.has(theme) ? theme : "light";

    document.documentElement.dataset.theme = activeTheme;
    document.body.dataset.theme = activeTheme;
    themeButtons.forEach((themeButton) => updateButton(themeButton, activeTheme));

    if (persist) {
      try {
        window.localStorage.setItem(storageKey, activeTheme);
      } catch (error) {
        // Ignore storage failures and keep the current theme in memory.
      }
    }
  }

  let initialTheme = document.documentElement.dataset.theme || "light";

  try {
    const storedTheme = window.localStorage.getItem(storageKey);

    if (storedTheme && supportedThemes.has(storedTheme)) {
      initialTheme = storedTheme;
    }
  } catch (error) {
    // Ignore storage failures and keep the default theme.
  }

  setActiveNav();
  applyTheme(initialTheme, false);

  themeButtons.forEach((themeButton) => {
    themeButton.addEventListener("click", () => {
      applyTheme(themeButton.dataset.nextTheme || "dark", true);
    });
  });
})();
