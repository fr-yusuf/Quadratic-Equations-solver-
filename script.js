"use strict";

/* ---------- Number formatting ---------- */
var MINUS = "\u2212";

function fmt(v) {
    if (!isFinite(v)) return String(v);
    if (v === 0) return "0";
    var abs = Math.abs(v);
    var s;
    if (abs >= 1e12 || abs < 1e-6) {
        s = v.toExponential(4).replace(/\.?0+e/, "e");
    } else {
        s = String(parseFloat(v.toFixed(6)));
    }
    if (s === "-0") s = "0";
    return s.replace(/-/g, MINUS);
}

function par(v) {
    return v < 0 ? "(" + fmt(v) + ")" : fmt(v);
}

// "=" when the shown value is exact, "≈" when it was rounded
function eqs(v) {
    return Math.abs(v - parseFloat(v.toFixed(6))) > 1e-12 ? "\u2248" : "=";
}

function term(coef, suffix, first) {
    if (coef === 0) return "";
    var neg = coef < 0;
    var abs = Math.abs(coef);
    var body = (abs === 1 && suffix) ? suffix : fmt(abs) + suffix;
    if (first) return (neg ? MINUS : "") + body;
    return (neg ? " " + MINUS + " " : " + ") + body;
}

function equation(a, b, c) {
    var s = "";
    s += term(a, "x\u00B2", s === "");
    s += term(b, "x", s === "");
    s += term(c, "", s === "");
    return (s === "" ? "0" : s) + " = 0";
}

function complexStrings(re, im) {
    var mag = fmt(im);
    var imag = (mag === "1" ? "" : mag) + "i";
    if (fmt(re) === "0") return [imag, MINUS + imag];
    return [fmt(re) + " + " + imag, fmt(re) + " " + MINUS + " " + imag];
}

/* ---------- The maths ---------- */
function analyze(a, b, c) {
    var eq = equation(a, b, c);

    if (a === 0) {
        if (b === 0) {
            return c === 0 ? { kind: "identity", eq: eq, c: c } : { kind: "none", eq: eq, c: c };
        }
        var x = -c / b;
        if (!isFinite(x)) return { kind: "overflow" };
        return { kind: "linear", eq: eq, a: a, b: b, c: c, x: x };
    }

    var D = b * b - 4 * a * c;
    var scale = Math.max(b * b, Math.abs(4 * a * c));
    if (Math.abs(D) <= 1e-12 * scale) D = 0;   // ignore floating-point noise

    var h = -b / (2 * a);
    var k = D === 0 ? 0 : -D / (4 * a);
    if (!isFinite(D) || !isFinite(h) || !isFinite(k)) return { kind: "overflow" };

    var base = { eq: eq, a: a, b: b, c: c, D: D, h: h, k: k };

    if (D > 0) {
        var s = Math.sqrt(D);
        // numerically stable form: avoids losing digits when b is much larger than a and c
        var q = b < 0 ? (-b + s) / 2 : -(b + s) / 2;
        var plusRoot = b < 0 ? q / a : c / q;     // root using +√D
        var minusRoot = b < 0 ? c / q : q / a;    // root using −√D
        if (!isFinite(plusRoot) || !isFinite(minusRoot)) return { kind: "overflow" };
        var naive1 = (-b + s) / (2 * a), naive2 = (-b - s) / (2 * a);
        base.kind = "two"; base.s = s; base.r1 = plusRoot; base.r2 = minusRoot;
        base.adjusted = Math.abs(naive1 - plusRoot) > 1e-9 * Math.abs(plusRoot) ||
                        Math.abs(naive2 - minusRoot) > 1e-9 * Math.abs(minusRoot);
    } else if (D === 0) {
        base.kind = "one"; base.r = h;
    } else {
        base.kind = "complex";
        base.re = h;
        base.im = Math.sqrt(-D) / (2 * Math.abs(a));
        if (!isFinite(base.im)) return { kind: "overflow" };
    }
    return base;
}

