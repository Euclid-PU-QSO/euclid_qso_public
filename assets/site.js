(function () {
  const data = window.EuclidSiteData;

  if (!data) {
    return;
  }

  const page = document.body.dataset.page;
  const paperLookup = new Map(data.papers.map((paper) => [paper.id, paper]));
  const quasarLookup = new Map(data.euclidQuasars.map((quasar) => [quasar.id, quasar]));
  const paperKeywordOptions = [
    "sample",
    "selection",
    "luminosity function",
    "BH mass",
    "host galaxy",
    "JWST",
    "submm",
    "radio",
    "X-ray",
    "reionization"
  ];
  const groupColors = {
    Published: "#D97F69"
  };
  const defaultActiveQuasar = data.euclidQuasars.reduce(
    (bestMatch, quasar) =>
      !bestMatch || Number(quasar.redshift) > Number(bestMatch.redshift) ? quasar : bestMatch,
    null
  );
  const siteThemeStorageKey = "euclid-site-theme";
  const defaultPlotBounds = {
    xMin: 5.9,
    xMax: 8.8,
    yMin: -29.5,
    yMax: -20.5
  };
  const plotState = {
    bounds: { ...defaultPlotBounds },
    pendingSelection: null,
    activeQuasarId: defaultActiveQuasar ? defaultActiveQuasar.id : null,
    previewController: null,
    skyMapPreviewController: null,
    modalPreviewController: null,
    dragOrigin: null
  };
  const testThemeStorageKey = "euclid-test-theme";
  const hammerMaxX = 2 * Math.SQRT2;
  const hammerMaxY = Math.SQRT2;
  const skyMapBackgroundPath =
    window.EuclidGaiaEquirectangularDataUrl ||
    "assets/generated/gaia-galactic-equirectangular.png";
  const equatorialToGalacticMatrix = [
    [-0.0548755604, -0.8734370902, -0.4838350155],
    [0.4941094279, -0.44482963, 0.7469822445],
    [-0.867666149, -0.1980763734, 0.4559837762]
  ];
  const skyMapState = {
    centerRa: 0,
    dragPointerId: null,
    dragStartClientX: 0,
    dragStartCenterRa: 0,
    suppressClickUntil: 0,
    renderPending: false,
    imageLoading: false,
    imageReady: false,
    sourceImage: null,
    sourceWidth: 0,
    sourceHeight: 0,
    sourcePixels: null
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function wrapDegrees180(value) {
    const rawValue = Number(value);
    const wrappedValue = ((((rawValue % 360) + 540) % 360) - 180);

    if (wrappedValue === -180 && rawValue > 0) {
      return 180;
    }

    return wrappedValue;
  }

  function wrapDegrees360(value) {
    return ((Number(value) % 360) + 360) % 360;
  }

  function projectHammer(ra, dec, geometry, centerRa = skyMapState.centerRa) {
    const lambda = (-wrapDegrees180(Number(ra) - centerRa) * Math.PI) / 180;
    const latitudeRadians = (Number(dec) * Math.PI) / 180;
    const denominator = Math.sqrt(
      1 + Math.cos(latitudeRadians) * Math.cos(lambda / 2)
    );
    const x =
      (2 * Math.SQRT2 * Math.cos(latitudeRadians) * Math.sin(lambda / 2)) / denominator;
    const y = (Math.SQRT2 * Math.sin(latitudeRadians)) / denominator;

    return {
      x: geometry.cx + (x / hammerMaxX) * geometry.rx,
      y: geometry.cy - (y / hammerMaxY) * geometry.ry
    };
  }

  function inverseHammer(projectedX, projectedY) {
    const zSquared = 1 - (projectedX * projectedX) / 16 - (projectedY * projectedY) / 4;

    if (zSquared <= 0) {
      return null;
    }

    const z = Math.sqrt(zSquared);
    const longitude = 2 * Math.atan2(z * projectedX, 2 * (2 * z * z - 1));
    const latitude = Math.asin(z * projectedY);

    return {
      longitudeDeg: (longitude * 180) / Math.PI,
      latitudeDeg: (latitude * 180) / Math.PI
    };
  }

  function equatorialToGalactic(ra, dec) {
    const raRadians = (Number(ra) * Math.PI) / 180;
    const latitudeRadians = (Number(dec) * Math.PI) / 180;
    const cosDec = Math.cos(latitudeRadians);
    const equatorialVector = [
      cosDec * Math.cos(raRadians),
      cosDec * Math.sin(raRadians),
      Math.sin(latitudeRadians)
    ];
    const galacticVector = equatorialToGalacticMatrix.map((row) =>
      row[0] * equatorialVector[0] + row[1] * equatorialVector[1] + row[2] * equatorialVector[2]
    );
    const galacticLongitude = wrapDegrees180(
      (Math.atan2(galacticVector[1], galacticVector[0]) * 180) / Math.PI
    );
    const galacticLatitude = (Math.asin(clamp(galacticVector[2], -1, 1)) * 180) / Math.PI;

    return {
      longitude: galacticLongitude,
      latitude: galacticLatitude
    };
  }

  function equirectangularSourcePoint(ra, dec, sourceWidth, sourceHeight) {
    const galacticCoordinates = equatorialToGalactic(ra, dec);
    const sourceX =
      ((-galacticCoordinates.longitude / 360) + 0.5) * (sourceWidth - 1);
    const sourceY =
      (0.5 - galacticCoordinates.latitude / 180) * (sourceHeight - 1);

    return {
      x: Math.max(0, Math.min(sourceWidth - 1, sourceX)),
      y: Math.max(0, Math.min(sourceHeight - 1, sourceY))
    };
  }

  function pathFromPoints(points) {
    if (!points.length) {
      return "";
    }

    return points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ");
  }

  function requestSkyMapRender() {
    if (skyMapState.renderPending) {
      return;
    }

    skyMapState.renderPending = true;
    window.requestAnimationFrame(() => {
      skyMapState.renderPending = false;
      renderSkyMap();
    });
  }

  function ensureSkyMapBackgroundImage() {
    if (skyMapState.imageReady || skyMapState.imageLoading) {
      return;
    }

    skyMapState.imageLoading = true;
    const image = new Image();

    image.onload = () => {
      skyMapState.sourceImage = image;
      skyMapState.sourceWidth = image.naturalWidth;
      skyMapState.sourceHeight = image.naturalHeight;

      try {
        const sourceCanvas = document.createElement("canvas");
        sourceCanvas.width = image.naturalWidth;
        sourceCanvas.height = image.naturalHeight;
        const sourceContext = sourceCanvas.getContext("2d");

        if (!sourceContext) {
          skyMapState.imageLoading = false;
          return;
        }

        sourceContext.drawImage(image, 0, 0);
        skyMapState.sourcePixels = sourceContext.getImageData(
          0,
          0,
          image.naturalWidth,
          image.naturalHeight
        ).data;
      } catch (error) {
        skyMapState.sourcePixels = null;
      }

      skyMapState.imageReady = true;
      skyMapState.imageLoading = false;
      requestSkyMapRender();
    };

    image.onerror = () => {
      skyMapState.imageLoading = false;
    };

    image.decoding = "async";
    image.src = skyMapBackgroundPath;
  }

  function drawSkyMapBackground(canvas, geometry) {
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);

    if (!skyMapState.imageReady) {
      ensureSkyMapBackgroundImage();
      return;
    }

    if (!skyMapState.sourcePixels) {
      return;
    }

    const imageData = context.createImageData(width, height);
    const output = imageData.data;
    const source = skyMapState.sourcePixels;
    const sourceWidth = skyMapState.sourceWidth;
    const sourceHeight = skyMapState.sourceHeight;

    for (let y = 0; y < height; y += 1) {
      const projectedY = ((geometry.cy - y) / geometry.ry) * hammerMaxY;
      const normalizedY = (y - geometry.cy) / geometry.ry;

      for (let x = 0; x < width; x += 1) {
        const projectedX = ((x - geometry.cx) / geometry.rx) * hammerMaxX;
        const offset = (y * width + x) * 4;
        const normalizedX = (x - geometry.cx) / geometry.rx;

        if (normalizedX * normalizedX + normalizedY * normalizedY > 1) {
          output[offset + 3] = 0;
          continue;
        }

        const inverse = inverseHammer(projectedX, projectedY);

        if (!inverse) {
          output[offset + 3] = 0;
          continue;
        }

        const ra = wrapDegrees360(skyMapState.centerRa - inverse.longitudeDeg);
        const sourcePoint = equirectangularSourcePoint(
          ra,
          inverse.latitudeDeg,
          sourceWidth,
          sourceHeight
        );
        const sourceX = Math.round(sourcePoint.x);
        const sourceY = Math.round(sourcePoint.y);
        const sourceOffset = (sourceY * sourceWidth + sourceX) * 4;

        output[offset] = source[sourceOffset];
        output[offset + 1] = source[sourceOffset + 1];
        output[offset + 2] = source[sourceOffset + 2];
        output[offset + 3] = 255;
      }
    }

    context.putImageData(imageData, 0, 0);
  }

  function boundsMatch(first, second) {
    return ["xMin", "xMax", "yMin", "yMax"].every(
      (key) => Math.abs(first[key] - second[key]) < 1e-6
    );
  }

  function pointInBounds(point, bounds) {
    return (
      point.redshift >= bounds.xMin &&
      point.redshift <= bounds.xMax &&
      point.muv >= bounds.yMin &&
      point.muv <= bounds.yMax
    );
  }

  function niceStep(range, targetTicks) {
    const roughStep = range / Math.max(1, targetTicks);
    const exponent = Math.floor(Math.log10(roughStep));
    const scale = 10 ** exponent;
    const normalized = roughStep / scale;

    if (normalized <= 1) {
      return scale;
    }

    if (normalized <= 2) {
      return 2 * scale;
    }

    if (normalized <= 2.5) {
      return 2.5 * scale;
    }

    if (normalized <= 5) {
      return 5 * scale;
    }

    return 10 * scale;
  }

  function stepDecimals(step) {
    const value = Number(step.toFixed(6));
    const valueString = value.toString();

    if (valueString.includes("e-")) {
      return Number(valueString.split("e-")[1]);
    }

    const decimals = valueString.split(".")[1];
    return decimals ? decimals.length : 0;
  }

  function buildTicks(min, max, targetTicks) {
    const span = max - min;

    if (span <= 0) {
      return { ticks: [min], step: 1 };
    }

    const step = niceStep(span, targetTicks);
    const decimals = stepDecimals(step);
    const start = Math.ceil(min / step) * step;
    const ticks = [];

    for (let value = start; value <= max + step * 0.25; value += step) {
      ticks.push(Number(value.toFixed(decimals + 1)));
    }

    if (ticks.length < 2) {
      return {
        ticks: [Number(min.toFixed(decimals + 1)), Number(max.toFixed(decimals + 1))],
        step
      };
    }

    return { ticks, step };
  }

  function formatTick(value, step) {
    return value.toFixed(stepDecimals(step));
  }

  function selectionBox(selection) {
    if (!selection) {
      return null;
    }

    const left = Math.min(selection.x1, selection.x2);
    const right = Math.max(selection.x1, selection.x2);
    const top = Math.min(selection.y1, selection.y2);
    const bottom = Math.max(selection.y1, selection.y2);

    return {
      left,
      right,
      top,
      bottom,
      width: right - left,
      height: bottom - top
    };
  }

  function setActiveNav() {
    document.querySelectorAll("[data-nav]").forEach((link) => {
      if (link.dataset.nav === page) {
        link.classList.add("is-active");
      }
    });
  }

  function initSiteTheme() {
    const themeButtons = Array.from(document.querySelectorAll("[data-theme-option]"));
    const supportedThemes = new Set(["light", "dark"]);

    function updateButton(themeButton, activeTheme) {
      const buttonTheme = themeButton.dataset.themeOption;
      const isActive = buttonTheme === activeTheme;
      themeButton.classList.toggle("is-active", isActive);
      themeButton.setAttribute("aria-pressed", isActive ? "true" : "false");
    }

    function applyTheme(theme, persist) {
      const activeTheme = supportedThemes.has(theme) ? theme : "light";

      document.documentElement.dataset.theme = activeTheme;
      document.body.dataset.theme = activeTheme;

      themeButtons.forEach((themeButton) => updateButton(themeButton, activeTheme));

      if (persist) {
        try {
          window.localStorage.setItem(siteThemeStorageKey, activeTheme);
        } catch (error) {
          // Ignore storage failures and keep the in-memory theme.
        }
      }
    }

    try {
      const lightImage = new Image();
      lightImage.src = "assets/test/bh_light.png";
      const darkImage = new Image();
      darkImage.src = "assets/test/bh.png";
    } catch (error) {
      // Ignore preload failures and let the browser load on demand.
    }

    let initialTheme = document.documentElement.dataset.theme || "light";

    try {
      const storedTheme = window.localStorage.getItem(siteThemeStorageKey);

      if (storedTheme && supportedThemes.has(storedTheme)) {
        initialTheme = storedTheme;
      }
    } catch (error) {
      // Ignore storage failures and keep the default theme.
    }

    applyTheme(initialTheme, false);

    themeButtons.forEach((themeButton) => {
      themeButton.addEventListener("click", () => {
        applyTheme(themeButton.dataset.themeOption || "light", true);
      });
    });
  }

  function initTestPage() {
    if (page !== "test") {
      return;
    }

    const themeToggle = document.querySelector("[data-test-theme-toggle]");
    const testImage = document.querySelector(".gargantua-image");

    if (!themeToggle || !testImage) {
      return;
    }

    const supportedThemes = new Set(["dark", "light"]);

    function updateToggle(theme) {
      const nextTheme = theme === "dark" ? "light" : "dark";
      themeToggle.textContent = `Switch to ${nextTheme[0].toUpperCase()}${nextTheme.slice(1)}`;
      themeToggle.setAttribute("aria-label", `Switch to ${nextTheme} theme`);
      themeToggle.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
      themeToggle.dataset.nextTheme = nextTheme;
    }

    function applyTheme(theme, persist) {
      const normalizedTheme = supportedThemes.has(theme) ? theme : "dark";
      const imageSrc =
        normalizedTheme === "light" ? testImage.dataset.lightSrc : testImage.dataset.darkSrc;

      document.body.dataset.testTheme = normalizedTheme;

      if (imageSrc) {
        testImage.src = imageSrc;
      }

      updateToggle(normalizedTheme);

      if (persist) {
        try {
          window.localStorage.setItem(testThemeStorageKey, normalizedTheme);
        } catch (error) {
          // Ignore storage failures and keep the in-memory theme.
        }
      }
    }

    try {
      if (testImage.dataset.darkSrc) {
        const darkImage = new Image();
        darkImage.src = testImage.dataset.darkSrc;
      }

      if (testImage.dataset.lightSrc) {
        const lightImage = new Image();
        lightImage.src = testImage.dataset.lightSrc;
      }
    } catch (error) {
      // Ignore preload failures and let the browser load on demand.
    }

    let initialTheme = document.body.dataset.testTheme || "dark";

    try {
      const storedTheme = window.localStorage.getItem(testThemeStorageKey);

      if (storedTheme && supportedThemes.has(storedTheme)) {
        initialTheme = storedTheme;
      }
    } catch (error) {
      // Ignore storage failures and keep the default theme.
    }

    applyTheme(initialTheme, false);

    themeToggle.addEventListener("click", () => {
      applyTheme(themeToggle.dataset.nextTheme || "dark", true);
    });
  }

  function paperChips(paper) {
    return paper.tags.map((tag) => `<span class="tag">${tag}</span>`).join("");
  }

  function paperSortTimestamp(paper) {
    if (paper.publishedDate) {
      const parsedDate = Date.parse(`${paper.publishedDate}T00:00:00Z`);

      if (!Number.isNaN(parsedDate)) {
        return parsedDate;
      }
    }

    return Number(paper.year) || 0;
  }

  function formatPaperPublishedDate(paper) {
    if (!paper.publishedDate) {
      return String(paper.year);
    }

    const [year, month, day] = paper.publishedDate.split("-");
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec"
    ];
    const monthLabel = monthNames[Number(month) - 1];

    if (!monthLabel) {
      return String(paper.year);
    }

    return `${Number(day)} ${monthLabel} ${year}`;
  }

  function papersForQuasar(quasar) {
    const linkedPaperIds = new Set(quasar.paperIds || []);

    data.papers.forEach((paper) => {
      if ((paper.relatedQuasarIds || []).includes(quasar.id)) {
        linkedPaperIds.add(paper.id);
      }
    });

    return Array.from(linkedPaperIds)
      .map((paperId) => paperLookup.get(paperId))
      .filter(Boolean)
      .sort(
        (leftPaper, rightPaper) =>
          paperSortTimestamp(rightPaper) - paperSortTimestamp(leftPaper) ||
          leftPaper.title.localeCompare(rightPaper.title)
      );
  }

  function formatPaperShortCitation(paper) {
    const firstAuthor = (paper.authors || "").split(",")[0].trim();
    const surname = firstAuthor.split(/\s+/).pop() || "Unknown";
    return `${surname} et al. ${paper.year}`;
  }

  function renderPaperCard(paper) {
    const headlineBlock = `
      <h3>${paper.title}</h3>
      <p>${paper.description}</p>
    `;
    const linkedHeadline = paper.adsUrl
      ? `<a class="paper-link-block" href="${paper.adsUrl}" target="_blank" rel="noopener noreferrer">${headlineBlock}</a>`
      : headlineBlock;

    return `
      <article class="paper-card" id="${paper.id}">
        <p class="paper-meta">${formatPaperPublishedDate(paper)} / ${paper.venue}</p>
        ${linkedHeadline}
        <p class="paper-meta">${paper.authors}</p>
        <div class="tag-row">${paperChips(paper)}</div>
      </article>
    `;
  }

  function renderFeaturedPapers() {
    const target = document.getElementById("featured-papers");

    if (!target) {
      return;
    }

    target.innerHTML = data.papers
      .slice()
      .sort(
        (leftPaper, rightPaper) =>
          paperSortTimestamp(rightPaper) - paperSortTimestamp(leftPaper) ||
          leftPaper.title.localeCompare(rightPaper.title)
      )
      .slice(0, 3)
      .map(renderPaperCard)
      .join("");
  }

  function renderHomeMetrics() {
    const quasarCount = document.getElementById("home-metric-quasars");
    const paperCount = document.getElementById("home-metric-papers");

    if (quasarCount) {
      quasarCount.textContent = String(data.euclidQuasars.length);
    }

    if (paperCount) {
      paperCount.textContent = String(data.papers.length);
    }
  }

  function renderPapersPage() {
    const target = document.getElementById("papers-grid");
    const filterTarget = document.getElementById("paper-filters");
    const viewTarget = document.getElementById("paper-view-toggle");

    if (!target || !filterTarget || !viewTarget) {
      return;
    }

    const state = {
      keyword: "all",
      view: "list"
    };

    function renderFilterButtons() {
      filterTarget.innerHTML = [
        `<button class="paper-filter-button${state.keyword === "all" ? " is-active" : ""}" type="button" data-keyword="all" aria-pressed="${state.keyword === "all"}">All</button>`,
        ...paperKeywordOptions.map(
          (keyword) =>
            `<button class="paper-filter-button${state.keyword === keyword ? " is-active" : ""}" type="button" data-keyword="${keyword}" aria-pressed="${state.keyword === keyword}">${keyword}</button>`
        )
      ].join("");
    }

    function renderViewButtons() {
      viewTarget.innerHTML = `
        <button class="paper-view-button${state.view === "grid" ? " is-active" : ""}" type="button" data-view="grid" aria-pressed="${state.view === "grid"}">Cards</button>
        <span class="paper-view-separator" aria-hidden="true">/</span>
        <button class="paper-view-button${state.view === "list" ? " is-active" : ""}" type="button" data-view="list" aria-pressed="${state.view === "list"}">List</button>
      `;
    }

    function filteredPapers() {
      const filtered =
        state.keyword === "all"
          ? [...data.papers]
          : data.papers.filter((paper) => paper.tags.includes(state.keyword));

      return filtered.sort(
        (leftPaper, rightPaper) =>
          paperSortTimestamp(rightPaper) - paperSortTimestamp(leftPaper) ||
          leftPaper.title.localeCompare(rightPaper.title)
      );
    }

    function renderPaperResults() {
      const papers = filteredPapers();

      target.className = state.view === "list" ? "paper-grid is-list" : "paper-grid";
      target.innerHTML = papers.length
        ? papers.map(renderPaperCard).join("")
        : `
          <article class="paper-card paper-empty-state">
            <p class="paper-meta">No papers</p>
            <h3>No entries for ${state.keyword}</h3>
          </article>
        `;
    }

    filterTarget.addEventListener("click", (event) => {
      const button = event.target.closest("[data-keyword]");

      if (!button) {
        return;
      }

      state.keyword = button.dataset.keyword;
      renderFilterButtons();
      renderPaperResults();
    });

    viewTarget.addEventListener("click", (event) => {
      const button = event.target.closest("[data-view]");

      if (!button) {
        return;
      }

      state.view = button.dataset.view;
      renderViewButtons();
      renderPaperResults();
    });

    renderFilterButtons();
    renderViewButtons();
    renderPaperResults();
  }

  function renderDataPage() {
    const tableBody = document.getElementById("catalog-table-body");
    const popover = document.getElementById("catalog-popover");
    const sortButtons = Array.from(document.querySelectorAll(".table-sort"));

    if (!tableBody || !popover) {
      return;
    }

    const previewPopover = createQuasarPreviewPopover(popover);
    const sortState = {
      key: "redshift",
      direction: "desc"
    };

    function renderRows(quasars) {
      tableBody.innerHTML = quasars
        .map(
          (quasar) => `
            <tr>
              <td>
                <button class="table-link" type="button" data-quasar-id="${quasar.id}">
                  ${quasar.name}
                </button>
              </td>
              <td class="mono">${quasar.ra}</td>
              <td class="mono">${quasar.dec}</td>
              <td>${quasar.redshift.toFixed(2)}</td>
              <td>${quasar.muv.toFixed(2)}</td>
              <td>${quasar.jmag.toFixed(2)}</td>
              <td>${quasar.instrument}</td>
            </tr>
          `
        )
        .join("");
    }

    function compareValues(left, right, type) {
      if (type === "number") {
        return Number(left) - Number(right);
      }

      return String(left).localeCompare(String(right), undefined, {
        numeric: true,
        sensitivity: "base"
      });
    }

    function sortedQuasars() {
      const activeButton = sortButtons.find(
        (button) => button.dataset.sortKey === sortState.key
      );
      const sortType = activeButton ? activeButton.dataset.sortType : "string";

      return data.euclidQuasars
        .slice()
        .sort((left, right) => {
          const result = compareValues(left[sortState.key], right[sortState.key], sortType);

          if (result !== 0) {
            return sortState.direction === "asc" ? result : -result;
          }

          return String(left.name).localeCompare(String(right.name), undefined, {
            numeric: true,
            sensitivity: "base"
          });
        });
    }

    function updateSortUi() {
      sortButtons.forEach((button) => {
        const column = button.closest("th");
        const isActive = button.dataset.sortKey === sortState.key;
        const ariaSort = isActive
          ? sortState.direction === "asc"
            ? "ascending"
            : "descending"
          : "none";

        if (column) {
          column.setAttribute("aria-sort", ariaSort);
        }
      });
    }

    sortButtons.forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.sortKey === sortState.key) {
          sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
        } else {
          sortState.key = button.dataset.sortKey;
          sortState.direction = "asc";
        }

        updateSortUi();
        renderRows(sortedQuasars());
      });
    });

    updateSortUi();
    renderRows(sortedQuasars());

    tableBody.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-quasar-id]");

      if (!trigger) {
        return;
      }

      const quasar = quasarLookup.get(trigger.dataset.quasarId);

      if (quasar) {
        previewPopover.open(quasar, { includeCutout: true });
      }
    });
  }

  function renderTeamPage() {
    const target = document.getElementById("team-grid");
    const viewTarget = document.getElementById("team-view-toggle");

    if (!target || !viewTarget) {
      return;
    }

    function surname(name) {
      const parts = String(name).trim().split(/\s+/);
      return parts[parts.length - 1] || name;
    }

    const sortedTeam = [...data.team].sort(
      (firstMember, secondMember) =>
        surname(firstMember.name).localeCompare(surname(secondMember.name)) ||
        firstMember.name.localeCompare(secondMember.name)
    );

    const state = {
      view: "cards"
    };

    function renderViewButtons() {
      viewTarget.innerHTML = `
        <button class="paper-view-button${state.view === "cards" ? " is-active" : ""}" type="button" data-view="cards" aria-pressed="${state.view === "cards"}">Cards</button>
        <span class="paper-view-separator" aria-hidden="true">/</span>
        <button class="paper-view-button${state.view === "list" ? " is-active" : ""}" type="button" data-view="list" aria-pressed="${state.view === "list"}">List</button>
      `;
    }

    function renderMember(member) {
      if (state.view === "list") {
        return `
          <article class="team-card team-card-list">
            <h3>${member.name}</h3>
            <p class="member-role">${member.affiliation}</p>
          </article>
        `;
      }

      const figureMarkup = member.image
        ? `
          <div class="team-figure">
            <img src="${member.image}" alt="Portrait for ${member.name}" />
          </div>
        `
        : `
          <div class="team-figure team-figure-placeholder" aria-hidden="true">
            <div class="team-avatar-placeholder"></div>
          </div>
        `;

      return `
        <article class="team-card">
          ${figureMarkup}
          <h3>${member.name}</h3>
          <p class="member-role">${member.affiliation}</p>
        </article>
      `;
    }

    function renderMembers() {
      target.className = state.view === "list" ? "team-grid is-list" : "team-grid";
      target.innerHTML = sortedTeam.map(renderMember).join("");
    }

    viewTarget.addEventListener("click", (event) => {
      const button = event.target.closest("[data-view]");

      if (!button) {
        return;
      }

      state.view = button.dataset.view;
      renderViewButtons();
      renderMembers();
    });

    renderViewButtons();
    renderMembers();
  }

  function updateQuasarDetail(quasar) {
    const detail = document.getElementById("quasar-detail");

    if (!detail) {
      return;
    }

    const linkedPapers = papersForQuasar(quasar)
      .map(
        (paper) =>
          `<li><a href="papers.html#${paper.id}">${paper.title} (${formatPaperShortCitation(paper)})</a></li>`
      )
      .join("");
    const linkedPaperBlock = linkedPapers
      ? `<div class="detail-linked-papers"><h4 class="eyebrow">Papers including this object</h4><ul>${linkedPapers}</ul></div>`
      : "";

    detail.innerHTML = `
      <div class="detail-card-scroll">
        <p class="eyebrow">Object detail</p>
        <h3>${quasar.name}</h3>
        <div class="detail-grid">
          <article>
            <span>Coordinates</span>
            <strong>${quasar.ra}, ${quasar.dec}</strong>
          </article>
          <article>
            <span>Redshift</span>
            <strong>${quasar.redshift.toFixed(2)}</strong>
          </article>
          <article>
            <span>Muv</span>
            <strong>${quasar.muv.toFixed(2)}</strong>
          </article>
          <article>
            <span>J-band magnitude</span>
            <strong>${quasar.jmag.toFixed(2)}</strong>
          </article>
        </div>
        ${linkedPaperBlock}
      </div>
    `;
  }

  function showDetailPlaceholder(title, message) {
    const detail = document.getElementById("quasar-detail");

    if (!detail) {
      return;
    }

    detail.innerHTML = `
      <div class="detail-card-scroll">
        <p class="eyebrow">Object detail</p>
        <h3>${title}</h3>
        <p class="detail-placeholder">${message}</p>
      </div>
    `;
  }

  function syncExploreDetailHeight() {
    const plotCard = document.querySelector(".plot-layout .plot-card");
    const detail = document.getElementById("quasar-detail");

    if (!plotCard || !detail) {
      return;
    }

    if (window.matchMedia("(max-width: 980px)").matches) {
      detail.style.height = "";
      detail.style.maxHeight = "";
      return;
    }

    const nextHeight = `${Math.round(plotCard.getBoundingClientRect().height)}px`;
    detail.style.height = nextHeight;
    detail.style.maxHeight = nextHeight;
  }

  function initExploreDetailHeight() {
    if (page !== "explore") {
      return;
    }

    const plotCard = document.querySelector(".plot-layout .plot-card");

    if (!plotCard) {
      return;
    }

    syncExploreDetailHeight();
    window.addEventListener("resize", syncExploreDetailHeight);

    if ("ResizeObserver" in window) {
      const resizeObserver = new ResizeObserver(syncExploreDetailHeight);
      resizeObserver.observe(plotCard);
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(syncExploreDetailHeight).catch(() => {});
    }
  }

  function createQuasarPreviewPopover(popover) {
    if (!popover) {
      return {
        open() {},
        close() {}
      };
    }

    function close() {
      popover.hidden = true;
      popover.innerHTML = "";
      document.body.classList.remove("has-modal");
    }

    function open(quasar, options = {}) {
      const { includeCutout = false, compact = false } = options;
      const cutoutBlock = includeCutout
        ? `
            <article class="popover-media-card">
              <p class="eyebrow">Cutout montage</p>
              <img src="${quasar.cutoutPreview}" alt="Cutout preview for ${quasar.name}" />
            </article>
          `
        : "";

      if (compact) {
        popover.innerHTML = `
          <div class="catalog-popover-panel compact" role="dialog" aria-modal="true" aria-label="${quasar.name}">
            <div class="popover-compact-top">
              <button class="popover-close" type="button" data-popover-close aria-label="Close preview">Close</button>
            </div>
            <div class="popover-media popover-media-single compact-media">
              <article class="popover-media-card popover-spectrum">
                <p class="eyebrow">Discovery spectrum</p>
                <img src="${quasar.spectrumPreview}" alt="Discovery spectrum preview for ${quasar.name}" />
              </article>
              ${cutoutBlock}
            </div>
          </div>
        `;
        popover.hidden = false;
        document.body.classList.add("has-modal");
        return;
      }

      popover.innerHTML = `
        <div class="catalog-popover-panel" role="dialog" aria-modal="true" aria-label="${quasar.name}">
          <div class="popover-top">
            <div>
              <p class="eyebrow">Illustrative source preview</p>
              <h3>${quasar.name}</h3>
              <p class="paper-meta">${quasar.publication} / ${quasar.instrument} / z = ${quasar.redshift.toFixed(2)} / Muv = ${quasar.muv.toFixed(2)}</p>
            </div>
            <button class="popover-close" type="button" data-popover-close aria-label="Close preview">Close</button>
          </div>
          <p>${quasar.summary}</p>
          <div class="detail-grid">
            <article>
              <span>Coordinates</span>
              <strong>${quasar.ra}, ${quasar.dec}</strong>
            </article>
            <article>
              <span>J-band magnitude</span>
              <strong>${quasar.jmag.toFixed(2)}</strong>
            </article>
          </div>
          <div class="popover-media${includeCutout ? "" : " popover-media-single"}">
            <article class="popover-media-card popover-spectrum">
              <p class="eyebrow">Discovery spectrum</p>
              <img src="${quasar.spectrumPreview}" alt="Discovery spectrum preview for ${quasar.name}" />
            </article>
            ${cutoutBlock}
          </div>
        </div>
      `;
      popover.hidden = false;
      document.body.classList.add("has-modal");
    }

    popover.addEventListener("click", (event) => {
      if (event.target === popover || event.target.closest("[data-popover-close]")) {
        close();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !popover.hidden) {
        close();
      }
    });

    return { open, close };
  }

  function createAnchoredPlotPreview(preview, container, options = {}) {
    if (!preview || !container) {
      return {
        open() {},
        close() {}
      };
    }

    const { onExpand = null } = options;
    let activeAnchor = null;
    let activeQuasar = null;

    function close() {
      preview.hidden = true;
      preview.innerHTML = "";
      activeAnchor = null;
      activeQuasar = null;
    }

    function position(anchor) {
      if (!anchor || preview.hidden) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const previewRect = preview.getBoundingClientRect();
      const gap = 14;
      const padding = 12;
      const anchorX = anchorRect.left - containerRect.left + anchorRect.width / 2;
      const anchorY = anchorRect.top - containerRect.top + anchorRect.height / 2;
      let left = anchorX + gap;
      let top = anchorY - previewRect.height / 2;
      const maxLeft = containerRect.width - previewRect.width - padding;
      const maxTop = containerRect.height - previewRect.height - padding;

      if (left > maxLeft) {
        left = anchorX - previewRect.width - gap;
      }

      left = Math.max(padding, Math.min(left, maxLeft));
      top = Math.max(70, Math.min(top, maxTop));

      preview.style.left = `${left}px`;
      preview.style.top = `${top}px`;
    }

    function open(quasar, anchor) {
      const cardRole = onExpand ? "button" : "dialog";
      const cardTabIndex = onExpand ? 'tabindex="0"' : "";
      const expandableClass = onExpand ? " is-expandable" : "";

      preview.innerHTML = `
        <div class="plot-point-preview-card${expandableClass}" role="${cardRole}" ${cardTabIndex} aria-label="${quasar.name}">
          <img
            class="plot-point-preview-spectrum"
            src="${quasar.spectrumPreview}"
            alt="Discovery spectrum preview for ${quasar.name}"
          />
          <img
            class="plot-point-preview-cutout"
            src="${quasar.cutoutPreview}"
            alt="Cutout preview for ${quasar.name}"
          />
        </div>
      `;
      preview.hidden = false;
      activeAnchor = anchor;
      activeQuasar = quasar;
      requestAnimationFrame(() => position(anchor));
    }

    preview.addEventListener("click", (event) => {
      if (!activeQuasar || !onExpand || !event.target.closest(".plot-point-preview-card.is-expandable")) {
        return;
      }

      onExpand(activeQuasar);
      close();
    });

    preview.addEventListener("keydown", (event) => {
      if (!activeQuasar || !onExpand) {
        return;
      }

      if (
        (event.key === "Enter" || event.key === " ") &&
        event.target.closest(".plot-point-preview-card.is-expandable")
      ) {
        event.preventDefault();
        onExpand(activeQuasar);
        close();
      }
    });

    document.addEventListener("click", (event) => {
      if (preview.hidden) {
        return;
      }

      const clickedInsidePreview = preview.contains(event.target);
      const clickedActiveAnchor =
        activeAnchor &&
        (event.target === activeAnchor ||
          (typeof activeAnchor.contains === "function" && activeAnchor.contains(event.target)));

      if (clickedInsidePreview || clickedActiveAnchor) {
        return;
      }

      close();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !preview.hidden) {
        close();
      }
    });

    window.addEventListener("resize", () => {
      if (activeAnchor && !preview.hidden) {
        position(activeAnchor);
      }
    });

    return { open, close };
  }

  function renderPlot() {
    const svg = document.getElementById("quasar-plot");
    const plotStage = document.getElementById("plot-stage");

    if (!svg || data.euclidQuasars.length === 0) {
      return;
    }

    if (!plotState.modalPreviewController) {
      plotState.modalPreviewController = createQuasarPreviewPopover(
        document.getElementById("catalog-popover")
      );
    }

    if (!plotState.previewController) {
      plotState.previewController = createAnchoredPlotPreview(
        document.getElementById("explore-point-preview"),
        plotStage || svg.closest(".plot-card"),
        {
          onExpand(quasar) {
            plotState.modalPreviewController.open(quasar, { includeCutout: true });
          }
        }
      );
    }

    const width = 760;
    const height = 430;
    const margin = { top: 30, right: 34, bottom: 58, left: 72 };
    const { xMin, xMax, yMin, yMax } = plotState.bounds;
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const resetButton = document.getElementById("plot-reset-button");

    plotState.previewController.close();

    function xScale(value) {
      return margin.left + ((value - xMin) / (xMax - xMin)) * plotWidth;
    }

    function yScale(value) {
      return margin.top + ((value - yMin) / (yMax - yMin)) * plotHeight;
    }

    function xInvert(pixel) {
      return xMin + ((pixel - margin.left) / plotWidth) * (xMax - xMin);
    }

    function yInvert(pixel) {
      return yMin + ((pixel - margin.top) / plotHeight) * (yMax - yMin);
    }

    function createSvgNode(name, attrs) {
      const node = document.createElementNS("http://www.w3.org/2000/svg", name);
      Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
      return node;
    }

    function appendText(x, y, text, className, rotate) {
      const node = createSvgNode("text", { x, y, class: className || "" });
      if (rotate) {
        node.setAttribute("transform", rotate);
      }
      node.textContent = text;
      svg.appendChild(node);
    }

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.innerHTML = "";
    svg.style.touchAction = "none";
    svg.onselectstart = () => false;
    svg.ondragstart = () => false;

    const defs = createSvgNode("defs", {});
    const clipPath = createSvgNode("clipPath", { id: "z-muv-clip" });
    clipPath.appendChild(
      createSvgNode("rect", {
        x: margin.left,
        y: margin.top,
        width: plotWidth,
        height: plotHeight,
        rx: 22
      })
    );
    defs.appendChild(clipPath);
    svg.appendChild(defs);

    const frame = createSvgNode("rect", {
      x: margin.left,
      y: margin.top,
      width: plotWidth,
      height: plotHeight,
      rx: 22,
      class: "plot-frame"
    });
    svg.appendChild(frame);

    const plotGroup = createSvgNode("g", {
      "clip-path": "url(#z-muv-clip)"
    });
    svg.appendChild(plotGroup);

    const tickConfig = boundsMatch(plotState.bounds, defaultPlotBounds)
        ? {
          xTicks: [6.0, 6.5, 7.0, 7.5, 8.0, 8.5],
          xStep: 0.5,
          yTicks: [-29, -27, -25, -23, -21],
          yStep: 2
        }
      : {
          ...(() => {
            const xTickSet = buildTicks(xMin, xMax, 6);
            const yTickSet = buildTicks(yMin, yMax, 6);

            return {
              xTicks: xTickSet.ticks,
              xStep: xTickSet.step,
              yTicks: yTickSet.ticks,
              yStep: yTickSet.step
            };
          })()
        };
    const { xTicks, xStep, yTicks, yStep } = tickConfig;

    xTicks.forEach((tick) => {
      const x = xScale(tick);
      plotGroup.appendChild(
        createSvgNode("line", {
          x1: x,
          y1: margin.top,
          x2: x,
          y2: margin.top + plotHeight,
          class: "plot-grid"
        })
      );
      appendText(x, height - 22, formatTick(tick, xStep), "plot-label");
    });

    yTicks.forEach((tick) => {
      const y = yScale(tick);
      plotGroup.appendChild(
        createSvgNode("line", {
          x1: margin.left,
          y1: y,
          x2: margin.left + plotWidth,
          y2: y,
          class: "plot-grid"
        })
      );
      appendText(24, y + 4, formatTick(tick, yStep), "plot-label");
    });

    appendText(width / 2 - 28, height - 4, "Redshift", "axis-label");
    appendText(
      14,
      margin.top + plotHeight / 2 + 16,
      "Muv",
      "axis-label",
      `rotate(-90 14 ${margin.top + plotHeight / 2 + 16})`
    );

    data.comparisonSample.filter((point) => pointInBounds(point, plotState.bounds)).forEach((point) => {
      const radius = 3.1;
      plotGroup.appendChild(
        createSvgNode("circle", {
          cx: xScale(point.redshift),
          cy: yScale(point.muv),
          r: radius,
          class: "other-quasar-point"
        })
      );
    });

    const visibleEuclidQuasars = data.euclidQuasars.filter((quasar) =>
      pointInBounds(quasar, plotState.bounds)
    );
    const pointNodes = [];

    visibleEuclidQuasars.forEach((quasar) => {
      const size = 12;
      const pointNode = createSvgNode("rect", {
        x: xScale(quasar.redshift) - size / 2,
        y: yScale(quasar.muv) - size / 2,
        width: size,
        height: size,
        rx: 1.6,
        fill: groupColors[quasar.group] || "#0f2e4f",
        class: "euclid-point",
        "data-quasar-id": quasar.id,
        tabindex: "0",
        role: "button",
        "aria-label": `${quasar.name}, redshift ${quasar.redshift.toFixed(2)}, Muv ${quasar.muv.toFixed(2)}`
      });

      function activate() {
        pointNodes.forEach((node) => node.classList.remove("is-active"));
        pointNode.classList.add("is-active");
        plotState.activeQuasarId = quasar.id;
        updateQuasarDetail(quasar);
      }

      pointNode.addEventListener("mouseenter", activate);
      pointNode.addEventListener("focus", activate);
      pointNode.addEventListener("click", () => {
        activate();
        plotState.previewController.open(quasar, pointNode);
      });
      pointNode.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
          plotState.previewController.open(quasar, pointNode);
        }
      });

      plotGroup.appendChild(pointNode);
      pointNodes.push(pointNode);
    });

    const selectionNode = createSvgNode("rect", {
      class: "plot-selection",
      visibility: "hidden"
    });
    plotGroup.appendChild(selectionNode);

    svg.appendChild(
      createSvgNode("rect", {
        x: margin.left,
        y: margin.top,
        width: plotWidth,
        height: plotHeight,
        rx: 22,
        class: "plot-frame-outline"
      })
    );

    function drawSelection() {
      const box = selectionBox(plotState.pendingSelection);

      if (!box) {
        selectionNode.setAttribute("visibility", "hidden");
        return;
      }

      selectionNode.setAttribute("x", box.left);
      selectionNode.setAttribute("y", box.top);
      selectionNode.setAttribute("width", box.width);
      selectionNode.setAttribute("height", box.height);
      selectionNode.setAttribute("visibility", "visible");
    }

    function updatePlotControls() {
      if (resetButton) {
        resetButton.disabled = boundsMatch(plotState.bounds, defaultPlotBounds);
      }
    }

    function clientToSvgPoint(event) {
      const rect = svg.getBoundingClientRect();
      const scaleX = width / rect.width;
      const scaleY = height / rect.height;

      return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
      };
    }

    function clampToPlot(point) {
      return {
        x: clamp(point.x, margin.left, margin.left + plotWidth),
        y: clamp(point.y, margin.top, margin.top + plotHeight)
      };
    }

    function selectionToBounds(selection) {
      const box = selectionBox(selection);

      if (!box) {
        return null;
      }

      return {
        xMin: xInvert(box.left),
        xMax: xInvert(box.right),
        yMin: yInvert(box.top),
        yMax: yInvert(box.bottom)
      };
    }

    svg.onpointerdown = (event) => {
      if (event.button !== 0 || event.target.closest(".euclid-point")) {
        return;
      }

      const localPoint = clientToSvgPoint(event);

      if (
        localPoint.x < margin.left ||
        localPoint.x > margin.left + plotWidth ||
        localPoint.y < margin.top ||
        localPoint.y > margin.top + plotHeight
      ) {
        return;
      }

      event.preventDefault();
      plotState.previewController.close();
      plotState.dragOrigin = clampToPlot(localPoint);
      plotState.pendingSelection = {
        x1: plotState.dragOrigin.x,
        y1: plotState.dragOrigin.y,
        x2: plotState.dragOrigin.x,
        y2: plotState.dragOrigin.y
      };
      drawSelection();
      updatePlotControls();

      if (svg.setPointerCapture) {
        svg.setPointerCapture(event.pointerId);
      }
    };

    svg.onpointermove = (event) => {
      if (!plotState.dragOrigin) {
        return;
      }

      event.preventDefault();
      const localPoint = clampToPlot(clientToSvgPoint(event));
      plotState.pendingSelection = {
        x1: plotState.dragOrigin.x,
        y1: plotState.dragOrigin.y,
        x2: localPoint.x,
        y2: localPoint.y
      };
      drawSelection();
      updatePlotControls();
    };

    function finishSelection(event) {
      if (!plotState.dragOrigin) {
        return;
      }

      event.preventDefault();

      if (svg.releasePointerCapture && svg.hasPointerCapture && svg.hasPointerCapture(event.pointerId)) {
        svg.releasePointerCapture(event.pointerId);
      }

      plotState.dragOrigin = null;

      const box = selectionBox(plotState.pendingSelection);

      if (!box || box.width < 14 || box.height < 14) {
        plotState.pendingSelection = null;
        drawSelection();
        updatePlotControls();
        return;
      }

      const nextBounds = selectionToBounds(plotState.pendingSelection);

      plotState.pendingSelection = null;

      if (!nextBounds) {
        drawSelection();
        updatePlotControls();
        return;
      }

      plotState.bounds = nextBounds;
      renderPlot();
    }

    svg.onpointerup = finishSelection;
    svg.onpointercancel = finishSelection;

    if (resetButton) {
      resetButton.onclick = () => {
        plotState.bounds = { ...defaultPlotBounds };
        plotState.pendingSelection = null;
        plotState.dragOrigin = null;
        renderPlot();
      };
    }

    drawSelection();
    updatePlotControls();

    const activeQuasar =
      visibleEuclidQuasars.find((quasar) => quasar.id === plotState.activeQuasarId) ||
      visibleEuclidQuasars[0];

    if (activeQuasar) {
      const activeNode = pointNodes.find(
        (node) => node.getAttribute("data-quasar-id") === activeQuasar.id
      );

      if (activeNode) {
        activeNode.classList.add("is-active");
      }

      plotState.activeQuasarId = activeQuasar.id;
      updateQuasarDetail(activeQuasar);
      return;
    }

    showDetailPlaceholder(
      "No Euclid quasar in view",
      "Drag a new region containing a Euclid source or reset the plot to return to the full published sample."
    );
  }

  function renderSkyMap() {
    const svg = document.getElementById("sky-map");
    const backgroundCanvas = document.getElementById("sky-map-background-canvas");
    const section = svg ? svg.closest("section") : null;
    const skyMapStage = svg ? svg.closest(".sky-map-stage") : null;
    const overlays = data.skyMapOverlays;

    if (!svg || !backgroundCanvas || !section || !skyMapStage) {
      return;
    }

    if (
      !overlays ||
      !overlays.footprint ||
      !Array.isArray(overlays.footprint.segments) ||
      data.euclidQuasars.length === 0
    ) {
      section.hidden = true;
      return;
    }

    section.hidden = false;
    ensureSkyMapBackgroundImage();

    if (!plotState.modalPreviewController) {
      plotState.modalPreviewController = createQuasarPreviewPopover(
        document.getElementById("catalog-popover")
      );
    }

    if (!plotState.skyMapPreviewController) {
      plotState.skyMapPreviewController = createAnchoredPlotPreview(
        document.getElementById("sky-map-point-preview"),
        skyMapStage,
        {
          onExpand(quasar) {
            plotState.modalPreviewController.open(quasar, { includeCutout: true });
          }
        }
      );
    }

    const width = 960;
    const height = 560;
    const margin = { top: 28, right: 34, bottom: 70, left: 34 };
    const geometry = {
      cx: width / 2,
      cy: margin.top + (height - margin.top - margin.bottom) / 2,
      rx: (width - margin.left - margin.right) / 2,
      ry: (height - margin.top - margin.bottom) / 2
    };

    function createSvgNode(name, attrs) {
      const node = document.createElementNS("http://www.w3.org/2000/svg", name);
      Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
      return node;
    }

    function appendText(x, y, text, className, anchor = "middle", rotate = null) {
      const node = createSvgNode("text", {
        x,
        y,
        class: className || "",
        "text-anchor": anchor
      });

      if (rotate) {
        node.setAttribute("transform", rotate);
      }

      node.textContent = text;
      svg.appendChild(node);
    }

    function projectPolylineSegments(points) {
      const segments = [];
      let activeSegment = [];

      points.forEach(([ra, dec]) => {
        const projected = projectHammer(ra, dec, geometry);

        if (
          activeSegment.length &&
          Math.abs(projected.x - activeSegment[activeSegment.length - 1].x) > geometry.rx * 0.75
        ) {
          if (activeSegment.length > 1) {
            segments.push(activeSegment);
          }
          activeSegment = [projected];
          return;
        }

        activeSegment.push(projected);
      });

      if (activeSegment.length > 1) {
        segments.push(activeSegment);
      }

      return segments;
    }

    function sampledParallel(dec) {
      const points = [];

      for (let ra = -180; ra <= 180; ra += 2) {
        points.push(projectHammer(ra + skyMapState.centerRa, dec, geometry));
      }

      return points;
    }

    function sampledMeridian(ra) {
      const points = [];

      for (let dec = -89; dec <= 89; dec += 2) {
        points.push(projectHammer(ra, dec, geometry));
      }

      return points;
    }

    function leftmostPoint(points) {
      return points.reduce((bestPoint, point) => (point.x < bestPoint.x ? point : bestPoint));
    }

    function formatSkyRaLabel(wrappedRa) {
      const raDegrees = wrappedRa < 0 ? wrappedRa + 360 : wrappedRa;
      return `${raDegrees.toFixed(0)}°`;
    }

    function formatSkyDecLabel(dec) {
      if (dec > 0) {
        return `+${dec}°`;
      }

      if (dec < 0) {
        return `${dec}°`;
      }

      return "0°";
    }

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.innerHTML = "";
    plotState.skyMapPreviewController.close();
    backgroundCanvas.width = width;
    backgroundCanvas.height = height;
    drawSkyMapBackground(backgroundCanvas, geometry);

    const defs = createSvgNode("defs", {});
    const clipPath = createSvgNode("clipPath", { id: "sky-map-clip" });
    clipPath.appendChild(
      createSvgNode("ellipse", {
        cx: geometry.cx,
        cy: geometry.cy,
        rx: geometry.rx,
        ry: geometry.ry
      })
    );
    defs.appendChild(clipPath);
    svg.appendChild(defs);

    const background = createSvgNode("ellipse", {
      cx: geometry.cx,
      cy: geometry.cy,
      rx: geometry.rx,
      ry: geometry.ry,
      class: "sky-map-background"
    });
    svg.appendChild(background);

    const clippedGroup = createSvgNode("g", { "clip-path": "url(#sky-map-clip)" });
    svg.appendChild(clippedGroup);

    const skyParallels = [-60, -30, 0, 30, 60];
    const skyMeridians = [0, 60, 120, 180, 240, 300];

    skyParallels.forEach((dec) => {
      clippedGroup.appendChild(
        createSvgNode("path", {
          d: pathFromPoints(sampledParallel(dec)),
          class: "sky-map-grid"
        })
      );
    });

    skyMeridians.forEach((ra) => {
      clippedGroup.appendChild(
        createSvgNode("path", {
          d: pathFromPoints(sampledMeridian(ra)),
          class: "sky-map-grid"
        })
      );
    });

    overlays.footprint.segments.forEach((segment) => {
      projectPolylineSegments(segment).forEach((projectedSegment) => {
        clippedGroup.appendChild(
          createSvgNode("path", {
            d: pathFromPoints(projectedSegment),
            class: "sky-map-footprint"
          })
        );
      });
    });

    if (overlays.galacticPlane && Array.isArray(overlays.galacticPlane.segments)) {
      overlays.galacticPlane.segments.forEach((segment) => {
        projectPolylineSegments(segment).forEach((projectedSegment) => {
          clippedGroup.appendChild(
            createSvgNode("path", {
              d: pathFromPoints(projectedSegment),
              class: "sky-map-galactic"
            })
          );
        });
      });
    }

    const outline = createSvgNode("ellipse", {
      cx: geometry.cx,
      cy: geometry.cy,
      rx: geometry.rx,
      ry: geometry.ry,
      class: "sky-map-outline"
    });
    svg.appendChild(outline);

    const pointNodes = [];

    function activatePoint(quasar, pointNode) {
      pointNodes.forEach((node) => node.classList.remove("is-active"));
      pointNode.classList.add("is-active");
      plotState.activeQuasarId = quasar.id;
      updateQuasarDetail(quasar);
    }

    data.euclidQuasars.forEach((quasar) => {
      const ra = wrapDegrees180(quasar.ra);
      const dec = Number(quasar.dec);
      const projected = projectHammer(ra, dec, geometry);
      const pointNode = createSvgNode("circle", {
        cx: projected.x,
        cy: projected.y,
        r: 4.8,
        class: "sky-map-point",
        "data-quasar-id": quasar.id,
        tabindex: "0",
        role: "button",
        "aria-label": `${quasar.name}, right ascension ${quasar.ra}, declination ${quasar.dec}`
      });
      const titleNode = createSvgNode("title", {});
      titleNode.textContent = `${quasar.name} (RA ${quasar.ra}, Dec ${quasar.dec})`;
      pointNode.appendChild(titleNode);

      pointNode.addEventListener("mouseenter", () => activatePoint(quasar, pointNode));
      pointNode.addEventListener("focus", () => activatePoint(quasar, pointNode));
      pointNode.addEventListener("click", () => {
        if (Date.now() < skyMapState.suppressClickUntil) {
          return;
        }

        activatePoint(quasar, pointNode);
        plotState.skyMapPreviewController.open(quasar, pointNode);
      });
      pointNode.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activatePoint(quasar, pointNode);
          plotState.skyMapPreviewController.open(quasar, pointNode);
        }
      });

      clippedGroup.appendChild(pointNode);
      pointNodes.push(pointNode);
    });

    skyParallels.forEach((dec) => {
      const parallelPoints = sampledParallel(dec);
      const labelPoint = leftmostPoint(parallelPoints);
      appendText(
        labelPoint.x - 12,
        labelPoint.y + 4,
        formatSkyDecLabel(dec),
        "sky-map-axis-label",
        "end"
      );
    });

    skyMeridians.forEach((ra) => {
      const labelPoint = projectHammer(ra, 0, geometry);
      appendText(
        labelPoint.x,
        geometry.cy - 10,
        formatSkyRaLabel(ra),
        "sky-map-label"
      );
    });

    appendText(width / 2, height - 18, "RA", "sky-map-axis-label");
    appendText(
      16,
      geometry.cy + 16,
      "Dec",
      "sky-map-axis-label",
      "middle",
      `rotate(-90 16 ${geometry.cy + 16})`
    );

    function clientToSvgPoint(event) {
      const rect = svg.getBoundingClientRect();
      const scaleX = width / rect.width;
      const scaleY = height / rect.height;

      return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
      };
    }

    svg.style.touchAction = "none";

    svg.onpointerdown = (event) => {
      if (event.button !== 0 || event.target.closest(".sky-map-point")) {
        return;
      }

      skyMapState.dragPointerId = event.pointerId;
      skyMapState.dragStartClientX = event.clientX;
      skyMapState.dragStartCenterRa = skyMapState.centerRa;

      if (svg.setPointerCapture) {
        svg.setPointerCapture(event.pointerId);
      }
    };

    svg.onpointermove = (event) => {
      if (skyMapState.dragPointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const deltaX = event.clientX - skyMapState.dragStartClientX;
      const deltaViewBoxX = deltaX * (width / rect.width);
      const deltaDegrees = (deltaViewBoxX / (geometry.rx * 2)) * 360;

      if (Math.abs(deltaDegrees) > 0.6) {
        skyMapState.suppressClickUntil = Date.now() + 120;
      }

      skyMapState.centerRa = wrapDegrees360(skyMapState.dragStartCenterRa + deltaDegrees);
      requestSkyMapRender();
    };

    function finishSkyMapDrag(event) {
      if (skyMapState.dragPointerId !== event.pointerId) {
        return;
      }

      if (
        svg.releasePointerCapture &&
        svg.hasPointerCapture &&
        svg.hasPointerCapture(event.pointerId)
      ) {
        svg.releasePointerCapture(event.pointerId);
      }

      skyMapState.dragPointerId = null;
    }

    svg.onpointerup = finishSkyMapDrag;
    svg.onpointercancel = finishSkyMapDrag;

    const activeQuasar =
      data.euclidQuasars.find((quasar) => quasar.id === plotState.activeQuasarId) ||
      data.euclidQuasars[0];

    if (activeQuasar) {
      const activePointNode = pointNodes.find(
        (node) => node.getAttribute("data-quasar-id") === activeQuasar.id
      );

      if (activePointNode) {
        activePointNode.classList.add("is-active");
      }
    }
  }

  initSiteTheme();
  setActiveNav();
  initTestPage();
  renderHomeMetrics();
  renderFeaturedPapers();
  renderPapersPage();
  renderDataPage();
  renderTeamPage();
  renderPlot();
  renderSkyMap();
  initExploreDetailHeight();
})();
