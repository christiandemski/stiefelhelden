(function () {
  const D = window.STIEFEL;
  const people = Object.keys(D.laeufer);        // Reihenfolge aus data.js
  const name = (id) => D.laeufer[id];
  const pcls = (id) => "p" + people.indexOf(id);  // p0 / p1 -> Farbe je Person
  const $ = (sel) => document.querySelector(sel);
  const put = (sel, html) => { const el = $(sel); if (el) el.innerHTML = html; return el; };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const fmtDate = (iso) =>
    new Date(iso + "T12:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

  const fmtKm = (km) => km.toLocaleString("de-DE", { maximumFractionDigits: 1 });
  const num = (s) => parseFloat(String(s).replace(",", "."));

  const toSec = (t) => t.split(":").map(Number).reduce((a, b) => a * 60 + b, 0);
  const kmOf = (d) => ({ halbmarathon: 21.0975, marathon: 42.195 })[d.trim().toLowerCase()] ?? num(d);
  const pace = (zeit, km) => {
    const s = Math.round(toSec(zeit) / km);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} /km`;
  };

  // Wer gelaufen ist (auch ohne bekannte Zeit); ältere Daten ohne Liste: wer eine Zeit hat
  const runnersOf = (r) => people.filter((id) => (r.teilnehmer ? r.teilnehmer.includes(id) : r.zeiten[id]));
  // zusammen = alle dabei, auch mit DNS (nicht gestartet) oder DNF (nicht ins Ziel gekommen)
  const isTogether = (r) => runnersOf(r).length === people.length;
  const statusOf = (r, id) => (r.status || {})[id];
  // Startnummer je Person; ältere Daten hatten nur eine pro Rennen
  const bibOf = (r, id) => (r.startnummern ? r.startnummern[id] : runnersOf(r)[0] === id ? r.startnummer : null);
  // Was die Seite zeigt (im Backend unter „Allgemein“); ältere data.js ohne Angabe: alles
  const show = { zeiten: true, startnummern: true, status: true, bestzeiten: true, karte: true, ...D.anzeige };
  const races = [...D.rennen].sort((x, y) => y.datum.localeCompare(x.datum));
  const together = races.filter(isTogether);

  // ---------- Platzhalter ----------
  const fills = {
    names: people.map(name).join(" & "),
    seit: D.seit,
    rundeDistanz: D.stiefelrunde.distanz,
    raceCount: races.length,
    togetherCount: together.length,
    kmTogether: fmtKm(together.reduce((sum, r) => sum + r.km, 0)),
  };
  document.querySelectorAll("[data-fill]").forEach((el) => (el.textContent = fills[el.dataset.fill] ?? ""));

  // ---------- Texte aus dem Backend (sonst bleibt der Text aus index.html); *Wort* = hervorgehoben ----------
  document.querySelectorAll("[data-text]").forEach((el) => {
    const t = (D.texte || {})[el.dataset.text];
    if (t) el.innerHTML = esc(t).replace(/\*([^*]+)\*/g, "<em>$1</em>").replace(/\n/g, "<br>");
  });

  // ---------- Nächster Start ----------
  const n = D.naechsterStart;
  let hasNext = false;
  if (n && n.datum && $("#next")) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.round((new Date(n.datum + "T00:00:00") - today) / 86400000);
    if (days >= 0) {
      const wer = (n.wer || []).length === people.length ? "zusammen" : people.filter((id) => (n.wer || []).includes(id)).map(name).join(", ");
      $("#next .countdown strong").textContent = days === 0 ? "Heute" : days;
      $("#next .countdown span").textContent = days === 0 ? "" : days === 1 ? "Tag" : "Tage";
      $("#next .next-name").textContent = n.name;
      $("#next .next-meta").textContent = [fmtDate(n.datum), n.ort, n.distanz, wer].filter(Boolean).join(" · ");
      $("#next").hidden = false;
      hasNext = true;
    }
  }
  // ohne nächsten Start nimmt die Hero-Kachel die volle Breite
  if (!hasNext) $("#hero-col").className = "col-12";

  // ---------- Bestzeiten: automatisch aus den Rennen + manuelle Einträge, je Distanz die schnellste ----------
  const PB_DIST = [
    { label: "5 km", km: 5, min: 4.95, max: 5.05 },
    { label: "10 km", km: 10, min: 9.9, max: 10.1 },
    { label: "Halbmarathon", km: 21.0975, min: 21, max: 21.3 },
    { label: "Marathon", km: 42.195, min: 42.1, max: 42.4 },
  ];
  const distOf = (km) => PB_DIST.find((d) => km >= d.min && km <= d.max);
  const bestOf = (id) => {
    const best = new Map();
    const offer = (key, pb) => {
      const cur = best.get(key);
      if (!cur || toSec(pb.zeit) < toSec(cur.zeit)) best.set(key, pb);
    };
    races.forEach((r) => {
      const d = distOf(r.km);
      if (d && r.zeiten[id] && !statusOf(r, id) && !r.inoffiziell) {
        offer(d.label, { distanz: d.label, km: d.km, zeit: r.zeiten[id], rennen: r.name, jahr: Number(r.datum.slice(0, 4)) });
      }
    });
    (D.bestzeiten[id] || []).forEach((pb) => {
      const km = kmOf(pb.distanz), d = distOf(km);
      offer(d ? d.label : pb.distanz.trim().toLowerCase(), { ...pb, distanz: d ? d.label : pb.distanz, km: d ? d.km : km });
    });
    return [...best.values()].sort((a, b) => (a.km || 0) - (b.km || 0));
  };
  const pbs = Object.fromEntries(people.map((id) => [id, bestOf(id)]));

  // ---------- Bestzeiten als Tabs ----------
  if (!show.bestzeiten) {
    $("#bestzeiten").remove();
    document.querySelector('#nav a[href="#bestzeiten"]').parentElement.remove();
  }
  const pbPeople = show.bestzeiten ? people.filter((id) => pbs[id].length) : [];
  put("#pb-tabs", pbPeople.map((id, i) => `<li class="nav-item" role="presentation">
      <button class="nav-link ${i === 0 ? "active" : ""}" id="tab-${id}" data-bs-toggle="pill" data-bs-target="#pane-${id}"
        type="button" role="tab" aria-controls="pane-${id}" aria-selected="${i === 0}">
        <span class="pdot ${pcls(id)}"></span>${esc(name(id))}
      </button>
    </li>`).join(""));
  put("#pb-panes", pbPeople.map((id, i) => `<div class="tab-pane fade ${i === 0 ? "show active" : ""}" id="pane-${id}"
      role="tabpanel" aria-labelledby="tab-${id}" tabindex="0">
      <div class="row g-3">
        ${pbs[id].map((pb) => `<div class="col-6 col-lg-3">
          <article class="tile pb-tile ${pcls(id)}">
            <p class="eyebrow">${esc(pb.distanz)}</p>
            <p class="pb-time">${esc(pb.zeit)}</p>
            ${Number.isFinite(pb.km) && pb.km > 0 ? `<span class="pb-pace">${pace(pb.zeit, pb.km)}</span>` : ""}
            <p class="pb-where">${esc(pb.rennen || "")}${pb.jahr ? " · " + pb.jahr : ""}</p>
          </article>
        </div>`).join("")}
      </div>
    </div>`).join(""));

  // ---------- Rennen: Jahre als Kapitel, Rennen mit Fotos oder Notiz als Erlebnis-Kacheln ----------
  const filterEl = put("#filter",
    [["alle", "Alle"], ["zusammen", "Zusammen"], ...people.map((id) => [id, name(id)])]
      .map(([k, label], i) => `<button type="button" class="btn" data-f="${k}" aria-pressed="${i === 0}">${esc(label)}</button>`)
      .join(""));

  const pick = (f) => races.filter((r) => {
    if (f === "zusammen") return isTogether(r);
    if (f !== "alle") return runnersOf(r).includes(f);
    return true;
  });

  const STATUS = { dns: "nicht gestartet", dnf: "nicht ins Ziel gekommen" };
  const badge = (r) => (isTogether(r) ? '<span class="badge-together">Zusammen</span>' : "");
  const isHighlight = (r) => (r.fotos || []).length > 0 || !!r.notiz;

  const raceHTML = (r) => `<li class="race row g-2 g-lg-0 align-items-center">
      <span class="col-6 col-lg-2 race-date order-1">${fmtDate(r.datum)}</span>
      <div class="col-12 col-lg-4 order-3 order-lg-2">
        <p class="race-name">${esc(r.name)}${badge(r)}</p>
        <p class="race-ort">${esc(r.ort)}</p>
      </div>
      <span class="col-6 col-lg-1 text-end race-km order-2 order-lg-3">${fmtKm(r.km)}<small class="d-lg-none"> km</small></span>
      ${timesHTML(r, "col-12 col-lg-5 ps-lg-4 order-4")}
    </li>`;

  const cardHTML = (r) => {
    const fotos = r.fotos || [];
    return `<div class="col-md-6 col-xl-4">
      <article class="hl-card">
        ${fotos.length ? `<button type="button" class="hl-photo" data-race="${races.indexOf(r)}" data-i="0"
            aria-label="${fotos.length > 1 ? `Alle ${fotos.length} Fotos ansehen` : "Foto ansehen"}">
          <img src="uploads/rennen/thumb/${esc(fotos[0].datei)}" alt="" loading="lazy" width="640" height="400">
          ${fotos.length > 1 ? `<span class="hl-count">${fotos.length} Fotos</span>` : ""}
        </button>` : ""}
        <div class="hl-body">
          <p class="race-date">${fmtDate(r.datum)}${r.ort ? " · " + esc(r.ort) : ""}</p>
          <p class="race-name">${esc(r.name)}${badge(r)}</p>
          ${r.notiz ? `<p class="hl-note">„${esc(r.notiz)}“</p>` : ""}
          <div class="hl-foot"><span class="race-km">${fmtKm(r.km)}<small> km</small></span>${timesHTML(r, "")}</div>
        </div>
      </article>
    </div>`;
  };

  function timesHTML(r, cls) {
    return `<ul class="race-times list-unstyled m-0 ${cls}">${runnersOf(r)
        .map((id) => `<li><span class="pdot ${pcls(id)}"></span>${esc(name(id))} ${statusOf(r, id)
          ? show.status ? `<abbr class="race-status" title="${STATUS[statusOf(r, id)]}">${statusOf(r, id).toUpperCase()}</abbr>` : ""
          : !show.zeiten ? ""
          : r.zeiten[id]
          ? `<strong>${esc(r.zeiten[id])}</strong>`
          : '<span class="time-missing">Zeit folgt</span>'}${show.startnummern && bibOf(r, id)
          ? `<span class="race-bib"><span class="visually-hidden">Startnummer </span>#${bibOf(r, id)}</span>` : ""}</li>`)
        .join("")}${show.zeiten && r.inoffiziell ? '<li class="race-unofficial">ohne offizielle Zeitnahme</li>' : ""}</ul>`;
  }

  // Aufgeklappte Jahre bleiben beim Filtern offen; am Anfang nur das neueste
  const openYears = new Set();
  let filter = "alle";
  const render = () => {
    const list = pick(filter);
    const byYear = new Map();
    list.forEach((r) => {
      const y = r.datum.slice(0, 4);
      byYear.set(y, [...(byYear.get(y) || []), r]);
    });
    const years = [...byYear.keys()];  // neueste zuerst, wie races
    if (!openYears.size && years.length) openYears.add(years[0]);

    // Jahresband: alt -> neu, Balken = Anzahl Rennen
    const max = Math.max(1, ...[...byYear.values()].map((l) => l.length));
    put("#year-band", years.length > 1 ? [...years].reverse().map((y) => `<button type="button" class="year-chip" data-year="${y}"
        aria-pressed="${openYears.has(y)}" aria-label="${y}: ${byYear.get(y).length} Rennen">
        <span class="year-bar"><span style="height:${Math.round((byYear.get(y).length / max) * 100)}%"></span></span>${y}
      </button>`).join("") : "");

    put("#races", years.length ? years.map((y) => {
      const l = byYear.get(y);
      const km = l.reduce((sum, r) => sum + r.km, 0);
      const tog = l.filter(isTogether).length;
      const hl = l.filter(isHighlight), rest = l.filter((r) => !isHighlight(r));
      return `<details class="tile race-year" id="jahr-${y}" data-year="${y}" ${openYears.has(y) ? "open" : ""}>
        <summary class="year-head">
          <span class="year-n">${y}</span>
          <span class="year-sum">${l.length} Rennen · ${fmtKm(km)} km${filter !== "zusammen" ? ` · ${tog} zusammen` : ""}</span>
        </summary>
        ${hl.length ? `<div class="year-hl"><div class="row g-3">${hl.map(cardHTML).join("")}</div></div>` : ""}
        ${rest.length ? `<ol class="races list-unstyled m-0">${rest.map(raceHTML).join("")}</ol>` : ""}
      </details>`;
    }).join("") : `<p class="tile text-body-secondary">Hier ist noch nichts. Zeit, sich anzumelden.</p>`);
  };

  const racesEl = $("#races"), bandEl = $("#year-band");
  racesEl.addEventListener("toggle", (e) => {
    const y = e.target.dataset && e.target.dataset.year;
    if (!y) return;
    e.target.open ? openYears.add(y) : openYears.delete(y);
    const chip = bandEl.querySelector(`[data-year="${y}"]`);
    if (chip) chip.setAttribute("aria-pressed", e.target.open);
  }, true);  // toggle steigt nicht auf
  bandEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-year]");
    if (!b) return;
    const d = $(`#jahr-${b.dataset.year}`);
    d.open = true;
    d.scrollIntoView({ block: "start" });  // weich oder nicht regelt scroll-behavior im CSS
  });

  // ---------- Galerie ----------
  const gallery = $("#gallery");
  const car = $("#gallery-carousel");
  const updateCount = () => {
    const items = [...car.querySelectorAll(".carousel-item")];
    $("#gallery-count").textContent = items.length < 2 ? "" : `${items.findIndex((el) => el.classList.contains("active")) + 1} / ${items.length}`;
  };
  const openGallery = (ri, start) => {
    const r = races[ri];
    const fotos = r.fotos || [];
    const old = bootstrap.Carousel.getInstance(car);
    if (old) old.dispose();
    $("#gallery-title").textContent = `${r.name} · ${fmtDate(r.datum)}`;
    put("#gallery-carousel .carousel-inner", fotos.map((f, j) => `<div class="carousel-item ${j === start ? "active" : ""}">
        <figure class="m-0">
          <img src="uploads/rennen/${esc(f.datei)}" alt="${esc(f.text || `Foto ${j + 1} vom ${r.name}`)}" width="${f.w}" height="${f.h}">
          ${f.text ? `<figcaption>${esc(f.text)}</figcaption>` : ""}
        </figure>
      </div>`).join(""));
    gallery.querySelectorAll(".carousel-control-prev, .carousel-control-next").forEach((b) => (b.hidden = fotos.length < 2));
    // Tastatur übernimmt der Handler unten, damit Pfeile überall im Fenster wirken (und nicht doppelt)
    bootstrap.Carousel.getOrCreateInstance(car, { interval: false, ride: false, touch: true, keyboard: false });
    updateCount();
    bootstrap.Modal.getOrCreateInstance(gallery).show();
  };
  car.addEventListener("slid.bs.carousel", updateCount);
  gallery.addEventListener("keydown", (e) => {
    const c = bootstrap.Carousel.getInstance(car);
    if (!c) return;
    if (e.key === "ArrowLeft") c.prev();
    if (e.key === "ArrowRight") c.next();
  });
  racesEl.addEventListener("click", (e) => {
    const b = e.target.closest(".hl-photo");
    if (b) openGallery(Number(b.dataset.race), Number(b.dataset.i));
  });
  filterEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    filterEl.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === btn));
    filter = btn.dataset.f;
    render();
  });
  render();

  // ---------- Karte der Laufstädte ----------
  // Ländergrenzen liegen selbst gehostet in assets/karte/welt.json und werden erst kurz vor der Karte geladen.
  const orte = D.orte || {};
  const places = [];
  races.forEach((r) => {
    const o = orte[r.ort];
    if (!o) return;
    let p = places.find((q) => q.ort === r.ort);
    if (!p) places.push((p = { ort: r.ort, lat: o.lat, lon: o.lon, races: [] }));
    p.races.push(r);
  });
  const nextPlace = hasNext && orte[n.ort] ? { ort: n.ort, lat: orte[n.ort].lat, lon: orte[n.ort].lon, races: [], next: true } : null;

  if (!show.karte || !places.length) {
    $("#karte").remove();
    document.querySelector('#nav a[href="#karte"]').parentElement.remove();
  } else {
    const mapEl = $("#map"), panel = $("#map-panel");
    const pts = nextPlace && !places.some((p) => p.ort === nextPlace.ort) ? [...places, nextPlace] : places;
    const lats = pts.map((p) => p.lat), lons = pts.map((p) => p.lon);
    const k = Math.cos(((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI / 180);  // Länge stauchen wie auf der Karte
    const proj = (lon, lat) => [lon * k, -lat];
    let world = null, active = null;

    // Ringe: erster Punkt absolut, dann Differenzen, alles in 1/100 Grad
    const decode = (flat) => {
      const out = [];
      let x = 0, y = 0;
      for (let i = 0; i < flat.length; i += 2) { x += flat[i]; y += flat[i + 1]; out.push([x / 100, y / 100]); }
      return out;
    };
    const inside = ([x, y], ring) => {
      let hit = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    };

    const placeHTML = (p) => `<div class="map-place">
        <h3>${esc(p.ort)} <span>${p.next ? "nächster Start" : `${p.races.length} Rennen`}</span></h3>
        ${p.next ? `<p class="m-0">${esc(n.name)} · ${fmtDate(n.datum)}</p>` : `<ul class="list-unstyled m-0">${p.races.map((r) =>
          `<li><span class="map-date">${fmtDate(r.datum)}</span><span class="map-name">${esc(r.name)}${badge(r)}</span><span class="map-km">${fmtKm(r.km)} km</span></li>`).join("")}</ul>`}
      </div>`;
    const showPanel = (cluster) => {
      active = cluster ? cluster.key : null;
      mapEl.querySelectorAll(".map-pin").forEach((b) => b.setAttribute("aria-pressed", b.dataset.key === active));
      panel.innerHTML = cluster
        ? cluster.items.map(placeHTML).join("")
        : `<p class="map-hint">Auf einen Punkt tippen, um die Rennen dort zu sehen.</p>`;
    };

    const draw = () => {
      const W = mapEl.clientWidth, H = mapEl.clientHeight;
      if (!W || !H) return;
      // Ausschnitt: alle Orte mit Rand, nicht enger als ein paar Grad, auf das Seitenverhältnis der Fläche gebracht
      const xy = pts.map((p) => proj(p.lon, p.lat));
      const xs = xy.map((q) => q[0]), ys = xy.map((q) => q[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      let w = Math.max((Math.max(...xs) - Math.min(...xs)) * 1.3 + 2, 4), h = Math.max((Math.max(...ys) - Math.min(...ys)) * 1.3 + 2, 3);
      if (w / h < W / H) w = (h * W) / H; else h = (w * H) / W;
      const vx = cx - w / 2, vy = cy - h / 2;

      const paths = world.map((c) => c.rings
        .filter((ring) => ring.box[2] >= vx && ring.box[0] <= vx + w && ring.box[3] >= vy && ring.box[1] <= vy + h)
        .map((ring) => "M" + ring.xy.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L") + "Z").join(""))
        .filter(Boolean);

      // Punkte, die auf dem Bildschirm zu nah beieinander liegen, zu einem zusammenfassen (Ruhrgebiet!)
      const px = (p) => { const [x, y] = proj(p.lon, p.lat); return [((x - vx) / w) * W, ((y - vy) / h) * H]; };
      const clusters = [];
      [...pts].sort((a, b) => b.races.length - a.races.length).forEach((p) => {
        const [x, y] = px(p);
        const c = clusters.find((q) => Math.hypot(q.x - x, q.y - y) < 26);
        if (c) c.items.push(p); else clusters.push({ x, y, items: [p] });
      });
      clusters.forEach((c) => {
        c.key = c.items.map((p) => p.ort).join("|");
        c.count = c.items.reduce((s, p) => s + p.races.length, 0);
      });

      mapEl.innerHTML = `<svg viewBox="${vx} ${vy} ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
          ${paths.map((d) => `<path d="${d}"/>`).join("")}
        </svg>` + clusters.map((c) => {
          const size = c.count ? Math.min(54, 20 + Math.sqrt(c.count) * 5) : 20;
          const names = c.items.map((p) => p.ort);
          const label = names[0] + (names.length > 1 ? ` +${names.length - 1}` : "");
          return `<button type="button" class="map-pin ${c.count ? "" : "is-next"} ${c.x > W * 0.72 ? "label-left" : ""}" data-key="${esc(c.key)}" aria-pressed="${c.key === active}"
              style="left:${((c.x / W) * 100).toFixed(2)}%;top:${((c.y / H) * 100).toFixed(2)}%;--s:${size.toFixed(0)}px"
              aria-label="${esc(names.join(", "))}: ${c.count ? `${c.count} Rennen` : "nächster Start"}">
            <span class="map-dot">${c.count > 1 ? c.count : ""}</span><span class="map-label">${esc(label)}</span>
          </button>`;
        }).join("");
      mapEl._clusters = clusters;
      if (active && !clusters.some((c) => c.key === active)) showPanel(null);
    };

    mapEl.addEventListener("click", (e) => {
      const b = e.target.closest(".map-pin");
      if (b) showPanel(b.dataset.key === active ? null : mapEl._clusters.find((c) => c.key === b.dataset.key));
    });

    const load = () => fetch("assets/karte/welt.json").then((r) => r.json()).then((data) => {
      world = data.c.map((c) => ({
        name: c.n,
        rings: c.r.map((flat) => {
          const ll = decode(flat), xy = ll.map(([lon, lat]) => proj(lon, lat));
          const xs = xy.map((q) => q[0]), ys = xy.map((q) => q[1]);
          return { ll, xy, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
        }),
      }));
      // Länder zählen: in welchem Land liegt jeder Ort?
      const lands = new Set();
      places.forEach((p) => {
        const c = world.find((c) => c.rings.some((ring) => inside([p.lon, p.lat], ring.ll)));
        if (c) lands.add(c.name);
      });
      $("#map-sum").textContent = `${places.length} ${places.length === 1 ? "Ort" : "Orte"}` +
        (lands.size ? ` in ${lands.size} ${lands.size === 1 ? "Land" : "Ländern"}` : "");
      draw();
      let t;
      addEventListener("resize", () => { clearTimeout(t); t = setTimeout(draw, 150); });
    }).catch(() => { mapEl.innerHTML = `<p class="map-hint">Die Karte konnte nicht geladen werden.</p>`; });

    showPanel(null);
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { io.disconnect(); load(); }
      }, { rootMargin: "600px 0px" });
      io.observe(mapEl);
    } else {
      load();
    }
  }

  // ---------- Wunschliste ----------
  const wishes = [...(D.wunschliste || [])].sort((x, y) => x.erledigt - y.erledigt);
  if (wishes.length) {
    const done = wishes.filter((w) => w.erledigt).length;
    put("#wish-progress", `${done} von ${wishes.length} abgehakt.`);
    const bar = $("#wish-bar");
    bar.setAttribute("aria-valuenow", done);
    bar.setAttribute("aria-valuemin", 0);
    bar.setAttribute("aria-valuemax", wishes.length);
    bar.dataset.pct = (done / wishes.length) * 100;
    put("#wishlist", wishes
      .map((w) => `<li class="list-group-item ${w.erledigt ? "done" : ""}">
        <span class="wish-check" aria-hidden="true">${w.erledigt ? '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>' : ""}</span>
        <div>
          <p class="wish-name">${w.erledigt ? '<span class="visually-hidden">Erledigt: </span>' : ""}${esc(w.name)}</p>
          ${w.notiz ? `<p class="wish-note">${esc(w.notiz)}</p>` : ""}
        </div>
      </li>`)
      .join(""));
  } else if ($("#liste")) {
    $("#liste").hidden = true;
  }

  // ---------- Links ----------
  put("#links", (D.links || [])
    .map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`)
    .join(""));

  // ---------- Navigation: Linie beim Scrollen, Menü schließt nach Klick ----------
  const nav = $(".sh-nav");
  const onScroll = () => nav.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  document.querySelectorAll("#nav .nav-link").forEach((a) => a.addEventListener("click", () => {
    const c = window.bootstrap && bootstrap.Collapse.getInstance($("#nav"));
    if (c) c.hide();
  }));

  // ---------- Auftauchen + Fortschrittsbalken ----------
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const targets = document.querySelectorAll(".section, footer .tile");
  const fillBar = () => { const b = $("#wish-bar"); if (b) b.firstElementChild.style.width = b.dataset.pct + "%"; };
  if (reduce || !("IntersectionObserver" in window)) {
    fillBar();
  } else {
    targets.forEach((el) => el.classList.add("js-reveal"));
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      if (e.target.id === "liste") fillBar();
      io.unobserve(e.target);
    }), { rootMargin: "0px 0px -10% 0px" });
    targets.forEach((el) => io.observe(el));
  }
})();
