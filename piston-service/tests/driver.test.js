// Verifies the exact Python source that AlgoArena would ship to Piston.
// We can't run Piston itself here (no Docker in this environment), so this
// test executes the generated driver against a real local Python interpreter
// as the closest available substitute — same driver-building code path
// (driver.js) that server.js uses to talk to Piston, just executed locally
// instead of inside Piston's sandbox. See piston-service/README.md for what
// still needs verifying against the real self-hosted Piston instance.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { buildDriver, parseDriverOutput } = require('../driver');

const problems = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'problems-private.json'), 'utf8'));

function findPython() {
    const candidates = process.env.PYTHON_BIN
        ? [process.env.PYTHON_BIN]
        : ['python3', 'python', 'C:\\Python310\\python.exe', 'C:\\Python39\\python.exe',
           'C:\\Users\\Alp\\AppData\\Local\\Programs\\Python\\Python312\\python.exe'];
    for (const bin of candidates) {
        try {
            execFileSync(bin, ['--version'], { stdio: 'pipe' });
            return bin;
        } catch (e) { /* try next */ }
    }
    return null;
}

const PYTHON = findPython();

const solutions = {
    'pair-sum-target': `def pair_sum_indices(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo < hi:
        s = nums[lo] + nums[hi]
        if s == target:
            return [lo + 1, hi + 1]
        elif s < target:
            lo += 1
        else:
            hi -= 1
    return []
`,
    'longest-fruit-window': `def longest_window_k_distinct(fruits, k):
    if k <= 0:
        return 0
    from collections import defaultdict
    count = defaultdict(int)
    left = 0
    best = 0
    for right, f in enumerate(fruits):
        count[f] += 1
        while len(count) > k:
            lf = fruits[left]
            count[lf] -= 1
            if count[lf] == 0:
                del count[lf]
            left += 1
        best = max(best, right - left + 1)
    return best
`,
    'group-by-signature': `def group_by_signature(words):
    from collections import defaultdict
    groups = defaultdict(list)
    for w in words:
        sig = ''.join(sorted(w))
        groups[sig].append(w)
    result = [sorted(g) for g in groups.values()]
    result.sort(key=lambda g: g[0])
    return result
`,
    'valid-bracket-sequence': `def is_valid_brackets(s):
    pairs = {')': '(', ']': '[', '}': '{'}
    opens = set(pairs.values())
    stack = []
    for ch in s:
        if ch in opens:
            stack.append(ch)
        elif ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
    return len(stack) == 0
`,
    'balanced-binary-tree': `def is_balanced(root):
    def height(node):
        if node is None:
            return 0
        lh = height(node.left)
        if lh == -1:
            return -1
        rh = height(node.right)
        if rh == -1:
            return -1
        if abs(lh - rh) > 1:
            return -1
        return max(lh, rh) + 1
    return height(root) != -1
`,
    'count-islands': `def num_islands(grid):
    if not grid:
        return 0
    rows, cols = len(grid), len(grid[0])
    visited = [[False]*cols for _ in range(rows)]
    count = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == 1 and not visited[r][c]:
                count += 1
                stack = [(r, c)]
                visited[r][c] = True
                while stack:
                    cr, cc = stack.pop()
                    for dr, dc in [(1,0),(-1,0),(0,1),(0,-1)]:
                        nr, nc = cr+dr, cc+dc
                        if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 1 and not visited[nr][nc]:
                            visited[nr][nc] = True
                            stack.append((nr, nc))
    return count
`,
    'max-non-adjacent-sum': `def max_non_adjacent_sum(nums):
    incl, excl = 0, 0
    for n in nums:
        incl, excl = excl + n, max(incl, excl)
    return max(incl, excl)
`,
    'max-non-overlapping-meetings': `def max_non_overlapping_meetings(intervals):
    intervals = sorted(intervals, key=lambda iv: iv[1])
    count = 0
    last_end = float('-inf')
    for s, e in intervals:
        if s >= last_end:
            count += 1
            last_end = e
    return count
`,
    'first-true-index': `def first_true_index(flags):
    lo, hi = 0, len(flags) - 1
    result = -1
    while lo <= hi:
        mid = (lo + hi) // 2
        if flags[mid]:
            result = mid
            hi = mid - 1
        else:
            lo = mid + 1
    return result
`,
    'combination-sum': `def combination_sum(candidates, target):
    candidates = sorted(set(candidates))
    result = []
    path = []
    def backtrack(start, remaining):
        if remaining == 0:
            result.append(list(path))
            return
        if remaining < 0:
            return
        for i in range(start, len(candidates)):
            path.append(candidates[i])
            backtrack(i, remaining - candidates[i])
            path.pop()
    backtrack(0, target)
    result.sort()
    return result
`
};