/* ---------- Build everything that gets displayed ---------- */
function buildView(r) {
    var v = { roots: "", rows: [], steps: [], graph: null, legend: [] };
    var ROOT_COL = "#F4C78B", VERT_COL = "#BFD3B0";

    function row(label, value) { v.rows.push([label, value]); }

    if (r.kind === "identity") {
        v.roots = '<div class="root">Infinitely many solutions</div><div class="sub">0 = 0 is true for every x.</div>';
        row("Type", "Identity (a = b = c = 0)");
        v.steps.push("Since a = 0, b = 0 and c = 0, the equation becomes <b>0 = 0</b>, which is always true.");
        return v;
    }

    if (r.kind === "none") {
        v.roots = '<div class="root">No solution</div><div class="sub">' + r.eq + ' is never true.</div>';
        row("Type", "Contradiction (a = b = 0, c \u2260 0)");
        v.steps.push("Since a = 0 and b = 0, the equation becomes <b>" + fmt(r.c) + " = 0</b>, which is never true.");
        return v;
    }

    if (r.kind === "linear") {
        v.roots = '<div class="root">x = ' + fmt(r.x) + '</div><div class="sub">Not quadratic (a = 0), so it is solved as a linear equation.</div>';
        row("Type", "Linear (a = 0)");
        row("Slope (b)", fmt(r.b));
        row("y-intercept", "(0, " + fmt(r.c) + ")");
        row("Root", "x = " + fmt(r.x));
        v.steps.push("Since a = 0, the x\u00B2 term disappears and the equation is linear: <b>" + r.eq + "</b>.");
        v.steps.push("Solve for x: x = \u2212c / b = " + par(-r.c) + " / " + par(r.b) + " " + eqs(r.x) + " <b>" + fmt(r.x) + "</b>.");
        v.graph = { f: function (x) { return r.b * x + r.c; }, roots: [r.x], vertex: null };
        v.legend = [[ROOT_COL, "Root"]];
        return v;
    }

    /* quadratic */
    var a = r.a, b = r.b, c = r.c, D = r.D;
    var nature = r.kind === "two" ? "Two distinct real roots"
               : r.kind === "one" ? "One repeated real root"
               : "Two complex roots";

    if (r.kind === "two") {
        v.roots = '<div class="root">x\u2081 = ' + fmt(r.r1) + '</div><div class="root">x\u2082 = ' + fmt(r.r2) + '</div><div class="sub">' + nature + '</div>';
    } else if (r.kind === "one") {
        v.roots = '<div class="root">x = ' + fmt(r.r) + '</div><div class="sub">' + nature + ' (x\u2081 = x\u2082)</div>';
    } else {
        var cs = complexStrings(r.re, r.im);
        v.roots = '<div class="root">x\u2081 = ' + cs[0] + '</div><div class="root">x\u2082 = ' + cs[1] + '</div><div class="sub">' + nature + ' (no real solutions)</div>';
    }

    row("Discriminant (D)", fmt(D));
    row("Nature of roots", nature);
    row("Parabola opens", a > 0 ? "Upward (has a minimum)" : "Downward (has a maximum)");
    row("Vertex", "(" + fmt(r.h) + ", " + fmt(r.k) + ")");
    row("Axis of symmetry", "x = " + fmt(r.h));
    row("y-intercept", "(0, " + fmt(c) + ")");

    /* steps */
    v.steps.push("Write the equation and pick out the coefficients: <b>" + r.eq + "</b>, so a = " + fmt(a) + ", b = " + fmt(b) + ", c = " + fmt(c) + ".");
    v.steps.push("Find the discriminant: D = b\u00B2 \u2212 4ac = " + par(b) + "\u00B2 \u2212 4\u00B7" + par(a) + "\u00B7" + par(c) + " = <b>" + fmt(D) + "</b>.");

    if (r.kind === "two") {
        v.steps.push("D &gt; 0, so there are two distinct real roots.");
        v.steps.push("Use the quadratic formula: x = (\u2212b \u00B1 \u221AD) / 2a.");
        v.steps.push("\u221AD = \u221A" + fmt(D) + " " + eqs(r.s) + " " + fmt(r.s) + ".");
        v.steps.push("x\u2081 = (" + par(-b) + " + " + fmt(r.s) + ") / " + par(2 * a) + " " + eqs(r.r1) + " <b>" + fmt(r.r1) + "</b>");
        v.steps.push("x\u2082 = (" + par(-b) + " \u2212 " + fmt(r.s) + ") / " + par(2 * a) + " " + eqs(r.r2) + " <b>" + fmt(r.r2) + "</b>");
        if (r.adjusted) {
            v.steps.push("Note: with such large or small coefficients, the calculator uses an equivalent, more accurate form of the formula to avoid rounding errors, so the final roots above are the accurate ones.");
        }
    } else if (r.kind === "one") {
        v.steps.push("D = 0, so there is one repeated real root.");
        v.steps.push("Use x = \u2212b / 2a = " + par(-b) + " / " + par(2 * a) + " " + eqs(r.r) + " <b>" + fmt(r.r) + "</b>.");
    } else {
        var ims = Math.sqrt(-D);
        var cs2 = complexStrings(r.re, r.im);
        v.steps.push("D &lt; 0, so there are no real roots. The roots are a complex-conjugate pair.");
        v.steps.push("Use the quadratic formula: x = (\u2212b \u00B1 \u221AD) / 2a.");
        v.steps.push("\u221AD = \u221A" + fmt(D) + " = \u221A" + fmt(-D) + "\u00B7i " + eqs(ims) + " " + fmt(ims) + "i.");
        v.steps.push("x = (" + par(-b) + " \u00B1 " + fmt(ims) + "i) / " + par(2 * a));
        v.steps.push("x\u2081 = <b>" + cs2[0] + "</b> and x\u2082 = <b>" + cs2[1] + "</b>");
    }

    /* graph */
    var roots = r.kind === "two" ? [r.r1, r.r2] : r.kind === "one" ? [r.r] : [];
    v.graph = { f: function (x) { return a * x * x + b * x + c; }, roots: roots, vertex: { h: r.h, k: r.k } };
    if (roots.length) v.legend.push([ROOT_COL, roots.length === 1 ? "Root" : "Roots"]);
    v.legend.push([VERT_COL, "Vertex"]);
    return v;
}

