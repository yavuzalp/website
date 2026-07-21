// ============================================================================
// Pattern visual walkthroughs — interview-prep.html
// ============================================================================
// Lightweight, dependency-free SVG step-player. Each topic gets a
// `.viz-box[data-viz="<topic-id>"]` container (see interview-prep/index.html);
// this file finds them, looks up a matching entry in SCENES, and wires
// Prev/Play/Next/Reset controls around an inline SVG canvas.
//
// Design: every scene is just an array of "steps". A step is
// { caption: string, render: function(): string } where render() returns
// raw SVG markup (a string of child elements, not a full <svg> tag) for
// that step's state. Steps are intentionally plain data + closures, not a
// generic diffing engine — simplest thing that works for ~5-8 steps per
// topic, no virtual-DOM machinery needed.
// ============================================================================

(function () {
    'use strict';

    // ── Low-level SVG string builders ──────────────────────────────────────
    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function rect(x, y, w, h, opts) {
        opts = opts || {};
        return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (opts.rx != null ? opts.rx : 6) +
            '" style="fill:' + (opts.fill || 'var(--bg-surface)') + ';stroke:' + (opts.stroke || 'var(--border)') +
            ';stroke-width:' + (opts.sw || 1.5) + '"/>';
    }
    function circle(cx, cy, r, opts) {
        opts = opts || {};
        return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r +
            '" style="fill:' + (opts.fill || 'var(--bg-surface)') + ';stroke:' + (opts.stroke || 'var(--border)') +
            ';stroke-width:' + (opts.sw || 1.5) + '"/>';
    }
    function txt(x, y, s, opts) {
        opts = opts || {};
        return '<text x="' + x + '" y="' + y + '" text-anchor="' + (opts.anchor || 'middle') +
            '" style="font:' + (opts.weight || 600) + ' ' + (opts.size || 14) +
            'px \'Cascadia Code\',\'Fira Code\',monospace;fill:' + (opts.fill || 'var(--text-1)') + '">' + esc(s) + '</text>';
    }
    function line(x1, y1, x2, y2, opts) {
        opts = opts || {};
        return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
            '" style="stroke:' + (opts.stroke || 'var(--text-3)') + ';stroke-width:' + (opts.sw || 2) + '" ' +
            (opts.arrow ? 'marker-end="url(#viz-arrow)"' : '') + (opts.dash ? 'stroke-dasharray="4,3"' : '') + '/>';
    }
    function curveArrow(x1, y1, x2, y2, bend, opts) {
        opts = opts || {};
        var mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - (bend || 30);
        return '<path d="M' + x1 + ',' + y1 + ' Q' + mx + ',' + my + ' ' + x2 + ',' + y2 +
            '" style="fill:none;stroke:' + (opts.stroke || 'var(--accent)') + ';stroke-width:' + (opts.sw || 2) +
            '" marker-end="url(#viz-arrow)"/>';
    }
    var DEFS = '<defs><marker id="viz-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">' +
        '<path d="M0,0 L6,3 L0,6 Z" style="fill:var(--accent)"/></marker></defs>';

    // ── Mid-level helpers ───────────────────────────────────────────────────
    // Row of boxed values with optional highlighted cells and pointer labels
    // underneath. Used by: arrays, two-pointers, sliding-window, hashing,
    // top-k, binary-search, greedy, bits.
    function arrayRow(values, opts) {
        opts = opts || {};
        var box = opts.box || 40, gap = opts.gap || 6, x0 = opts.x || 20, y0 = opts.y || 16;
        var highlights = opts.highlights || {};   // index -> {fill, stroke}
        var pointers = opts.pointers || [];        // [{index, label, color}]
        var dimmed = opts.dimmed || {};             // index -> true (grayed out / eliminated)
        var s = '';
        for (var i = 0; i < values.length; i++) {
            var x = x0 + i * (box + gap);
            var h = highlights[i];
            var isDim = dimmed[i];
            var fill = isDim ? 'var(--border)' : (h ? h.fill : 'var(--bg-surface)');
            var stroke = isDim ? 'var(--border)' : (h ? (h.stroke || 'var(--accent)') : 'var(--border)');
            s += rect(x, y0, box, box, { fill: fill, stroke: stroke, sw: h ? 2 : 1.5 });
            s += txt(x + box / 2, y0 + box / 2 + 5, values[i], { size: 15, fill: isDim ? 'var(--text-3)' : 'var(--text-1)' });
            if (opts.showIndex !== false) {
                s += txt(x + box / 2, y0 + box + 13, i, { size: 10, fill: 'var(--text-3)', weight: 400 });
            }
        }
        var byIndex = {};
        pointers.forEach(function (p) {
            (byIndex[p.index] = byIndex[p.index] || []).push(p);
        });
        Object.keys(byIndex).forEach(function (idx) {
            var list = byIndex[idx];
            var x = x0 + (+idx) * (box + gap) + box / 2;
            var baseY = y0 + box + (opts.showIndex !== false ? 26 : 14);
            list.forEach(function (p, row) {
                var y = baseY + row * 22;
                s += txt(x, y, '▲', { fill: p.color || 'var(--accent)', size: 13 });
                s += txt(x, y + 15, p.label, { fill: p.color || 'var(--accent)', size: 11, weight: 800 });
            });
        });
        return s;
    }

    // Small bordered "title + list of lines" panel — used for hash maps,
    // BFS/DFS queues/stacks, heap contents.
    function sidePanel(x, y, w, title, lines, opts) {
        opts = opts || {};
        var lineH = 18, headerH = 22;
        var h = headerH + Math.max(1, lines.length) * lineH + 8;
        var s = rect(x, y, w, h, { fill: 'var(--bg-surface)', stroke: 'var(--border)' });
        s += txt(x + w / 2, y + 15, title, { size: 10, weight: 800, fill: 'var(--text-3)' });
        s += line(x + 6, y + headerH, x + w - 6, y + headerH, { stroke: 'var(--border)', sw: 1 });
        if (!lines.length) {
            s += txt(x + w / 2, y + headerH + lineH, '(empty)', { size: 11, fill: 'var(--text-3)', weight: 400 });
        } else {
            lines.forEach(function (ln, i) {
                s += txt(x + w / 2, y + headerH + lineH * (i + 0.7) + 6, ln, { size: 12, fill: opts.color || 'var(--text-1)' });
            });
        }
        return { svg: s, height: h };
    }

    // Horizontal number-line with colored interval bars — merge-intervals, greedy.
    function intervalTimeline(intervals, opts) {
        opts = opts || {};
        var x0 = opts.x || 20, y0 = opts.y || 30, scale = opts.scale || 26, barH = 22, rowGap = 30;
        var minV = opts.min != null ? opts.min : 0, maxV = opts.max != null ? opts.max : 20;
        var s = line(x0, y0 - 10, x0 + (maxV - minV) * scale, y0 - 10, { stroke: 'var(--border)', sw: 2 });
        for (var t = minV; t <= maxV; t += opts.step || 5) {
            var tx = x0 + (t - minV) * scale;
            s += line(tx, y0 - 14, tx, y0 - 6, { stroke: 'var(--border)', sw: 1 });
            s += txt(tx, y0 - 20, t, { size: 9, fill: 'var(--text-3)', weight: 400 });
        }
        intervals.forEach(function (iv, i) {
            var x = x0 + (iv[0] - minV) * scale;
            var w = (iv[1] - iv[0]) * scale;
            var y = y0 + i * rowGap;
            var fill = iv.color || 'var(--accent-dim)';
            var stroke = iv.stroke || 'var(--accent)';
            s += rect(x, y, w, barH, { fill: fill, stroke: stroke, sw: 2, rx: 10 });
            s += txt(x + w / 2, y + barH / 2 + 5, '[' + iv[0] + ',' + iv[1] + ']', { size: 11 });
        });
        return s;
    }

    // Linked-list row: boxed values with arrows to next(); supports a
    // curved "cycle" edge and named pointers above specific nodes.
    function linkedListRow(values, opts) {
        opts = opts || {};
        var box = 40, gap = 34, x0 = opts.x || 20, y0 = opts.y || 50;
        var pointers = opts.pointers || [];       // [{index, label, color}]
        var reversedUpTo = opts.reversedUpTo != null ? opts.reversedUpTo : -1; // edges before this index point backward
        var cycleTo = opts.cycleTo;                 // index the last node's edge loops back to
        var s = '';
        for (var i = 0; i < values.length; i++) {
            var x = x0 + i * (box + gap);
            var isNull = values[i] === null;
            s += rect(x, y0, box, box, { fill: isNull ? 'var(--border)' : 'var(--bg-surface)', stroke: 'var(--border)' });
            s += txt(x + box / 2, y0 + box / 2 + 5, isNull ? '∅' : values[i], { size: 14 });
            if (i < values.length - 1) {
                var forward = i >= reversedUpTo;
                var ax1 = forward ? x + box : x + box, ay1 = y0 + box / 2;
                if (forward) {
                    s += line(x + box, y0 + box / 2, x + box + gap, y0 + box / 2, { arrow: true, stroke: 'var(--text-2)' });
                } else {
                    s += line(x + box + gap, y0 + box / 2, x + box, y0 + box / 2, { arrow: true, stroke: 'var(--accent)' });
                }
            }
        }
        if (cycleTo != null) {
            var lastX = x0 + (values.length - 1) * (box + gap) + box / 2;
            var toX = x0 + cycleTo * (box + gap) + box / 2;
            s += curveArrow(lastX, y0, toX, y0, 40, { stroke: 'var(--accent)' });
        }
        var byIndex = {};
        pointers.forEach(function (p) { (byIndex[p.index] = byIndex[p.index] || []).push(p); });
        Object.keys(byIndex).forEach(function (idx) {
            var x = x0 + (+idx) * (box + gap) + box / 2;
            byIndex[idx].forEach(function (p, row) {
                var y = y0 - 14 - row * 20;
                s += txt(x, y, p.label, { fill: p.color || 'var(--accent)', size: 11, weight: 800 });
                s += txt(x, y + 14, '▼', { fill: p.color || 'var(--accent)', size: 12 });
            });
        });
        return s;
    }

    // Fixed-layout node/edge diagram — trees and small graphs. Positions are
    // provided per-scene (hand-laid-out, these graphs are tiny) rather than
    // computed, which keeps this simple and avoids a layout engine.
    function nodeGraph(nodes, edges, opts) {
        opts = opts || {};
        var r = opts.r || 16;
        var visited = opts.visited || {};   // id -> true (already-visited fill)
        var current = opts.current;          // id highlighted as "current"
        var dashed = opts.dashedEdges || {}; // "a-b" -> true
        var s = '';
        edges.forEach(function (e) {
            var a = nodes[e[0]], b = nodes[e[1]];
            var key = e[0] + '-' + e[1];
            s += line(a.x, a.y, b.x, b.y, { stroke: dashed[key] ? 'var(--text-3)' : 'var(--border)', sw: 2, dash: !!dashed[key] });
        });
        Object.keys(nodes).forEach(function (id) {
            var n = nodes[id];
            var fill = id === current ? 'var(--accent)' : (visited[id] ? 'var(--accent-dim)' : 'var(--bg-surface)');
            var stroke = id === current ? 'var(--accent-dark)' : 'var(--border)';
            var textColor = id === current ? '#fff' : 'var(--text-1)';
            s += circle(n.x, n.y, r, { fill: fill, stroke: stroke, sw: 2 });
            s += txt(n.x, n.y + 5, n.label != null ? n.label : id, { size: 13, fill: textColor });
        });
        return s;
    }

    // 2-D grid (DP table).
    function grid(matrix, opts) {
        opts = opts || {};
        var box = opts.box || 34, x0 = opts.x || 20, y0 = opts.y || 20;
        var current = opts.current;             // [r,c]
        var deps = opts.deps || [];              // [[r,c], ...] cells this one depends on
        var rowLabels = opts.rowLabels || [];
        var colLabels = opts.colLabels || [];
        var s = '';
        if (colLabels.length) {
            colLabels.forEach(function (cl, c) {
                s += txt(x0 + (c + 1) * box + box / 2, y0 - 6, cl, { size: 11, fill: 'var(--text-3)', weight: 400 });
            });
        }
        for (var r = 0; r < matrix.length; r++) {
            if (rowLabels.length) {
                s += txt(x0 + box / 2, y0 + (r + 1) * box + box / 2 + 5, rowLabels[r], { size: 11, fill: 'var(--text-3)', weight: 400 });
            }
            for (var c = 0; c < matrix[r].length; c++) {
                var x = x0 + (c + 1) * box, y = y0 + (r + 1) * box;
                var isCur = current && current[0] === r && current[1] === c;
                var isDep = deps.some(function (d) { return d[0] === r && d[1] === c; });
                var fill = isCur ? 'var(--accent)' : (isDep ? 'var(--accent-dim)' : 'var(--bg-surface)');
                var stroke = isCur || isDep ? 'var(--accent)' : 'var(--border)';
                s += rect(x, y, box, box, { fill: fill, stroke: stroke, sw: isCur ? 2.5 : 1.5, rx: 3 });
                var v = matrix[r][c];
                if (v !== null && v !== undefined && v !== '') {
                    s += txt(x + box / 2, y + box / 2 + 5, v, { size: 13, fill: isCur ? '#fff' : 'var(--text-1)' });
                }
            }
        }
        return s;
    }

    // ── Scene registry ──────────────────────────────────────────────────────
    // Each scene: { viewBox: "0 0 W H", steps: [{caption, render()}, ...] }
    var SCENES = {};

    // 1. Arrays & Strings — Kadane's algorithm
    SCENES['arrays'] = (function () {
        var a = [-2, 1, -3, 4, -1, 2, 1];
        var steps = [];
        var cur = a[0], max = a[0];
        steps.push({
            caption: 'Start: cur_sum = max_sum = arr[0] = ' + a[0] + '.',
            render: function () {
                return arrayRow(a, { pointers: [{ index: 0, label: 'i', color: 'var(--accent)' }] }) +
                    txt(340, 30, 'cur=' + cur, { anchor: 'start', size: 13 }) +
                    txt(340, 50, 'max=' + max, { anchor: 'start', size: 13, fill: 'var(--accent)' });
            }
        });
        for (var i = 1; i < a.length; i++) {
            var extend = cur + a[i];
            var restart = a[i];
            var choice = extend > restart ? 'extend' : 'restart';
            cur = Math.max(restart, extend);
            max = Math.max(max, cur);
            (function (i, cur, max, choice) {
                steps.push({
                    caption: 'i=' + i + ': max(' + restart_(a, i, cur) + ') → ' + choice + ', cur_sum=' + cur + (cur === max ? ' (new max!)' : ''),
                    render: function () {
                        return arrayRow(a, {
                            pointers: [{ index: i, label: 'i', color: 'var(--accent)' }],
                            highlights: mkHighlight(i, cur === max)
                        }) +
                            txt(340, 30, 'cur=' + cur, { anchor: 'start', size: 13 }) +
                            txt(340, 50, 'max=' + max, { anchor: 'start', size: 13, fill: 'var(--accent)' });
                    }
                });
            })(i, cur, max, choice);
        }
        function restart_(a, i, cur) { return 'arr[i]=' + a[i] + ', cur+arr[i]=' + cur; }
        function mkHighlight(i, isMax) {
            var h = {}; h[i] = { fill: isMax ? 'var(--accent-dim)' : 'var(--bg-surface)', stroke: 'var(--accent)' }; return h;
        }
        steps.push({ caption: 'Done — max subarray sum = ' + max + '.', render: steps[steps.length - 1].render });
        return { viewBox: '0 0 460 100', steps: steps };
    })();

    // 2. Two Pointers — meet in the middle (Two Sum II style)
    SCENES['two-pointers'] = (function () {
        var a = [2, 7, 11, 15, 20], target = 24;
        var steps = [];
        var l = 0, r = a.length - 1;
        function step(msg) {
            steps.push({
                caption: msg,
                render: function () {
                    return arrayRow(a, { pointers: [{ index: l, label: 'L', color: 'var(--accent)' }, { index: r, label: 'R', color: 'var(--cyan)' }] }) +
                        txt(300, 30, 'target=' + target, { anchor: 'start', size: 13 });
                }
            });
        }
        step('L=0, R=4. Array is sorted — converge from both ends.');
        while (l < r) {
            var sum = a[l] + a[r];
            if (sum === target) { step('sum=' + a[l] + '+' + a[r] + '=' + sum + ' = target → found the pair!'); break; }
            else if (sum < target) { l++; step('sum=' + sum + ' < target → move L right for a bigger sum.'); }
            else { r--; step('sum=' + sum + ' > target → move R left for a smaller sum.'); }
        }
        return { viewBox: '0 0 420 90', steps: steps };
    })();

    // 3. Sliding Window — longest substring without repeating characters
    SCENES['sliding-window'] = (function () {
        var s = 'abcabcbb'.split('');
        var steps = [];
        var left = 0, best = 0, seen = {};
        function render(right, extraMsg) {
            var h = {};
            for (var i = left; i <= right; i++) h[i] = { fill: 'var(--accent-dim)', stroke: 'var(--accent)' };
            return arrayRow(s, {
                highlights: h,
                pointers: [{ index: left, label: 'L', color: 'var(--accent)' }, { index: right, label: 'R', color: 'var(--cyan)' }]
            }) + txt(420, 30, 'best=' + best, { anchor: 'start', size: 13, fill: 'var(--accent)' });
        }
        for (var right = 0; right < s.length; right++) {
            var c = s[right];
            var msg;
            while (seen[c] !== undefined && seen[c] >= left) {
                msg = '"' + c + '" already in window → shrink: L moves past its last position.';
                left = seen[c] + 1;
            }
            seen[c] = right;
            best = Math.max(best, right - left + 1);
            (function (right, msg, best) {
                steps.push({
                    caption: (msg ? msg + ' ' : '') + 'Window [' + left + ',' + right + '] = "' + s.slice(left, right + 1).join('') + '", length=' + (right - left + 1) + '.',
                    render: function () { return render(right); }
                });
            })(right, msg, best);
        }
        return { viewBox: '0 0 480 90', steps: steps };
    })();

    // 4. Linked Lists — iterative reversal
    SCENES['linked-lists'] = (function () {
        var vals = [1, 2, 3, 4];
        var steps = [];
        steps.push({
            caption: 'prev=null, curr=head(1). Walk forward, flipping each link as we go.',
            render: function () { return linkedListRow(vals, { pointers: [{ index: 0, label: 'curr', color: 'var(--cyan)' }] }); }
        });
        for (var i = 0; i < vals.length; i++) {
            (function (i) {
                var pointers = [];
                if (i + 1 < vals.length) pointers.push({ index: i + 1, label: 'curr', color: 'var(--cyan)' });
                pointers.push({ index: i, label: 'prev', color: 'var(--accent)' });
                steps.push({
                    caption: 'Reverse node ' + vals[i] + '’s link to point backward; advance prev and curr.',
                    render: function () { return linkedListRow(vals, { reversedUpTo: i + 1, pointers: pointers }); }
                });
            })(i);
        }
        steps.push({
            caption: 'curr is null → done. prev is the new head: 4 → 3 → 2 → 1.',
            render: function () { return linkedListRow(vals, { reversedUpTo: vals.length, pointers: [{ index: vals.length - 1, label: 'prev', color: 'var(--accent)' }] }); }
        });
        return { viewBox: '0 0 340 100', steps: steps };
    })();

    // 5. Fast & Slow Pointers — cycle detection (LeetCode 141 shape)
    SCENES['fast-slow'] = (function () {
        var vals = [3, 2, 0, -4];
        var cycleTo = 1;
        var steps = [];
        // positions advance modulo a virtual cycle: node i's "next" is (i+1) or wraps to cycleTo after the last node
        function nextOf(i) { return i + 1 < vals.length ? i + 1 : cycleTo; }
        var slow = 0, fast = 0, step = 0;
        steps.push({
            caption: 'slow=fast=head. Node ' + (vals.length - 1) + ' loops back to node ' + cycleTo + ' — there’s a cycle.',
            render: function () { return linkedListRow(vals, { cycleTo: cycleTo, pointers: [{ index: 0, label: 'slow', color: 'var(--accent)' }, { index: 0, label: 'fast', color: 'var(--cyan)' }] }); }
        });
        for (step = 1; step <= 5; step++) {
            slow = nextOf(slow);
            fast = nextOf(nextOf(fast));
            var met = slow === fast;
            (function (slow, fast, met) {
                steps.push({
                    caption: 'slow moves 1 step, fast moves 2. ' + (met ? 'They meet — cycle confirmed!' : 'slow=' + vals[slow] + ', fast=' + vals[fast] + '.'),
                    render: function () {
                        var pointers = [];
                        if (slow === fast) pointers.push({ index: slow, label: 'slow=fast', color: 'var(--accent)' });
                        else { pointers.push({ index: slow, label: 'slow', color: 'var(--accent)' }); pointers.push({ index: fast, label: 'fast', color: 'var(--cyan)' }); }
                        return linkedListRow(vals, { cycleTo: cycleTo, pointers: pointers });
                    }
                });
            })(slow, fast, met);
            if (met) break;
        }
        return { viewBox: '0 0 320 110', steps: steps };
    })();

    // 6. Hashing — two-sum complement lookup
    SCENES['hashing'] = (function () {
        var nums = [2, 7, 11, 15], target = 9;
        var steps = [];
        var seenPairs = [];
        for (var i = 0; i < nums.length; i++) {
            var complement = target - nums[i];
            var found = seenPairs.some(function (p) { return p[0] === complement; });
            (function (i, complement, found, snapshot) {
                steps.push({
                    caption: found
                        ? 'complement=' + complement + ' IS in the map → pair found: (' + complement + ', ' + nums[i] + ')!'
                        : 'complement=' + target + '−' + nums[i] + '=' + complement + ' not in map yet → store nums[' + i + ']=' + nums[i] + '.',
                    render: function () {
                        var lines = snapshot.map(function (p) { return p[0] + ' → ' + p[1]; });
                        var h = {}; h[i] = { fill: found ? 'var(--accent-dim)' : 'var(--bg-surface)', stroke: 'var(--accent)' };
                        var panel = sidePanel(300, 4, 130, 'seen (val→idx)', lines);
                        return arrayRow(nums, { pointers: [{ index: i, label: 'i', color: 'var(--accent)' }], highlights: h }) + panel.svg;
                    }
                });
            })(i, complement, found, seenPairs.slice());
            if (found) break;
            seenPairs.push([nums[i], i]);
        }
        return { viewBox: '0 0 450 110', steps: steps };
    })();

    // 7. Stacks & Queues — monotonic stack (next greater element)
    SCENES['stacks-queues'] = (function () {
        var arr = [2, 1, 2, 4, 3];
        var steps = [];
        var stack = []; // indices
        var result = arr.map(function () { return -1; });
        for (var i = 0; i < arr.length; i++) {
            while (stack.length && arr[stack[stack.length - 1]] < arr[i]) {
                var popped = stack.pop();
                result[popped] = arr[i];
                (function (popped, i, stackSnap, resultSnap) {
                    steps.push({
                        caption: 'arr[' + i + ']=' + arr[i] + ' > arr[' + popped + ']=' + arr[popped] + ' → pop ' + popped + ', its next-greater is ' + arr[i] + '.',
                        render: function () { return sceneRender(i, stackSnap, resultSnap); }
                    });
                })(popped, i, stack.slice(), result.slice());
            }
            stack.push(i);
            (function (i, stackSnap, resultSnap) {
                steps.push({
                    caption: 'Push index ' + i + ' (value ' + arr[i] + ') — stack stays decreasing top-to-bottom.',
                    render: function () { return sceneRender(i, stackSnap, resultSnap); }
                });
            })(i, stack.slice(), result.slice());
        }
        function sceneRender(i, stackSnap, resultSnap) {
            var h = {}; h[i] = { fill: 'var(--accent-dim)', stroke: 'var(--accent)' };
            var stackLines = stackSnap.slice().reverse().map(function (idx) { return 'idx ' + idx + ' (' + arr[idx] + ')'; });
            var panel = sidePanel(280, 4, 110, 'stack (top↓)', stackLines);
            return arrayRow(arr, { highlights: h }) +
                arrayRow(resultSnap, { x: 20, y: 70, showIndex: false }) +
                txt(20, 66, 'result:', { anchor: 'start', size: 10, fill: 'var(--text-3)', weight: 400 }) +
                panel.svg;
        }
        return { viewBox: '0 0 410 130', steps: steps };
    })();

    // 8. Merge Intervals
    SCENES['merge-intervals'] = (function () {
        var input = [[1, 3], [2, 6], [8, 10], [15, 18]];
        var steps = [];
        var merged = [input[0].slice()];
        steps.push({
            caption: 'Sorted by start. First interval [1,3] begins the merged list.',
            render: function () { return timeline(input, merged, 0); }
        });
        for (var i = 1; i < input.length; i++) {
            var last = merged[merged.length - 1];
            var overlaps = input[i][0] <= last[1];
            if (overlaps) {
                last[1] = Math.max(last[1], input[i][1]);
            } else {
                merged.push(input[i].slice());
            }
            (function (i, overlaps, mergedSnap) {
                steps.push({
                    caption: overlaps
                        ? '[' + input[i][0] + ',' + input[i][1] + '] overlaps the last merged bar → extend its end to ' + mergedSnap[mergedSnap.length - 1][1] + '.'
                        : '[' + input[i][0] + ',' + input[i][1] + '] starts after the last bar ends → new separate interval.',
                    render: function () { return timeline(input, mergedSnap, i); }
                });
            })(i, overlaps, merged.map(function (m) { return m.slice(); }));
        }
        function timeline(input, merged, upTo) {
            var top = input.map(function (iv, i) {
                var c = i <= upTo ? { color: 'var(--border)', stroke: 'var(--text-3)' } : {};
                return [iv[0], iv[1], c.color, c.stroke];
            });
            var s = txt(20, 12, 'input', { anchor: 'start', size: 10, fill: 'var(--text-3)', weight: 400 });
            s += intervalTimeline(input, { y: 30, max: 20 });
            s += txt(20, 132, 'merged so far', { anchor: 'start', size: 10, fill: 'var(--text-3)', weight: 400 });
            s += intervalTimeline(merged, { y: 150, max: 20 });
            return s;
        }
        return { viewBox: '0 0 480 190', steps: steps };
    })();

    // 9. Trees — BFS level order
    SCENES['trees'] = (function () {
        // tree: 3 / (9, 20) ; 20 -> (15, 7)   (LeetCode 102 example)
        var nodes = {
            a: { x: 150, y: 26, label: 3 }, b: { x: 80, y: 76, label: 9 }, c: { x: 220, y: 76, label: 20 },
            d: { x: 185, y: 126, label: 15 }, e: { x: 255, y: 126, label: 7 }
        };
        var edges = [['a', 'b'], ['a', 'c'], ['c', 'd'], ['c', 'e']];
        var order = ['a', 'b', 'c', 'd', 'e'];
        var steps = [];
        var queue = ['a'];
        var visited = {};
        steps.push({ caption: 'Start: queue = [3].', render: function () { return nodeGraph(nodes, edges, { visited: {}, current: null }) + panel(['3']); } });
        var childrenOf = { a: ['b', 'c'], b: [], c: ['d', 'e'], d: [], e: [] };
        while (queue.length) {
            var id = queue.shift();
            visited[id] = true;
            var kids = childrenOf[id];
            queue = queue.concat(kids);
            (function (id, kids, queueSnap, visitedSnap) {
                steps.push({
                    caption: 'Dequeue ' + nodes[id].label + (kids.length ? ', enqueue its children (' + kids.map(function (k) { return nodes[k].label; }).join(', ') + ').' : ' (leaf, nothing to enqueue).'),
                    render: function () { return nodeGraph(nodes, edges, { visited: visitedSnap, current: id }) + panel(queueSnap.map(function (q) { return String(nodes[q].label); })); }
                });
            })(id, kids, queue.slice(), Object.assign({}, visited));
        }
        function panel(items) { return sidePanel(300, 10, 110, 'queue (FIFO)', items).svg; }
        return { viewBox: '0 0 430 160', steps: steps };
    })();

    // 10. Graphs — BFS on a small undirected graph
    SCENES['graphs'] = (function () {
        var nodes = {
            0: { x: 40, y: 80, label: 0 }, 1: { x: 110, y: 30, label: 1 }, 2: { x: 110, y: 130, label: 2 },
            3: { x: 190, y: 80, label: 3 }, 4: { x: 260, y: 80, label: 4 }
        };
        var edges = [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4]];
        var adj = { 0: [1, 2], 1: [0, 3], 2: [0, 3], 3: [1, 2, 4], 4: [3] };
        var steps = [];
        var queue = [0], visited = { 0: true };
        steps.push({ caption: 'Start BFS from node 0. queue=[0].', render: function () { return nodeGraph(nodes, edges, { visited: {}, current: null }) + panel([0]); } });
        while (queue.length) {
            var id = queue.shift();
            var newly = [];
            adj[id].forEach(function (nb) {
                if (!visited[nb]) { visited[nb] = true; queue.push(nb); newly.push(nb); }
            });
            (function (id, newly, queueSnap, visitedSnap) {
                steps.push({
                    caption: 'Visit node ' + id + '. ' + (newly.length ? 'Enqueue unvisited neighbors: ' + newly.join(', ') + '.' : 'All neighbors already visited.'),
                    render: function () { return nodeGraph(nodes, edges, { visited: visitedSnap, current: id }) + panel(queueSnap); }
                });
            })(id, newly, queue.slice(), Object.assign({}, visited));
        }
        function panel(items) { return sidePanel(300, 10, 110, 'queue (FIFO)', items.map(String)).svg; }
        return { viewBox: '0 0 430 160', steps: steps };
    })();

    // 11. Top K Elements — min-heap of size k (kth largest)
    SCENES['top-k'] = (function () {
        var nums = [3, 2, 1, 5, 6, 4], k = 2;
        var steps = [];
        var heap = [];
        function pushHeap(v) { heap.push(v); heap.sort(function (a, b) { return a - b; }); }
        for (var i = 0; i < nums.length; i++) {
            pushHeap(nums[i]);
            var popped = null;
            if (heap.length > k) { popped = heap.shift(); }
            (function (i, popped, heapSnap) {
                steps.push({
                    caption: 'Push ' + nums[i] + '.' + (popped != null ? ' Heap exceeds size ' + k + ' → pop smallest (' + popped + ').' : ' Heap size ≤ ' + k + ', keep growing.'),
                    render: function () {
                        var h = {}; h[i] = { fill: 'var(--accent-dim)', stroke: 'var(--accent)' };
                        var panel = sidePanel(280, 4, 120, 'min-heap (size ' + k + ')', heapSnap.map(String));
                        return arrayRow(nums, { highlights: h }) + panel.svg;
                    }
                });
            })(i, popped, heap.slice());
        }
        steps.push({
            caption: 'Heap = [' + heap.join(', ') + ']. Its smallest element is the ' + k + 'th largest overall: ' + heap[0] + '.',
            render: steps[steps.length - 1].render
        });
        return { viewBox: '0 0 420 100', steps: steps };
    })();

    // 12. Two Heaps — running median
    SCENES['two-heaps'] = (function () {
        var stream = [5, 15, 1, 3];
        var steps = [];
        var lo = [], hi = []; // lo = max-heap (desc sorted), hi = min-heap (asc sorted)
        function median() {
            if (lo.length > hi.length) return lo[0];
            return (lo[0] + hi[0]) / 2;
        }
        stream.forEach(function (num) {
            lo.push(num); lo.sort(function (a, b) { return b - a; });
            hi.push(lo.shift()); hi.sort(function (a, b) { return a - b; });
            if (lo.length < hi.length) { lo.push(hi.shift()); lo.sort(function (a, b) { return b - a; }); }
            (function (num, loSnap, hiSnap) {
                steps.push({
                    caption: 'Insert ' + num + ', rebalance so |lo| ≥ |hi|. Median = ' + median() + '.',
                    render: function () {
                        var loPanel = sidePanel(20, 10, 110, 'lo (max-heap)', loSnap.map(String));
                        var hiPanel = sidePanel(150, 10, 110, 'hi (min-heap)', hiSnap.map(String));
                        return loPanel.svg + hiPanel.svg + txt(340, 40, 'median=' + median(), { anchor: 'start', size: 14, fill: 'var(--accent)', weight: 700 });
                    }
                });
            })(num, lo.slice(), hi.slice());
        });
        return { viewBox: '0 0 460 100', steps: steps };
    })();

    // 13. Dynamic Programming — LCS table fill
    SCENES['dp'] = (function () {
        var s1 = 'ABC', s2 = 'AC';
        var m = s1.length, n = s2.length;
        var dp = [];
        for (var r = 0; r <= m; r++) { dp.push([]); for (var c = 0; c <= n; c++) dp[r].push(0); }
        var steps = [];
        steps.push({
            caption: 'Base row/col = 0 (empty-string LCS is 0). Fill the rest cell by cell.',
            render: function () { return renderGrid(null, []); }
        });
        for (r = 1; r <= m; r++) {
            for (c = 1; c <= n; c++) {
                var match = s1[r - 1] === s2[c - 1];
                var deps = match ? [[r - 1, c - 1]] : [[r - 1, c], [r, c - 1]];
                if (match) dp[r][c] = dp[r - 1][c - 1] + 1;
                else dp[r][c] = Math.max(dp[r - 1][c], dp[r][c - 1]);
                (function (r, c, match, deps, val, snap) {
                    steps.push({
                        caption: match
                            ? s1[r - 1] + '==' + s2[c - 1] + ' → dp[' + r + '][' + c + '] = dp[' + (r - 1) + '][' + (c - 1) + ']+1 = ' + val + '.'
                            : s1[r - 1] + '≠' + s2[c - 1] + ' → dp[' + r + '][' + c + '] = max(top,left) = ' + val + '.',
                        render: function () { return renderGrid([r, c], deps, snap); }
                    });
                })(r, c, match, deps, dp[r][c], dp.map(function (row) { return row.slice(); }));
            }
        }
        steps.push({ caption: 'LCS(' + s1 + ',' + s2 + ') length = ' + dp[m][n] + '.', render: steps[steps.length - 1].render });
        function renderGrid(current, deps, snap) {
            var data = (snap || dp).map(function (row, ri) { return row.map(function (v, ci) { return (ri === 0 || ci === 0) ? v : v; }); });
            return grid(data, {
                current: current, deps: deps,
                rowLabels: [''].concat(s1.split('')),
                colLabels: [''].concat(s2.split(''))
            });
        }
        return { viewBox: '0 0 220 190', steps: steps };
    })();

    // 14. Greedy — interval scheduling (max non-overlapping)
    SCENES['greedy'] = (function () {
        var input = [[1, 4], [2, 3], [3, 5], [6, 8]].slice().sort(function (a, b) { return a[1] - b[1]; });
        var steps = [];
        var end = -Infinity, kept = [];
        steps.push({ caption: 'Sorted by end time: ' + input.map(function (iv) { return '[' + iv + ']'; }).join(', ') + '.', render: function () { return render(-1, []); } });
        for (var i = 0; i < input.length; i++) {
            var take = input[i][0] >= end;
            if (take) { kept.push(i); end = input[i][1]; }
            (function (i, take, keptSnap) {
                steps.push({
                    caption: take
                        ? '[' + input[i] + '] starts at/after the last kept end → keep it.'
                        : '[' + input[i] + '] overlaps the last kept interval → skip it.',
                    render: function () { return render(i, keptSnap); }
                });
            })(i, take, kept.slice());
        }
        function render(upTo, keptSnap) {
            var colored = input.map(function (iv, i) {
                if (i > upTo) return iv;
                var isKept = keptSnap.indexOf(i) !== -1;
                var o = iv.slice();
                o.color = isKept ? 'var(--accent-dim)' : 'var(--border)';
                o.stroke = isKept ? 'var(--accent)' : 'var(--text-3)';
                return o;
            });
            return intervalTimeline(colored, { max: 9, scale: 40 });
        }
        return { viewBox: '0 0 400 150', steps: steps };
    })();

    // 15. Backtracking — subsets of [1,2]
    SCENES['backtracking'] = (function () {
        var nodes = {
            root: { x: 200, y: 20, label: '[]' },
            l: { x: 100, y: 80, label: '[1]' }, r: { x: 300, y: 80, label: '[]' },
            ll: { x: 60, y: 140, label: '[1,2]' }, lr: { x: 140, y: 140, label: '[1]' },
            rl: { x: 260, y: 140, label: '[2]' }, rr: { x: 340, y: 140, label: '[]' }
        };
        var edges = [['root', 'l'], ['root', 'r'], ['l', 'll'], ['l', 'lr'], ['r', 'rl'], ['r', 'rr']];
        var steps = [];
        var order = [
            { id: 'root', msg: 'Start with an empty path. Record [] as a subset.' },
            { id: 'l', msg: 'Choose 1 → path=[1]. Record it.' },
            { id: 'll', msg: 'Choose 2 → path=[1,2]. Record it (leaf).' },
            { id: 'lr', msg: 'Backtrack: un-choose 2, back to path=[1] — no more elements after index 1, this branch ends.' },
            { id: 'r', msg: 'Backtrack: un-choose 1 → path=[]. Now try skipping 1: explore starting from 2.' },
            { id: 'rl', msg: 'Choose 2 → path=[2]. Record it (leaf).' },
            { id: 'rr', msg: 'Backtrack to path=[] — no elements left to try. Done: subsets = {[], [1], [1,2], [2]}.' }
        ];
        var visited = {};
        order.forEach(function (step, idx) {
            visited = Object.assign({}, visited, (function () { var o = {}; o[step.id] = true; return o; })());
            (function (id, msg, visitedSnap) {
                steps.push({ caption: msg, render: function () { return nodeGraph(nodes, edges, { visited: visitedSnap, current: id, r: 20 }); } });
            })(step.id, step.msg, visited);
        });
        return { viewBox: '0 0 400 170', steps: steps };
    })();

    // 16. Binary Search — standard search-space narrowing
    SCENES['binary-search'] = (function () {
        var arr = [-1, 0, 3, 5, 9, 12], target = 9;
        var steps = [];
        var lo = 0, hi = arr.length - 1;
        function dimmedOutside(lo, hi) {
            var d = {}; for (var i = 0; i < arr.length; i++) if (i < lo || i > hi) d[i] = true; return d;
        }
        steps.push({
            caption: 'lo=0, hi=' + hi + '. Target=' + target + '.',
            render: function () { return arrayRow(arr, { pointers: [{ index: lo, label: 'lo', color: 'var(--accent)' }, { index: hi, label: 'hi', color: 'var(--cyan)' }] }); }
        });
        while (lo <= hi) {
            var mid = lo + ((hi - lo) >> 1);
            var pointers = [{ index: lo, label: 'lo', color: 'var(--accent)' }, { index: hi, label: 'hi', color: 'var(--cyan)' }, { index: mid, label: 'mid', color: 'var(--yellow, #92400e)' }];
            if (arr[mid] === target) {
                (function (mid, lo, hi) {
                    steps.push({ caption: 'mid=' + mid + ', arr[mid]=' + arr[mid] + ' == target → found it!', render: function () { return arrayRow(arr, { pointers: pointers, dimmed: dimmedOutside(lo, hi), highlights: (function () { var h = {}; h[mid] = { fill: 'var(--accent-dim)', stroke: 'var(--accent)' }; return h; })() }); } });
                })(mid, lo, hi);
                break;
            } else if (arr[mid] < target) {
                (function (mid, lo, hi) {
                    steps.push({ caption: 'mid=' + mid + ', arr[mid]=' + arr[mid] + ' < target → search the right half.', render: function () { return arrayRow(arr, { pointers: pointers, dimmed: dimmedOutside(lo, hi) }); } });
                })(mid, lo, hi);
                lo = mid + 1;
            } else {
                (function (mid, lo, hi) {
                    steps.push({ caption: 'mid=' + mid + ', arr[mid]=' + arr[mid] + ' > target → search the left half.', render: function () { return arrayRow(arr, { pointers: pointers, dimmed: dimmedOutside(lo, hi) }); } });
                })(mid, lo, hi);
                hi = mid - 1;
            }
        }
        return { viewBox: '0 0 400 90', steps: steps };
    })();

    // 17. Bit Manipulation — single number via XOR
    SCENES['bits'] = (function () {
        var nums = [4, 1, 2, 1, 2];
        var steps = [];
        var acc = 0;
        steps.push({ caption: 'result = 0. XOR every number in; duplicates cancel out (x ^ x = 0).', render: function () { return render(-1, 0); } });
        for (var i = 0; i < nums.length; i++) {
            var prev = acc;
            acc = acc ^ nums[i];
            (function (i, prev, acc) {
                steps.push({
                    caption: 'result = ' + prev + ' ^ ' + nums[i] + ' = ' + acc + '.',
                    render: function () { return render(i, acc); }
                });
            })(i, prev, acc);
        }
        steps.push({ caption: 'Final result = ' + acc + ' — the single number with no pair.', render: steps[steps.length - 1].render });
        function render(i, acc) {
            var h = {}; if (i >= 0) h[i] = { fill: 'var(--accent-dim)', stroke: 'var(--accent)' };
            return arrayRow(nums, { highlights: h }) + txt(280, 30, 'result=' + acc, { anchor: 'start', size: 14, fill: 'var(--accent)', weight: 700 });
        }
        return { viewBox: '0 0 360 60', steps: steps };
    })();

    // ── Player wiring ────────────────────────────────────────────────────────
    function buildPlayer(container, scene) {
        var idx = 0;
        var playing = null;
        var svgNS = 'http://www.w3.org/2000/svg';

        var stage = container.querySelector('.viz-stage');
        var caption = container.querySelector('.viz-caption');
        var counter = container.querySelector('.viz-counter');
        var prevBtn = container.querySelector('.viz-prev');
        var nextBtn = container.querySelector('.viz-next');
        var playBtn = container.querySelector('.viz-play');
        var resetBtn = container.querySelector('.viz-reset');

        stage.setAttribute('viewBox', scene.viewBox);
        // Give the SVG an intrinsic size matching its viewBox (capped to a
        // sensible max width) so it renders at its natural aspect ratio
        // instead of stretching to fill the card — CSS only caps it down
        // further (max-width:100%) on narrow screens.
        var vb = scene.viewBox.split(' ').map(Number);
        var vbW = vb[2], vbH = vb[3];
        var displayW = Math.min(vbW, 560);
        stage.setAttribute('width', displayW);
        stage.setAttribute('height', Math.round(displayW * (vbH / vbW)));

        function renderStep() {
            var step = scene.steps[idx];
            stage.innerHTML = DEFS + step.render();
            caption.textContent = step.caption;
            counter.textContent = 'Step ' + (idx + 1) + ' / ' + scene.steps.length;
            prevBtn.disabled = idx === 0;
            nextBtn.disabled = idx === scene.steps.length - 1;
        }
        function stopPlaying() {
            if (playing) { clearInterval(playing); playing = null; playBtn.innerHTML = '<i class="fas fa-play"></i> Play'; }
        }
        prevBtn.addEventListener('click', function () { stopPlaying(); if (idx > 0) { idx--; renderStep(); } });
        nextBtn.addEventListener('click', function () { stopPlaying(); if (idx < scene.steps.length - 1) { idx++; renderStep(); } });
        resetBtn.addEventListener('click', function () { stopPlaying(); idx = 0; renderStep(); });
        playBtn.addEventListener('click', function () {
            if (playing) { stopPlaying(); return; }
            if (idx >= scene.steps.length - 1) { idx = 0; renderStep(); }
            playBtn.innerHTML = '<i class="fas fa-pause"></i> Pause';
            playing = setInterval(function () {
                if (idx < scene.steps.length - 1) { idx++; renderStep(); }
                if (idx >= scene.steps.length - 1) { stopPlaying(); }
            }, 1400);
        });

        renderStep();
    }

    function init() {
        document.querySelectorAll('.viz-box[data-viz]').forEach(function (box) {
            var id = box.getAttribute('data-viz');
            var scene = SCENES[id];
            if (!scene) return;
            buildPlayer(box, scene);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