function runDriver(source) {
    const tmpFile = path.join(os.tmpdir(), 'algoarena_driver_' + Math.random().toString(36).slice(2) + '.py');
    fs.writeFileSync(tmpFile, source);
    try {
        const stdout = execFileSync(PYTHON, [tmpFile], { encoding: 'utf8' });
        return stdout;
    } finally {
        fs.unlinkSync(tmpFile);
    }
}

test('all 10 problems: correct solution passes every test case', { skip: !PYTHON && 'no python interpreter found on this machine' }, () => {
    for (const problem of problems) {
        const solution = solutions[problem.id];
        assert.ok(solution, 'missing reference solution for ' + problem.id);
        const driver = buildDriver(problem, solution);
        const stdout = runDriver(driver);
        const parsed = parseDriverOutput(stdout);
        assert.ok(parsed, problem.id + ': driver produced no result marker — stdout was: ' + stdout);
        assert.strictEqual(parsed.allPassed, true, problem.id + ' failed: ' + JSON.stringify(parsed.results));
        assert.strictEqual(parsed.totalCount, problem.tests.length);
    }
});

test('wrong solution is correctly marked as failing', { skip: !PYTHON && 'no python interpreter found on this machine' }, () => {
    const problem = problems.find(p => p.id === 'pair-sum-target');
    const driver = buildDriver(problem, 'def pair_sum_indices(nums, target):\n    return [0, 0]\n');
    const parsed = parseDriverOutput(runDriver(driver));
    assert.strictEqual(parsed.allPassed, false);
    assert.strictEqual(parsed.passCount, 0);
});

test('a raised exception is captured per-test, not a hard crash', { skip: !PYTHON && 'no python interpreter found on this machine' }, () => {
    const problem = problems.find(p => p.id === 'pair-sum-target');
    const driver = buildDriver(problem, 'def pair_sum_indices(nums, target):\n    raise ValueError("boom")\n');
    const parsed = parseDriverOutput(runDriver(driver));
    assert.strictEqual(parsed.allPassed, false);
    assert.ok(parsed.results.every(r => r.error === 'boom'));
});

test('parseDriverOutput redacts "actual" for hidden tests but keeps it for visible ones', () => {
    const fakeStdout = '___ALGOARENA_RESULT___\n' + JSON.stringify([
        { passed: true, actual: [1, 2], hidden: false, ms: 1 },
        { passed: false, actual: 999, hidden: true, ms: 1 }
    ]) + '\n';
    const parsed = parseDriverOutput(fakeStdout);
    assert.strictEqual(parsed.results[0].actual !== undefined, true, 'visible test should expose actual');
    assert.strictEqual(parsed.results[1].actual, undefined, 'hidden test must NOT expose actual (would leak toward the expected answer)');
});

test('parseDriverOutput returns null when there is no result marker (e.g. syntax error)', () => {
    assert.strictEqual(parseDriverOutput('Traceback...\nSyntaxError: invalid syntax'), null);
});

test('malicious/odd code cannot break out of the JSON test-data literal', () => {
    // A submission containing a string that itself looks like our result
    // marker or embeds quotes/newlines must not corrupt the harness's own
    // json.loads(...) call for the embedded test data.
    const problem = problems.find(p => p.id === 'valid-bracket-sequence');
    const trickyCode = `def is_valid_brackets(s):\n    x = "___ALGOARENA_RESULT___ \\' \\"\\" \\n done"\n    return s == "()"\n`;
    const driver = buildDriver(problem, trickyCode);
    // The embedded test JSON literal must still be syntactically valid Python
    // regardless of what the user's code contains, since it's a separate
    // statement, not string-concatenated with user code.
    assert.ok(driver.includes('_TESTS = json.loads('));
    if (PYTHON) {
        const parsed = parseDriverOutput(runDriver(driver));
        assert.ok(parsed, 'driver with tricky user code should still run and print exactly one result marker');
    }
});