/* ---------- Page code (browser only) ---------- */
if (typeof document !== "undefined") {
    var ROOT_COLOR = "#F4C78B", VERTEX_COLOR = "#BFD3B0";
    var tab = document.getElementById("tab");
    var inA = document.getElementById("a");
    var inB = document.getElementById("b");
    var inC = document.getElementById("c");
    var messageEl = document.getElementById("message");
    var outputEl = document.getElementById("output");
    var rootsEl = document.getElementById("roots");
    var infoEl = document.getElementById("info");
    var graphWrap = document.getElementById("graphWrap");
    var canvas = document.getElementById("graph");
    var legendEl = document.getElementById("legend");
    var stepsEl = document.getElementById("steps");
    var currentGraph = null;

    /* one soft bounce of the front tab when Solve or Reset is touched */
    function bounceTab() {
        tab.classList.remove("bounce");
        void tab.offsetWidth;
        tab.classList.add("bounce");
    }
    tab.addEventListener("animationend", function (e) {
        if (e.animationName === "bounce") tab.classList.remove("bounce");
    });
    document.getElementById("solveBtn").addEventListener("pointerdown", bounceTab);
    document.getElementById("resetBtn").addEventListener("pointerdown", bounceTab);

    /* Material ripple: a circle spreads from the exact spot you touch */
    function addRipple(e) {
        var el = e.currentTarget;
        var rect = el.getBoundingClientRect();
        var size = Math.max(rect.width, rect.height) * 2;
        var dot = document.createElement("span");
        dot.className = "ripple";
        dot.style.width = dot.style.height = size + "px";
        dot.style.left = (e.clientX - rect.left - size / 2) + "px";
        dot.style.top = (e.clientY - rect.top - size / 2) + "px";
        el.appendChild(dot);
        dot.addEventListener("animationend", function () { dot.remove(); });
    }
    Array.prototype.forEach.call(document.querySelectorAll("[data-ripple]"), function (el) {
        el.addEventListener("pointerdown", addRipple);
    });

    function showMessage(text) {
        messageEl.textContent = text;
        messageEl.hidden = false;
        outputEl.hidden = true;
        currentGraph = null;
    }

    function niceStep(range) {
        var raw = range / 5;
        var p = Math.pow(10, Math.floor(Math.log10(raw)));
        var m = raw / p;
        var n = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10;
        return n * p;
    }

    function tickLabel(v) {
        return fmt(parseFloat(v.toPrecision(10)));
    }

    /* returns true if the graph was drawn */
    function drawGraph(g) {
        var W = canvas.clientWidth, H = canvas.clientHeight;
        if (!W || !H) return false;

        var ml = 46, mr = 12, mt = 12, mb = 26;
        var pw = W - ml - mr, ph = H - mt - mb;
        if (pw <= 10 || ph <= 10) return false;

        /* visible x range */
        var keep = [0].concat(g.roots);
        if (g.vertex) keep.push(g.vertex.h);
        var xmin = Math.min.apply(null, keep);
        var xmax = Math.max.apply(null, keep);
        var span = xmax - xmin;
        var pad = span === 0 ? 2 : span * 0.35;
        xmin -= pad;
        xmax += pad;

        /* visible y range */
        var N = 240, ymin = 0, ymax = 0, i, y;
        if (g.vertex) {
            ymin = Math.min(ymin, g.vertex.k);
            ymax = Math.max(ymax, g.vertex.k);
        }
        for (i = 0; i <= N; i++) {
            y = g.f(xmin + (xmax - xmin) * i / N);
            if (!isFinite(y)) return false;
            if (y < ymin) ymin = y;
            if (y > ymax) ymax = y;
        }
        if (ymax - ymin < 1e-12) { ymin -= 1; ymax += 1; }
        var yp = (ymax - ymin) * 0.12;
        ymin -= yp;
        ymax += yp;

        var dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        var ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);

        function X(x) { return ml + (x - xmin) / (xmax - xmin) * pw; }
        function Y(v) { return mt + (ymax - v) / (ymax - ymin) * ph; }

        /* grid + labels */
        var sx = niceStep(xmax - xmin), sy = niceStep(ymax - ymin), k, guard;
        ctx.font = "10px Poppins, sans-serif";
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(250, 243, 227, 0.12)";
        ctx.fillStyle = "rgba(250, 243, 227, 0.75)";

        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        for (k = Math.ceil(xmin / sx), guard = 0; k * sx <= xmax && guard < 100; k++, guard++) {
            var gx = X(k * sx);
            ctx.beginPath(); ctx.moveTo(gx, mt); ctx.lineTo(gx, mt + ph); ctx.stroke();
            ctx.fillText(tickLabel(k * sx), gx, mt + ph + 7);
        }

        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        for (k = Math.ceil(ymin / sy), guard = 0; k * sy <= ymax && guard < 100; k++, guard++) {
            var gy = Y(k * sy);
            ctx.beginPath(); ctx.moveTo(ml, gy); ctx.lineTo(ml + pw, gy); ctx.stroke();
            ctx.fillText(tickLabel(k * sy), ml - 6, gy);
        }

        /* axes */
        ctx.strokeStyle = "rgba(250, 243, 227, 0.6)";
        ctx.lineWidth = 1.5;
        if (xmin <= 0 && xmax >= 0) {
            ctx.beginPath(); ctx.moveTo(X(0), mt); ctx.lineTo(X(0), mt + ph); ctx.stroke();
        }
        if (ymin <= 0 && ymax >= 0) {
            ctx.beginPath(); ctx.moveTo(ml, Y(0)); ctx.lineTo(ml + pw, Y(0)); ctx.stroke();
        }

        /* axis of symmetry */
        if (g.vertex) {
            ctx.setLineDash([5, 4]);
            ctx.strokeStyle = "rgba(250, 243, 227, 0.45)";
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(X(g.vertex.h), mt); ctx.lineTo(X(g.vertex.h), mt + ph); ctx.stroke();
            ctx.setLineDash([]);
        }

        /* the curve */
        ctx.save();
        ctx.beginPath();
        ctx.rect(ml, mt, pw, ph);
        ctx.clip();
        ctx.beginPath();
        for (i = 0; i <= N; i++) {
            var xv = xmin + (xmax - xmin) * i / N;
            var px = X(xv), py = Y(g.f(xv));
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = "#FAF3E3";
        ctx.lineWidth = 2.5;
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.restore();

        /* markers */
        function dot(x, v, r, color) {
            ctx.beginPath();
            ctx.arc(X(x), Y(v), r, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = "#4A4E3B";
            ctx.stroke();
        }
        if (g.vertex) dot(g.vertex.h, g.vertex.k, 6, VERTEX_COLOR);
        for (i = 0; i < g.roots.length; i++) dot(g.roots[i], 0, 4.5, ROOT_COLOR);

        return true;
    }

    function render(v) {
        rootsEl.innerHTML = v.roots;
        infoEl.innerHTML = v.rows.map(function (r) {
            return '<div class="info-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>';
        }).join("");
        stepsEl.innerHTML = v.steps.map(function (s) { return "<li>" + s + "</li>"; }).join("");
        infoEl.hidden = v.rows.length === 0;

        messageEl.hidden = true;
        outputEl.hidden = false;

        currentGraph = v.graph;
        if (v.graph) {
            graphWrap.hidden = false;      /* must be visible before drawing */
            if (drawGraph(v.graph)) {
                legendEl.innerHTML = v.legend.map(function (l) {
                    return '<span><i style="background:' + l[0] + '"></i>' + l[1] + '</span>';
                }).join("");
            } else {
                graphWrap.hidden = true;
                currentGraph = null;
            }
        } else {
            graphWrap.hidden = true;
        }

        outputEl.classList.remove("fade-in");
        void outputEl.offsetWidth;
        outputEl.classList.add("fade-in");
    }

    function solve() {
        var raw = [inA.value, inB.value, inC.value];
        for (var i = 0; i < 3; i++) {
            if (String(raw[i]).trim() === "") {
                showMessage("Please enter a number for a, b and c (use 0 if a term is missing).");
                return;
            }
        }
        var a = Number(raw[0]), b = Number(raw[1]), c = Number(raw[2]);
        if (!isFinite(a) || !isFinite(b) || !isFinite(c)) {
            showMessage("Please enter valid numbers only.");
            return;
        }
        var result = analyze(a, b, c);
        if (result.kind === "overflow") {
            showMessage("Those numbers are too large or too small to solve accurately. Try smaller values.");
            return;
        }
        render(buildView(result));
    }

    function resetAll() {
        inA.value = "";
        inB.value = "";
        inC.value = "";
        messageEl.hidden = true;
        outputEl.hidden = true;
        graphWrap.hidden = true;
        currentGraph = null;
        inA.focus();
    }

    document.getElementById("solveBtn").addEventListener("click", solve);
    document.getElementById("resetBtn").addEventListener("click", resetAll);

    [inA, inB, inC].forEach(function (el) {
        el.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); solve(); }
        });
    });

    window.addEventListener("resize", function () {
        if (currentGraph && !graphWrap.hidden) drawGraph(currentGraph);
    });
}

