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
  const isTogether = (r) => runnersOf(r).length === people.length;
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
      if (d && r.zeiten[id] && !r.inoffiziell) {
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
  const pbPeople = people.filter((id) => pbs[id].length);
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

  // ---------- Rennen ----------
  const filterEl = put("#filter",
    [["alle", "Alle"], ["zusammen", "Zusammen"], ...people.map((id) => [id, name(id)])]
      .map(([k, label], i) => `<button type="button" class="btn" data-f="${k}" aria-pressed="${i === 0}">${esc(label)}</button>`)
      .join(""));

  const pick = (f) => races.filter((r) => {
    if (f === "zusammen") return isTogether(r);
    if (f !== "alle") return runnersOf(r).includes(f);
    return true;
  });

  const raceHTML = (r) => `<li class="race row g-2 g-lg-0 align-items-center">
      <span class="col-6 col-lg-2 race-date order-1">${fmtDate(r.datum)}</span>
      <div class="col-12 col-lg-4 order-3 order-lg-2">
        <p class="race-name">${esc(r.name)}${isTogether(r) ? '<span class="badge-together">Zusammen</span>' : ""}</p>
        <p class="race-ort">${esc(r.ort)}</p>
        ${r.notiz ? `<p class="race-note">„${esc(r.notiz)}“</p>` : ""}
        ${photoStrip(r)}
      </div>
      <span class="col-6 col-lg-1 text-end race-km order-2 order-lg-3">${fmtKm(r.km)}<small class="d-lg-none"> km</small></span>
      <ul class="col-12 col-lg-4 ps-lg-4 race-times list-unstyled m-0 order-4">${runnersOf(r)
        .map((id) => `<li><span class="pdot ${pcls(id)}"></span>${esc(name(id))} ${r.zeiten[id]
          ? `<strong>${esc(r.zeiten[id])}</strong>`
          : '<span class="time-missing">Zeit folgt</span>'}</li>`)
        .join("")}${r.inoffiziell ? '<li class="race-unofficial">ohne offizielle Zeitnahme</li>' : ""}</ul>
      <span class="col-12 col-lg-1 text-lg-end race-bib order-5">${r.startnummer ? `<span class="d-lg-none">Startnr. </span>#${r.startnummer}` : ""}</span>
    </li>`;

  const render = (f) => {
    const list = pick(f);
    put("#races", list.length ? list.map(raceHTML).join("") : `<li class="race text-body-secondary">Hier ist noch nichts. Zeit, sich anzumelden.</li>`);
  };

  // ---------- Fotos: Vorschau-Reihe + Galerie ----------
  function photoStrip(r) {
    const fotos = r.fotos || [];
    if (!fotos.length) return "";
    const ri = races.indexOf(r), SHOW = 4;
    return `<div class="race-photos">${fotos.slice(0, SHOW).map((f, j) => {
      const more = j === SHOW - 1 && fotos.length > SHOW ? fotos.length - SHOW + 1 : 0;
      return `<button type="button" class="race-photo" data-race="${ri}" data-i="${j}"
          aria-label="${more ? `Alle ${fotos.length} Fotos ansehen` : `Foto ${j + 1} von ${fotos.length} ansehen`}">
        <img src="uploads/rennen/thumb/${esc(f.datei)}" alt="" loading="lazy" width="64" height="64">
        ${more ? `<span class="more">+${more}</span>` : ""}
      </button>`;
    }).join("")}</div>`;
  }

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
  $("#races").addEventListener("click", (e) => {
    const b = e.target.closest(".race-photo");
    if (b) openGallery(Number(b.dataset.race), Number(b.dataset.i));
  });
  filterEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    filterEl.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === btn));
    render(btn.dataset.f);
  });
  render("alle");

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
