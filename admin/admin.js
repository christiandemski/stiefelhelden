(function () {
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const CSRF = $('meta[name="csrf"]').content;
  let S = JSON.parse($("#content-data").textContent);
  const ids = Object.keys(S.laeufer);
  const open = new WeakSet();   // aufgeklappte Rennen
  let dirty = false;

  const today = () => new Date().toISOString().slice(0, 10);
  const fmtDate = (iso) => iso ? new Date(iso + "T12:00:00").toLocaleDateString("de-DE") : "ohne Datum";

  // ---------- Pfade wie "rennen.3.zeiten.susen" ----------
  const getAt = (path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), S);
  const setAt = (path, v) => {
    const ks = path.split(".");
    const last = ks.pop();
    ks.reduce((o, k) => o[k], S)[last] = v;
  };

  // ---------- Bausteine ----------
  const fid = (path) => "f-" + path.replace(/\./g, "-");
  const input = (label, path, o = {}) => {
    const { type = "text", cls = "col-md-6", placeholder = "", hint = "", kind = "" } = o;
    const v = getAt(path);
    return `<div class="${cls}">
      <label class="form-label" for="${fid(path)}">${esc(label)}</label>
      <input class="form-control" id="${fid(path)}" type="${type}" data-bind="${path}" ${kind ? `data-kind="${kind}"` : ""}
        ${type === "number" ? 'step="any" inputmode="decimal"' : ""} value="${esc(v)}" placeholder="${esc(placeholder)}">
      ${hint ? `<div class="form-text">${esc(hint)}</div>` : ""}
    </div>`;
  };
  const textarea = (label, path, cls = "col-12") => `<div class="${cls}">
      <label class="form-label" for="${fid(path)}">${esc(label)}</label>
      <textarea class="form-control" id="${fid(path)}" rows="2" data-bind="${path}">${esc(getAt(path))}</textarea>
    </div>`;
  const tools = (path, { move = true } = {}) => `<div class="row-tools">
      ${move ? `<button type="button" class="icon-btn" data-act="up" data-path="${path}" aria-label="Nach oben">↑</button>
      <button type="button" class="icon-btn" data-act="down" data-path="${path}" aria-label="Nach unten">↓</button>` : ""}
      <button type="button" class="icon-btn danger" data-act="del" data-path="${path}" aria-label="Löschen">✕</button>
    </div>`;
  const empty = (txt) => `<p class="text-body-secondary m-0">${esc(txt)}</p>`;

  // Kompakte Tabellenzelle: Beschriftung steht einmal im Tabellenkopf, hier nur für Screenreader
  const cell = (label, path, o = {}) => {
    const { type = "text", placeholder = "", kind = "" } = o;
    return `<td><input class="form-control form-control-sm" type="${type}" data-bind="${path}" ${kind ? `data-kind="${kind}"` : ""}
      ${type === "number" ? 'step="any" inputmode="numeric"' : ""} value="${esc(getAt(path))}" placeholder="${esc(placeholder)}" aria-label="${esc(label)}"></td>`;
  };

  const photosHTML = (i) => {
    const fotos = S.rennen[i].fotos || [];
    return `<span class="form-label d-block">Fotos</span>
      <div class="photo-grid">
        ${fotos.map((f, j) => `<figure class="photo-item">
          <img src="../uploads/rennen/thumb/${esc(f.datei)}" alt="" loading="lazy">
          <input class="form-control form-control-sm" data-bind="rennen.${i}.fotos.${j}.text" value="${esc(f.text)}" placeholder="Bildtext (optional)" aria-label="Bildtext Foto ${j + 1}">
          <div class="photo-tools">
            <button type="button" class="icon-btn" data-act="up" data-path="rennen.${i}.fotos.${j}" aria-label="Nach vorn">←</button>
            <button type="button" class="icon-btn" data-act="down" data-path="rennen.${i}.fotos.${j}" aria-label="Nach hinten">→</button>
            <button type="button" class="icon-btn danger" data-act="del" data-path="rennen.${i}.fotos.${j}" aria-label="Foto löschen">✕</button>
          </div>
        </figure>`).join("")}
        <label class="photo-add">
          <input type="file" accept="image/*" multiple data-upload="${i}" class="visually-hidden">
          <span>+ Fotos</span><small>JPG, PNG, WebP</small>
        </label>
      </div>`;
  };

  // ---------- Bereiche ----------
  const views = {
    allgemein: () =>
      ids.map((id) => input(`Name (${id})`, `laeufer.${id}`, { cls: "col-md-4" })).join("") +
      input("Laufen zusammen seit", "seit", { type: "number", cls: "col-md-4", kind: "int" }) +
      input("Länge der Stiefelrunde", "stiefelrunde.distanz", { cls: "col-md-4", placeholder: "11,4 km" }),

    next: () => {
      const n = S.naechsterStart;
      return `<div class="form-check form-switch mb-3">
          <input class="form-check-input" type="checkbox" role="switch" id="has-next" data-act="toggle-next" ${n ? "checked" : ""}>
          <label class="form-check-label" for="has-next">Es steht ein Start an</label>
        </div>` + (n ? `<div class="row g-3">
          ${input("Name", "naechsterStart.name")}
          ${input("Ort", "naechsterStart.ort", { cls: "col-md-6" })}
          ${input("Datum", "naechsterStart.datum", { type: "date", cls: "col-md-6" })}
          ${input("Distanz", "naechsterStart.distanz", { cls: "col-md-6", placeholder: "10 km" })}
          <div class="col-12"><span class="form-label d-block">Wer läuft?</span>
            ${ids.map((id) => `<div class="form-check form-check-inline">
              <input class="form-check-input" type="checkbox" id="wer-${id}" data-wer="${id}" ${(n.wer || []).includes(id) ? "checked" : ""}>
              <label class="form-check-label" for="wer-${id}">${esc(S.laeufer[id])}</label></div>`).join("")}
          </div></div>` : "");
    },

    pbs: () => ids.map((id) => {
      const rows = S.bestzeiten[id] || [];
      return `<div class="sub">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <h3>${esc(S.laeufer[id])}</h3>
          <button type="button" class="btn btn-outline-secondary btn-sm rounded-pill" data-act="add-pb" data-id="${id}">+ Bestzeit</button>
        </div>
        ${rows.length ? `<div class="table-responsive"><table class="table compact-table align-middle m-0">
          <thead><tr><th class="w-dist">Distanz</th><th class="w-time">Zeit</th><th>Rennen</th><th class="w-year">Jahr</th><th class="w-tools"><span class="visually-hidden">Aktionen</span></th></tr></thead>
          <tbody>${rows.map((_, i) => {
            const p = `bestzeiten.${id}.${i}`, n = `${S.laeufer[id]}, Zeile ${i + 1}`;
            return `<tr>
              ${cell(`Distanz (${n})`, `${p}.distanz`, { placeholder: "10 km" })}
              ${cell(`Zeit (${n})`, `${p}.zeit`, { placeholder: "52:07" })}
              ${cell(`Rennen (${n})`, `${p}.rennen`)}
              ${cell(`Jahr (${n})`, `${p}.jahr`, { type: "number", kind: "int" })}
              <td>${tools(p)}</td>
            </tr>`;
          }).join("")}</tbody>
        </table></div>` : empty("Noch keine Bestzeiten.")}
      </div>`;
    }).join(""),

    rennen: () => {
      if (!S.rennen.length) return empty("Noch keine Rennen.");
      const order = S.rennen.map((_, i) => i).sort((a, b) => (S.rennen[b].datum || "9").localeCompare(S.rennen[a].datum || "9"));
      return order.map((i) => {
        const r = S.rennen[i];
        r.zeiten = r.zeiten && !Array.isArray(r.zeiten) ? r.zeiten : {};
        r.teilnehmer ||= ids.filter((id) => r.zeiten[id]);
        r.startnummern = r.startnummern && !Array.isArray(r.startnummern) ? r.startnummern : {};
        // alte gemeinsame Startnummer -> erste Person, die gelaufen ist
        if (r.startnummer != null && !Object.keys(r.startnummern).length && r.teilnehmer.length) r.startnummern[r.teilnehmer[0]] = r.startnummer;
        delete r.startnummer;
        return `<details class="race-edit" data-index="${i}" ${open.has(r) ? "open" : ""}>
          <summary><span class="sum-date">${esc(fmtDate(r.datum))}</span><span class="sum-name">${esc(r.name || "Neues Rennen")}</span><span class="sum-km">${r.km ? esc(String(r.km).replace(".", ",")) + " km" : ""}</span></summary>
          <div class="row g-3 pt-3">
            ${input("Name", `rennen.${i}.name`)}
            ${input("Ort", `rennen.${i}.ort`)}
            ${input("Datum", `rennen.${i}.datum`, { type: "date", cls: "col-6 col-md-4" })}
            ${input("Kilometer", `rennen.${i}.km`, { type: "number", cls: "col-6 col-md-4", kind: "num", placeholder: "10" })}
            ${ids.map((id) => `<div class="col-md-6">
              <div class="runner-time">
                <div class="form-check m-0">
                  <input class="form-check-input" type="checkbox" id="teil-${i}-${id}" data-teil="${i}" data-id="${id}" ${r.teilnehmer.includes(id) ? "checked" : ""}>
                  <label class="form-check-label" for="teil-${i}-${id}">${esc(S.laeufer[id])} ist gelaufen</label>
                </div>
                <div class="d-flex gap-2">
                  <input class="form-control" data-bind="rennen.${i}.zeiten.${id}" value="${esc(r.zeiten[id])}" placeholder="Zeit, z. B. 52:07" aria-label="Zeit ${esc(S.laeufer[id])}">
                  <input class="form-control nr-input" type="number" inputmode="numeric" data-bind="rennen.${i}.startnummern.${id}" data-kind="int" value="${esc(r.startnummern[id])}" placeholder="Startnr." aria-label="Startnummer ${esc(S.laeufer[id])}">
                </div>
              </div>
            </div>`).join("")}
            <div class="col-12"><div class="form-check">
              <input class="form-check-input" type="checkbox" id="inoff-${i}" data-bind="rennen.${i}.inoffiziell" ${r.inoffiziell ? "checked" : ""}>
              <label class="form-check-label" for="inoff-${i}">Keine offizielle Zeitnahme <span class="text-body-secondary">(zählt nicht für Bestzeiten)</span></label>
            </div></div>
            ${textarea("Notiz (ein Satz, optional)", `rennen.${i}.notiz`)}
            <div class="col-12">${photosHTML(i)}</div>
            <div class="col-12 text-end"><button type="button" class="btn btn-outline-danger btn-sm rounded-pill" data-act="del" data-path="rennen.${i}">Rennen löschen</button></div>
          </div>
        </details>`;
      }).join("");
    },

    liste: () => S.wunschliste.length ? `<div class="table-responsive"><table class="table compact-table align-middle m-0">
        <thead><tr><th class="w-check">Geschafft</th><th class="w-name">Rennen</th><th>Notiz</th><th class="w-tools"><span class="visually-hidden">Aktionen</span></th></tr></thead>
        <tbody>${S.wunschliste.map((w, i) => `<tr>
          <td class="text-center"><input class="form-check-input m-0" type="checkbox" data-bind="wunschliste.${i}.erledigt" ${w.erledigt ? "checked" : ""} aria-label="Geschafft (Zeile ${i + 1})"></td>
          ${cell(`Rennen (Zeile ${i + 1})`, `wunschliste.${i}.name`)}
          ${cell(`Notiz (Zeile ${i + 1})`, `wunschliste.${i}.notiz`)}
          <td>${tools(`wunschliste.${i}`)}</td>
        </tr>`).join("")}</tbody>
      </table></div>` : empty("Die Liste ist leer."),

    links: () => S.links.length ? `<div class="table-responsive"><table class="table compact-table align-middle m-0">
        <thead><tr><th class="w-label">Text</th><th>Adresse</th><th class="w-tools"><span class="visually-hidden">Aktionen</span></th></tr></thead>
        <tbody>${S.links.map((_, i) => `<tr>
          ${cell(`Text (Link ${i + 1})`, `links.${i}.label`, { placeholder: "Instagram" })}
          ${cell(`Adresse (Link ${i + 1})`, `links.${i}.url`, { type: "url", placeholder: "https://…" })}
          <td>${tools(`links.${i}`)}</td>
        </tr>`).join("")}</tbody>
      </table></div>` : empty("Keine Links."),
  };

  const render = (...names) => {
    (names.length ? names : Object.keys(views)).forEach((n) => {
      const el = $(`[data-render="${n}"]`);
      if (el) el.innerHTML = views[n]();
    });
  };

  // ---------- Zustand ----------
  const status = $("#save-status"), saveBtn = $("#save");
  const setDirty = (d) => {
    dirty = d;
    saveBtn.disabled = !d;
    status.textContent = d ? "Ungespeicherte Änderungen" : status.textContent;
    status.classList.toggle("is-dirty", d);
  };

  const alertBox = (type, html) => {
    $("#alerts").innerHTML = `<div class="alert alert-${type} alert-dismissible" role="alert">${html}
      <button type="button" class="btn-close" data-act="close-alert" aria-label="Schließen"></button></div>`;
    $("#alerts").scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  // ---------- Eingaben ----------
  const editor = $("#editor");
  editor.addEventListener("input", (e) => {
    const el = e.target;
    if (!el.dataset.bind) return;
    let v = el.type === "checkbox" ? el.checked : el.value;
    if (el.dataset.kind === "int") v = v === "" ? null : parseInt(v, 10);
    if (el.dataset.kind === "num") v = v === "" ? null : Number(v);
    setAt(el.dataset.bind, v);
    setDirty(true);

    // Zeit oder Startnummer eingetragen = gelaufen
    const m = /^rennen\.(\d+)\.(?:zeiten|startnummern)\.(\w+)$/.exec(el.dataset.bind);
    if (m && v != null && v !== "") {
      const r = S.rennen[m[1]];
      if (!r.teilnehmer.includes(m[2])) {
        r.teilnehmer = ids.filter((id) => id === m[2] || r.teilnehmer.includes(id));
        const box = $(`#teil-${m[1]}-${m[2]}`);
        if (box) box.checked = true;
      }
    }

    // Kopfzeile eines Rennens live mitziehen
    const d = el.closest(".race-edit");
    if (d) {
      const r = S.rennen[d.dataset.index];
      d.querySelector(".sum-name").textContent = r.name || "Neues Rennen";
      d.querySelector(".sum-date").textContent = fmtDate(r.datum);
      d.querySelector(".sum-km").textContent = r.km ? String(r.km).replace(".", ",") + " km" : "";
    }
  });

  editor.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.upload !== undefined) {
      upload(Number(el.dataset.upload), [...el.files]);
      el.value = "";
      return;
    }
    if (el.dataset.wer) {
      S.naechsterStart.wer = ids.filter((id) => $(`#wer-${id}`).checked);
      setDirty(true);
    }
    if (el.dataset.teil !== undefined) {
      const i = el.dataset.teil;
      S.rennen[i].teilnehmer = ids.filter((id) => $(`#teil-${i}-${id}`).checked);
      setDirty(true);
    }
    if (el.dataset.act === "toggle-next") {
      S.naechsterStart = el.checked ? { name: "", ort: "", datum: today(), distanz: "", wer: [...ids] } : null;
      render("next");
      setDirty(true);
    }
  });

  editor.addEventListener("toggle", (e) => {
    const d = e.target.closest && e.target.closest(".race-edit");
    if (d) (d.open ? open.add(S.rennen[d.dataset.index]) : open.delete(S.rennen[d.dataset.index]));
  }, true);

  editor.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || b.type === "checkbox") return;
    const act = b.dataset.act;

    if (act === "close-alert") { $("#alerts").innerHTML = ""; return; }
    if (act === "restore") { restore(b.dataset.file); return; }

    if (act === "add-pb") {
      (S.bestzeiten[b.dataset.id] ||= []).push({ distanz: "", zeit: "", rennen: "", jahr: new Date().getFullYear() });
      render("pbs");
    } else if (act === "add-race") {
      const r = { name: "", ort: "", datum: today(), km: null, zeiten: {}, startnummern: {}, teilnehmer: [...ids], notiz: "" };
      S.rennen.push(r);
      open.add(r);
      render("rennen");
      const d = $(`.race-edit[data-index="${S.rennen.length - 1}"] input`);
      if (d) d.focus();
    } else if (act === "add-wish") {
      S.wunschliste.push({ name: "", notiz: "", erledigt: false });
      render("liste");
    } else if (act === "add-link") {
      S.links.push({ label: "", url: "https://" });
      render("links");
    } else if (act === "del" || act === "up" || act === "down") {
      const ks = b.dataset.path.split(".");
      const i = Number(ks.pop());
      const arr = getAt(ks.join("."));
      if (act === "del") arr.splice(i, 1);
      else {
        const j = act === "up" ? i - 1 : i + 1;
        if (j < 0 || j >= arr.length) return;
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      render(ks[0] === "bestzeiten" ? "pbs" : ks[0] === "wunschliste" ? "liste" : ks[0]);
    } else {
      return;
    }
    setDirty(true);
  });

  // ---------- Speichern ----------
  const api = async (action, body) => {
    const res = await fetch(`api.php?action=${action}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json", "X-CSRF-Token": CSRF } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({ error: "Unerwartete Antwort vom Server." }));
    if (res.status === 401) data.error = 'Die Anmeldung ist abgelaufen. <a href="./">Neu anmelden</a> (Änderungen vorher kopieren).';
    return { ok: res.ok, data };
  };

  const showError = (data) => alertBox("danger",
    `<strong>${data.error ?? "Fehler."}</strong>` +
    (data.details ? `<ul class="mb-0 mt-2">${data.details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""));

  const save = async () => {
    if (!dirty) return;
    saveBtn.disabled = true;
    status.textContent = "Speichert …";
    const { ok, data } = await api("save", S);
    if (!ok) {
      showError(data);
      status.textContent = "Nicht gespeichert";
      saveBtn.disabled = false;
      return;
    }
    S = data.content;
    $("#alerts").innerHTML = "";
    render();
    setDirty(false);
    status.textContent = "Gespeichert um " + new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    loadBackups();
  };
  saveBtn.addEventListener("click", save);
  addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
  });
  addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  // ---------- Fotos hochladen ----------
  // Im Browser verkleinern: kleine Uploads, Hochkant-Fotos richtig gedreht, Handy-Formate (HEIC in Safari) gehen auch.
  const shrink = async (file) => {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const s = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error())), "image/jpeg", 0.88));
  };

  const upload = async (i, files) => {
    const race = S.rennen[i];
    race.fotos ||= [];
    const problems = [];
    for (const [n, file] of files.entries()) {
      status.textContent = `Lade Foto ${n + 1} von ${files.length} hoch …`;
      let blob;
      try { blob = await shrink(file); } catch (err) {
        problems.push(`${file.name}: Format wird vom Browser nicht unterstützt (bitte als JPG exportieren).`);
        continue;
      }
      const fd = new FormData();
      fd.append("foto", blob, "foto.jpg");
      try {
        const res = await fetch("api.php?action=upload", { method: "POST", headers: { "X-CSRF-Token": CSRF }, body: fd, credentials: "same-origin" });
        const data = await res.json().catch(() => ({ error: "Unerwartete Antwort vom Server." }));
        if (!res.ok) { problems.push(`${file.name}: ${data.error}`); continue; }
        race.fotos.push({ datei: data.datei, text: "", w: data.w, h: data.h });
      } catch (err) {
        problems.push(`${file.name}: keine Verbindung zum Server.`);
      }
    }
    open.add(race);
    render("rennen");
    setDirty(true);
    status.textContent = "Fotos hochgeladen – jetzt speichern";
    if (problems.length) alertBox("warning", `<strong>Nicht alle Fotos hat es geklappt:</strong><ul class="mb-0 mt-2">${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`);
  };

  // ---------- Sicherungen ----------
  const loadBackups = async () => {
    const el = $('[data-render="backups"]');
    const { ok, data } = await api("backups");
    if (!ok) { el.innerHTML = empty(data.error || "Konnte Sicherungen nicht laden."); return; }
    el.innerHTML = data.backups.length ? `<ul class="list-unstyled m-0 backup-list">${data.backups.map((b) => `<li>
        <span>${new Date(b.time * 1000).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}</span>
        <button type="button" class="btn btn-outline-secondary btn-sm rounded-pill" data-act="restore" data-file="${esc(b.file)}">Wiederherstellen</button>
      </li>`).join("")}</ul>` : empty("Noch keine Sicherungen – die erste entsteht beim ersten Speichern.");
  };

  const restore = async (file) => {
    if (dirty && !confirm("Ungespeicherte Änderungen gehen verloren. Trotzdem diesen Stand wiederherstellen?")) return;
    if (!dirty && !confirm("Diesen Stand wiederherstellen? Der aktuelle Stand wird vorher gesichert.")) return;
    const { ok, data } = await api("restore", { file });
    if (!ok) { showError(data); return; }
    S = data.content;
    render();
    setDirty(false);
    status.textContent = "Stand wiederhergestellt";
    alertBox("success", "Stand wiederhergestellt und veröffentlicht.");
    loadBackups();
  };

  render();
  loadBackups();
})();