/* ---------- PWA: service worker + update popup ---------- */
function showUpdatePopup(reg) {
    if (document.getElementById("update-popup")) return;   // only one popup

    var box = document.createElement("div");
    box.id = "update-popup";
    box.setAttribute("role", "alert");

    var msg = document.createElement("span");
    msg.textContent = "New version available!";

    var later = document.createElement("button");
    later.type = "button";
    later.className = "update-later";
    later.textContent = "Later";

    var update = document.createElement("button");
    update.type = "button";
    update.className = "update-btn";
    update.textContent = "Update";

    box.appendChild(msg);
    box.appendChild(later);
    box.appendChild(update);
    document.body.appendChild(box);

    later.addEventListener("click", function () { box.remove(); });

    update.addEventListener("click", function () {
        update.disabled = true;
        later.disabled = true;
        update.textContent = "Updating\u2026";
        if (reg.waiting) {
            reg.waiting.postMessage({ type: "SKIP_WAITING" });   // page reloads by itself afterwards
        } else {
            window.location.reload();
        }
    });
}

if ("serviceWorker" in navigator) {
    var hasController = !!navigator.serviceWorker.controller;
    var reloading = false;

    function checkForUpdate(reg) {
        try {
            var p = reg.update();
            if (p && p.catch) p.catch(function () { /* offline: ignore */ });
        } catch (e) { /* ignore */ }
    }

    navigator.serviceWorker.register("./sw.js").then(function (reg) {
        // a new version was downloaded earlier but not applied yet
        if (reg.waiting && navigator.serviceWorker.controller) showUpdatePopup(reg);

        // a new version has just been found
        reg.addEventListener("updatefound", function () {
            var worker = reg.installing;
            if (!worker) return;
            worker.addEventListener("statechange", function () {
                if (worker.state === "installed" && navigator.serviceWorker.controller) {
                    showUpdatePopup(reg);
                }
            });
        });

        // look for updates now, and every time the app comes back to the front
        checkForUpdate(reg);
        document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "visible") checkForUpdate(reg);
        });
    }).catch(function () { /* ignore */ });

    // reload once the new version has taken over (but not on the very first install)
    navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (!hasController) { hasController = true; return; }
        if (reloading) return;
        reloading = true;
        window.location.reload();
    });
}
