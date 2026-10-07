/* CZECHENDURO – samostatná HTML verze (jeden soubor, funguje i z disku).
   Stránky jsou předgenerované Next.js buildem v <template>, tento skript zajišťuje
   přepínání stránek (#/cesta) a interaktivní části bez Reactu. */
(function () {
  "use strict";
  var DATA = window.CE_DATA || JSON.parse(document.getElementById("ce-data").textContent);
  /* Dva režimy: jeden soubor (#/cesta) nebo vícestránkový web (GitHub Pages) s relativními odkazy. */
  var MULTI = document.body.hasAttribute("data-route");
  var REL = document.body.getAttribute("data-rel") || "";
  function u(path) { return MULTI ? REL + (path === "/" ? "" : path.slice(1) + "/") : "#" + path; }
  var ICONS = DATA.icons;
  var main = document.getElementById("obsah");
  var timers = [];
  var NBSP = "\u00a0";

  /* ---------- čas Europe/Prague ---------- */
  var dtf = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Prague", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  function offset(date) {
    var p = {};
    dtf.formatToParts(date).forEach(function (x) { p[x.type] = x.value; });
    var asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  }
  function pragueTime(local) {
    var parts = local.split("T"), d = parts[0].split("-").map(Number), t = (parts[1] || "00:00").split(":").map(Number);
    var naive = Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]);
    var first = offset(new Date(naive)), ts = naive - first * 60000, second = offset(new Date(ts));
    if (second !== first) ts = naive - second * 60000;
    return new Date(ts);
  }
  function nextDay(iso) { var d = iso.split("-").map(Number); return new Date(Date.UTC(d[0], d[1] - 1, d[2] + 1)).toISOString().slice(0, 10); }
  function fmtDate(iso) { var d = iso.slice(0, 10).split("-").map(Number); return d[2] + "." + NBSP + d[1] + "." + NBSP + d[0]; }
  function fmtRange(a, b) {
    var x = a.split("-").map(Number), y = b.split("-").map(Number);
    if (x[0] === y[0] && x[1] === y[1]) return x[2] + ".–" + y[2] + "." + NBSP + x[1] + "." + NBSP + x[0];
    return x[2] + "." + NBSP + x[1] + ".–" + y[2] + "." + NBSP + y[1] + "." + NBSP + y[0];
  }
  function fmtDateTime(local) { var p = local.split("T"); return fmtDate(p[0]) + ", " + p[1].replace(/^0/, ""); }

  var simOffset = 0;
  (function () {
    var m = /[?&]now=([^&#]+)/.exec(window.location.search);
    if (m) simOffset = pragueTime(decodeURIComponent(m[1])).getTime() - Date.now();
  })();
  function now() { return new Date(Date.now() + simOffset); }

  /* ---------- stav registrace (shodné s lib/status.ts) ---------- */
  var LABEL = { soon: "Registrace brzy", open: "Registrace otevřena", late: "Pozdní registrace +300 Kč", closed: "Registrace uzavřena", live: "Právě probíhá", finished: "Proběhlo" };
  var CHIP = { soon: "chip", open: "chip chip-accent", late: "chip chip-accent", closed: "chip", live: "chip bg-ink text-white", finished: "chip" };
  var ORDER = ["soon", "open", "late", "closed", "live", "finished"];
  function raceEnd(r) { return pragueTime(nextDay(r.dateEnd) + "T00:00"); }
  function state(r, n) {
    var reg = r.registration || r, t = n.getTime();
    if (t >= raceEnd(r).getTime()) return "finished";
    if (t >= pragueTime(r.dateStart + "T00:00").getTime()) return "live";
    if (t >= pragueTime(reg.lateUntil).getTime() + 60000) return "closed";
    if (t >= pragueTime(reg.closes).getTime() + 60000) return "late";
    if (t >= pragueTime(reg.opens).getTime()) return "open";
    return "soon";
  }
  function nextRace(n) {
    return DATA.races.slice().sort(function (a, b) { return a.order - b.order; }).filter(function (r) { return n.getTime() < raceEnd(r).getTime(); })[0] || null;
  }
  function raceBySlug(s) { return DATA.races.filter(function (r) { return r.slug === s; })[0]; }

  /* ---------- pomocné ---------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function icon(name, cls) { return ICONS[name].replace('class="', 'class="' + (cls ? cls + " " : "")); }
  function vlna(t) { return t.replace(/(^|[\s\u00a0(„])([ksvzouai])\s+/gi, "$1$2\u00a0").replace(/(\d)\s+(km|Kč|%|ccm|cc|let|míst)(?=$|[\s.,;:)])/g, "$1\u00a0$2"); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function plural(n, a, b, c) { return n === 1 ? a : n >= 2 && n <= 4 ? b : c; }
  function every(ms, fn) { fn(); timers.push(setInterval(fn, ms)); }

  /* ---------- štítky stavu ---------- */
  function initStatuses() {
    $all("[data-status]").forEach(function (el) {
      var r = JSON.parse(el.getAttribute("data-status"));
      var withDate = el.getAttribute("data-with-date") === "1";
      var holder = document.createElement("span");
      el.replaceWith(holder);
      every(30000, function () {
        var s = state(r, now());
        holder.className = CHIP[s];
        holder.innerHTML = '<span class="dot" aria-hidden="true"></span>' + LABEL[s] + (withDate && s === "soon" ? '<span class="font-medium">od ' + fmtDateTime(r.opens) + "</span>" : "");
      });
    });
  }

  /* ---------- karta Další závod + odpočet ---------- */
  function countdownUnit(key, label) {
    return '<div class="flex flex-col"><span class="font-display text-[clamp(1.75rem,4.6vw,2.5rem)] leading-none num" aria-hidden="true" data-u="' + key + '"></span><span class="mt-1.5 text-[11px] uppercase tracking-[0.12em] text-ink-2" data-l="' + key + '">' + label + "</span></div>";
  }
  function setDigits(el, str) {
    var cur = el.getAttribute("data-v") || "";
    if (cur.length !== str.length) {
      el.innerHTML = str.split("").map(function (d) { return '<span class="relative inline-block h-[1em] w-[0.86em] overflow-hidden text-center align-top"><span class="digit-roll block">' + d + "</span></span>"; }).join("");
    } else {
      for (var i = 0; i < str.length; i++) if (cur[i] !== str[i]) el.children[i].innerHTML = '<span class="digit-roll block">' + str[i] + "</span>";
    }
    el.setAttribute("data-v", str);
  }
  function initNextRace() {
    var card = document.querySelector("[data-next-race]");
    if (!card) return;
    var last = "";
    every(1000, function () {
      var n = now(), r = nextRace(n), total = DATA.races.length, season = DATA.season;
      var key = r ? r.slug + ":" + state(r, n) : "end";
      if (key !== last) {
        last = key;
        if (!r) {
          card.innerHTML = '<div><p class="eyebrow">Sezóna ' + season + '</p><h2 class="h3 mt-2">Sezóna ' + season + ' je u konce</h2><p class="mt-3 text-[15px]">Všechny ' + total + ' podniky seriálu proběhly. Výsledky najdete ve výsledkovém servisu.</p><div class="mt-6 flex flex-wrap gap-2"><a href="' + u("/vysledky") + '" class="btn btn-primary">' + icon("trophy") + ' Výsledky sezóny</a><a href="' + u("/zavody") + '" class="btn btn-glass">Kalendář ' + season + "</a></div></div>";
        } else {
          var s = state(r, n), can = s === "open" || s === "late", reg = r.registration;
          var chip = can ? "chip chip-accent" : s === "live" ? "chip bg-ink text-white" : "chip";
          var note = s === "soon" ? "Registrace se otevře " + fmtDateTime(reg.opens) + "." : s === "late" ? "Pozdní registrace do " + fmtDateTime(reg.lateUntil) + " s příplatkem 300 Kč." : s === "open" ? "Řádná registrace do " + fmtDateTime(reg.closes) + "." : "";
          card.innerHTML =
            '<div><div class="flex flex-wrap items-center justify-between gap-2"><p class="eyebrow">Další závod · ' + r.order + "/" + total + '</p><span class="' + chip + '"><span class="dot" aria-hidden="true"></span> ' + LABEL[s] + "</span></div>" +
            '<h2 class="h3 mt-3"><a href="' + u("/zavody/" + r.slug) + '" class="hover:text-accent-ink">' + esc(r.name) + "</a></h2>" +
            '<dl class="mt-3 grid gap-1.5 text-[15px]"><div class="flex items-center gap-2"><dt class="sr-only">Termín</dt>' + icon("calendarDays", "text-ink-2") + '<dd class="num">' + fmtRange(r.dateStart, r.dateEnd) + '</dd></div><div class="flex items-start gap-2"><dt class="sr-only">Místo</dt>' + icon("mapPin", "mt-1 text-ink-2") + "<dd>" + esc(r.place) + "</dd></div></dl>" +
            '<div class="mt-5 border-t border-black/[0.08] pt-5">' + (s === "live" ? '<p class="font-display text-xl">Závod právě probíhá</p>' : '<div role="timer" aria-live="off"><p class="sr-only" data-cd-sr></p><div class="flex items-end gap-4 sm:gap-6">' + countdownUnit("d", "dní") + countdownUnit("h", "hod") + countdownUnit("m", "min") + countdownUnit("s", "s") + "</div></div>") + (note ? '<p class="mt-3 text-sm text-ink-2">' + note + "</p>" : "") + "</div>" +
            '<div class="mt-6 flex flex-wrap gap-2">' + (can && r.links.register ? '<a href="' + r.links.register + '" target="_blank" rel="noopener" class="btn btn-primary">Přihlásit se ' + icon("arrowUpRight") + "</a>" : "") + '<a href="' + u("/zavody/" + r.slug) + '" class="' + (can ? "btn btn-glass" : "btn btn-primary") + '">Detail závodu</a></div></div>';
        }
      }
      if (r && state(r, n) !== "live") {
        var diff = Math.max(0, pragueTime(r.dateStart + "T09:00").getTime() - n.getTime()), sec = Math.floor(diff / 1000);
        var d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60;
        var pad = function (v, l) { return String(v).padStart(l || 2, "0"); };
        setDigits(card.querySelector('[data-u="d"]'), pad(d, d > 99 ? 3 : 2));
        setDigits(card.querySelector('[data-u="h"]'), pad(h));
        setDigits(card.querySelector('[data-u="m"]'), pad(m));
        setDigits(card.querySelector('[data-u="s"]'), pad(x));
        card.querySelector('[data-l="d"]').textContent = plural(d, "den", "dny", "dní");
        card.querySelector("[data-cd-sr]").textContent = "Do startu zbývá " + d + " " + plural(d, "den", "dny", "dní") + " a " + h + " " + plural(h, "hodina", "hodiny", "hodin") + ".";
      }
    });
  }

  /* ---------- timeline sezóny ---------- */
  function initSeason() {
    var items = $all("[data-season]");
    if (!items.length) return;
    every(30000, function () {
      var n = now(), nx = nextRace(n);
      items.forEach(function (li) {
        var r = raceBySlug(li.getAttribute("data-season")), s = state(r, n), isNext = nx && nx.slug === r.slug;
        li.querySelector("[data-node]").className = "relative z-10 flex h-10 w-10 flex-none items-center justify-center rounded-full font-display text-xs " + (isNext ? "bg-accent text-white" : s === "finished" ? "bg-ink text-white" : "border border-black/15 bg-surface");
        li.querySelector("[data-card]").className = "lift block flex-1 rounded-[20px] p-5 md:mt-5 " + (isNext ? "surface ring-2 ring-accent" : "surface");
        li.querySelector("[data-state]").innerHTML = '<span class="sr-only">Stav: </span>' + (isNext && ["open", "late", "live"].indexOf(s) < 0 ? "Další na řadě · " : "") + LABEL[s];
      });
    });
  }

  /* ---------- filtr kalendáře ---------- */
  function initRaceFilter() {
    var btns = $all("[data-race-filter]");
    if (!btns.length) return;
    var list = document.querySelector("[data-race-item]").parentElement;
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        var f = b.getAttribute("data-race-filter"), n = now(), shown = 0;
        btns.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        $all("[data-race-item]").forEach(function (li) {
          var past = n.getTime() >= raceEnd(raceBySlug(li.getAttribute("data-race-item"))).getTime();
          var vis = f === "all" || (f === "past" ? past : !past);
          li.hidden = !vis;
          if (vis) shown++;
        });
        var empty = document.querySelector("[data-race-empty]");
        if (!shown && !empty) list.insertAdjacentHTML("afterend", '<p class="surface mt-6 p-8" data-race-empty>V této sezóně už žádný další závod není. Podívejte se na výsledky nebo na proběhlé podniky.</p>');
        if (shown && empty) empty.remove();
      });
    });
  }

  /* ---------- aktuality: filtr, hledání, načíst další ---------- */
  var CAT_STYLE = { Novinky: "chip chip-accent", "Komise enduro": "chip bg-blue text-white", Informace: "chip" };
  function newsCard(item, featured) {
    return '<article class="lift surface group relative flex h-full flex-col ' + (featured ? "p-7 sm:p-10" : "p-6") + '"><div class="flex items-center justify-between gap-3"><span class="' + CAT_STYLE[item.category] + '">' + item.category + '</span><time datetime="' + item.date + '" class="num text-sm text-ink-2">' + fmtDate(item.date) + "</time></div>" +
      '<h3 class="' + (featured ? "h2 mt-8 max-w-[18ch] normal-case" : "h3 mt-6") + '"><a href="' + u("/aktuality/" + item.slug) + '" class="after:absolute after:inset-0 group-hover:text-accent-ink">' + esc(vlna(item.title)) + "</a></h3>" +
      (item.subtitle ? '<p class="mt-3 text-ink-2 ' + (featured ? "text-lg" : "text-[15px]") + '">' + esc(vlna(item.subtitle)) + "</p>" : "") + "</article>";
  }
  function fold(s) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  function initNews() {
    var root = document.querySelector("[data-news-browser]");
    if (!root) return;
    var home = root.getAttribute("data-news-browser") === "home";
    var st = { cat: "Vše", year: "Vše", q: "", limit: home ? 6 : 12 };
    var live = root.querySelector("p.sr-only[aria-live]");
    while (live.nextSibling) live.nextSibling.remove();
    var out = document.createElement("div");
    live.after(out);
    function draw() {
      var f = DATA.news.filter(function (i) {
        return (st.cat === "Vše" || i.category === st.cat) && (st.year === "Vše" || i.date.indexOf(st.year) === 0) && (!st.q || fold(i.title + " " + i.subtitle).indexOf(fold(st.q)) >= 0);
      });
      live.textContent = "Nalezeno " + f.length + " článků.";
      var shown = f.slice(0, st.limit);
      out.innerHTML = !shown.length
        ? '<p class="surface mt-6 p-8 text-center">Žádný článek neodpovídá filtru. Zkuste jinou kategorii nebo rok.</p>'
        : '<ul class="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">' + shown.map(function (it, i) { return '<li class="' + (home && i === 0 ? "md:col-span-2 lg:row-span-2" : "") + '">' + newsCard(it, home && i === 0) + "</li>"; }).join("") + "</ul>" +
          (!home && f.length > st.limit ? '<div class="mt-8 flex justify-center"><button type="button" class="btn btn-glass" data-more>Načíst další (' + (f.length - st.limit) + ")</button></div>" : "");
      var more = out.querySelector("[data-more]");
      if (more) more.addEventListener("click", function () { st.limit += 12; draw(); });
    }
    $all('[role="group"][aria-label="Kategorie"] button', root).forEach(function (b, _i, all) {
      b.addEventListener("click", function () {
        st.cat = b.textContent.trim(); st.limit = home ? 6 : 12;
        all.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        draw();
      });
    });
    var q = root.querySelector('input[type="search"]'), y = root.querySelector("select");
    if (q) q.addEventListener("input", function () { st.q = q.value; draw(); });
    if (y) y.addEventListener("change", function () { st.year = y.value; draw(); });
    draw();
  }

  /* ---------- detail závodu ---------- */
  function initRaceDetail() {
    var panel = document.querySelector("[data-race-actions]");
    if (!panel) return;
    var r = raceBySlug(panel.getAttribute("data-race-actions"));
    every(30000, function () {
      var s = state(r, now()), can = s === "open" || s === "late", fin = s === "finished";
      $all("[data-primary]").forEach(function (a) {
        a.href = fin ? DATA.resultsUrl : r.links.register;
        a.innerHTML = fin ? "Výsledky " + icon("trophy") : (can ? "Přihlásit se " : "Registrace ") + icon("arrowUpRight");
        a.classList.toggle("btn-primary", can || fin);
        a.classList.toggle("btn-ink", !(can || fin));
      });
      var old = panel.querySelector("[data-note]");
      if (old) old.remove();
      var note = s === "soon" ? "Registrace zatím není otevřená." : s === "closed" ? "Registrace je uzavřená." : "";
      var p = panel.querySelector("[data-primary]");
      if (note && p) p.insertAdjacentHTML("afterend", '<p class="mt-2 text-center text-xs text-ink-2" data-note>' + note + "</p>");
      $all("[data-step]").forEach(function (el) {
        var reached = ORDER.indexOf(s) >= ORDER.indexOf(el.getAttribute("data-step"));
        el.className = "absolute -left-8 top-1 h-[23px] w-[23px] rounded-full border-4 border-bg " + (reached ? "bg-ink" : "bg-white ring-1 ring-black/20");
      });
    });
    var links = $all('nav[aria-label="Obsah stránky závodu"] a');
    var obs = new IntersectionObserver(function (entries) {
      var vis = entries.filter(function (e) { return e.isIntersecting; }).sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });
      if (!vis[0]) return;
      links.forEach(function (a) { if (a.getAttribute("href") === "#" + vis[0].target.id) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
    }, { rootMargin: "-20% 0px -70% 0px" });
    links.forEach(function (a) { var el = document.getElementById(a.getAttribute("href").slice(1)); if (el) obs.observe(el); });
    timers.push({ disconnect: function () { obs.disconnect(); } });
  }

  /* ---------- formulář ---------- */
  function initForm() {
    var f = document.querySelector("[data-contact-form]");
    if (!f) return;
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var d = new FormData(f), email = f.getAttribute("data-contact-form");
      var body = d.get("message") + "\n\n" + d.get("name") + " <" + d.get("email") + ">";
      window.location.href = "mailto:" + email + "?subject=" + encodeURIComponent(d.get("subject")) + "&body=" + encodeURIComponent(body);
    });
  }

  /* ---------- hlavička ---------- */
  var headerBox = document.querySelector("header > div.glass");
  var regBtn = headerBox && headerBox.querySelector("a.btn-primary");
  function onScroll() {
    var s = window.scrollY > 40;
    ["glass-strong", "h-14", "rounded-[20px]"].forEach(function (c) { headerBox.classList.toggle(c, s); });
    ["h-16", "rounded-[24px]"].forEach(function (c) { headerBox.classList.toggle(c, !s); });
    if (regBtn) regBtn.classList.toggle("sm:min-h-12", !s);
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  var menuBtn = document.querySelector("[data-menu-toggle]"), menu = document.getElementById("mobile-menu");
  function setMenu(open) {
    if (!menu) return;
    menu.hidden = !open;
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "Zavřít menu" : "Otevřít menu");
    menuBtn.innerHTML = icon(open ? "x" : "menu");
    document.body.style.overflow = open ? "hidden" : "";
  }
  if (menuBtn) menuBtn.addEventListener("click", function () { setMenu(menu.hidden); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });

  function markNav(path) {
    $all("[data-nav]").forEach(function (a) {
      var href = a.getAttribute("data-nav"), active = path === href || path.indexOf(href + "/") === 0;
      if (active) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      a.classList.toggle("bg-ink", active); a.classList.toggle("text-white", active); a.classList.toggle("hover:bg-black/5", !active);
    });
    $all("#mobile-menu a").forEach(function (a) {
      var h = a.getAttribute("href");
      if (h === u(path)) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }

  /* ---------- globální kliky ---------- */
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href^='#']");
    if (a && a.getAttribute("href").indexOf("#/") !== 0) {
      var id = a.getAttribute("href").slice(1);
      e.preventDefault();
      if (id === "top" || id === "") return window.scrollTo({ top: 0, behavior: "smooth" });
      var el = document.getElementById(id);
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); if (id === "obsah") el.focus({ preventScroll: true }); }
      return;
    }
    var c = e.target.closest && e.target.closest("[data-copy]");
    if (c) {
      var text = c.getAttribute("data-copy"), sr = c.querySelector(".sr-only");
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () {
        if (sr) sr.textContent = "Zkopírováno";
        c.classList.add("ring-2", "ring-accent");
        setTimeout(function () { c.classList.remove("ring-2", "ring-accent"); if (sr) sr.textContent = ""; }, 2000);
      }, function () { window.prompt("Zkopírujte GPS:", text); });
      return;
    }
    var sh = e.target.closest && e.target.closest("[data-share]");
    if (sh) {
      var url = window.location.href;
      if (navigator.share) navigator.share({ title: sh.getAttribute("data-share"), url: url }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(url);
      return;
    }
    if (e.target.closest && e.target.closest("[data-cookie-open]")) {
      var dlg = document.getElementById("cookie-dialog");
      if (dlg && dlg.showModal) dlg.showModal();
    }
  });

  /* ---------- router ---------- */
  function route() {
    var path = (window.location.hash.replace(/^#/, "") || "/").split("?")[0];
    if (path.charAt(0) !== "/") return; // kotva v rámci stránky
    path = decodeURIComponent(path).replace(/\/+$/, "") || "/";
    var legacy = DATA.redirects[path];
    if (legacy) { window.location.replace("#" + legacy); return; }
    var tpl = document.getElementById("r:" + path) || document.getElementById("r:404");
    timers.forEach(function (t) { if (t.disconnect) t.disconnect(); else clearInterval(t); });
    timers = [];
    main.innerHTML = "";
    main.appendChild(tpl.content.cloneNode(true));
    document.title = tpl.getAttribute("data-title") || document.title;
    setMenu(false);
    markNav(path);
    window.scrollTo(0, 0);
    initStatuses(); initNextRace(); initSeason(); initRaceFilter(); initNews(); initRaceDetail(); initForm();
    onScroll();
  }
  var yr = document.querySelector("[data-year]");
  if (yr) yr.textContent = String(now().getFullYear());
  if (MULTI) {
    markNav(document.body.getAttribute("data-route"));
    initStatuses(); initNextRace(); initSeason(); initRaceFilter(); initNews(); initRaceDetail(); initForm();
    onScroll();
  } else {
    window.addEventListener("hashchange", route);
    route();
  }
})();
