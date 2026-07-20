// Verifies the exact Java source that AlgoArena would ship to Piston (java
// 15.0.2, confirmed against the public Piston runtimes API — see
// piston-service/README.md). We can't run Piston itself here (no Docker in
// this environment), so this test compiles + runs the generated driver
// against a real local JDK as the closest available substitute — same
// driver-building code path (driver.js) that server.js uses, just executed
// locally instead of inside Piston's sandbox.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { buildDriver, parseDriverOutput, toJavaLiteral } = require('../driver');

const problems = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'problems-private.json'), 'utf8'));

// Picks ONE JDK's bin/ directory and uses both javac and java from it —
// resolving javac and java independently (e.g. one via PATH, one via a
// specific install) risks compiling with one JDK version and running with
// another, which fails with UnsupportedClassVersionError and has nothing to
// do with whether the driver-generation logic itself is correct.
function findJdkDir() {
    const candidates = process.env['JAVA_BIN_DIR']
        ? [process.env['JAVA_BIN_DIR']]
        : [
            'C:\\Users\\Alp\\.jdks\\corretto-11.0.11\\bin',
            'C:\\Users\\Alp\\.jdks\\openjdk-16.0.1\\bin',
            'C:\\Users\\Alp\\.jdks\\corretto-1.8.0_312\\bin',
            '' // last resort: rely on PATH for both
        ];
    for (const dir of candidates) {
        const javac = dir ? path.join(dir, 'javac.exe') : 'javac.exe';
        const java = dir ? path.join(dir, 'java.exe') : 'java.exe';
        try {
            execFileSync(javac, ['-version'], { stdio: 'pipe' });
            execFileSync(java, ['-version'], { stdio: 'pipe' });
            return { javac, java };
        } catch (e) { /* try next */ }
    }
    return null;
}

const JDK = findJdkDir();
const JAVAC = JDK && JDK.javac;
const JAVA = JDK && JDK.java;
const HAVE_JDK = !!JDK;

const solutions = {
    'pair-sum-target': `public int[] pairSumIndices(int[] nums, int target) {
    int lo = 0, hi = nums.length - 1;
    while (lo < hi) {
        int s = nums[lo] + nums[hi];
        if (s == target) return new int[]{lo + 1, hi + 1};
        else if (s < target) lo++;
        else hi--;
    }
    return new int[0];
}
`,
    'longest-fruit-window': `public int longestWindowKDistinct(String[] fruits, int k) {
    if (k <= 0) return 0;
    Map<String, Integer> count = new HashMap<>();
    int left = 0, best = 0;
    for (int right = 0; right < fruits.length; right++) {
        count.merge(fruits[right], 1, Integer::sum);
        while (count.size() > k) {
            String lf = fruits[left];
            count.put(lf, count.get(lf) - 1);
            if (count.get(lf) == 0) count.remove(lf);
            left++;
        }
        best = Math.max(best, right - left + 1);
    }
    return best;
}
`,
    'group-by-signature': `public List<List<String>> groupBySignature(String[] words) {
    Map<String, List<String>> groups = new HashMap<>();
    for (String w : words) {
        char[] chars = w.toCharArray();
        Arrays.sort(chars);
        String sig = new String(chars);
        groups.computeIfAbsent(sig, k -> new ArrayList<>()).add(w);
    }
    List<List<String>> result = new ArrayList<>();
    for (List<String> g : groups.values()) {
        Collections.sort(g);
        result.add(g);
    }
    result.sort((a, b) -> a.get(0).compareTo(b.get(0)));
    return result;
}
`,
    'valid-bracket-sequence': `public boolean isValidBrackets(String s) {
    Map<Character, Character> pairs = new HashMap<>();
    pairs.put(')', '('); pairs.put(']', '['); pairs.put('}', '{');
    Deque<Character> stack = new ArrayDeque<>();
    for (char ch : s.toCharArray()) {
        if (ch == '(' || ch == '[' || ch == '{') stack.push(ch);
        else if (pairs.containsKey(ch)) {
            if (stack.isEmpty() || stack.pop() != pairs.get(ch)) return false;
        }
    }
    return stack.isEmpty();
}
`,
    'balanced-binary-tree': `public boolean isBalanced(TreeNode root) {
    return height(root) != -1;
}
private int height(TreeNode node) {
    if (node == null) return 0;
    int lh = height(node.left);
    if (lh == -1) return -1;
    int rh = height(node.right);
    if (rh == -1) return -1;
    if (Math.abs(lh - rh) > 1) return -1;
    return Math.max(lh, rh) + 1;
}
`,
    'count-islands': `public int numIslands(int[][] grid) {
    if (grid.length == 0) return 0;
    int rows = grid.length, cols = grid[0].length;
    boolean[][] visited = new boolean[rows][cols];
    int count = 0;
    int[][] dirs = {{1,0},{-1,0},{0,1},{0,-1}};
    for (int r = 0; r < rows; r++) {
        for (int c = 0; c < cols; c++) {
            if (grid[r][c] == 1 && !visited[r][c]) {
                count++;
                Deque<int[]> stack = new ArrayDeque<>();
                stack.push(new int[]{r, c});
                visited[r][c] = true;
                while (!stack.isEmpty()) {
                    int[] cur = stack.pop();
                    for (int[] d : dirs) {
                        int nr = cur[0] + d[0], nc = cur[1] + d[1];
                        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] == 1 && !visited[nr][nc]) {
                            visited[nr][nc] = true;
                            stack.push(new int[]{nr, nc});
                        }
                    }
                }
            }
        }
    }
    return count;
}
`,
    'max-non-adjacent-sum': `public int maxNonAdjacentSum(int[] nums) {
    int incl = 0, excl = 0;
    for (int n : nums) {
        int newIncl = excl + n;
        excl = Math.max(incl, excl);
        incl = newIncl;
    }
    return Math.max(incl, excl);
}
`,
    'max-non-overlapping-meetings': `public int maxNonOverlappingMeetings(int[][] intervals) {
    int[][] sorted = intervals.clone();
    Arrays.sort(sorted, (a, b) -> Integer.compare(a[1], b[1]));
    int count = 0;
    long lastEnd = Long.MIN_VALUE;
    for (int[] iv : sorted) {
        if (iv[0] >= lastEnd) {
            count++;
            lastEnd = iv[1];
        }
    }
    return count;
}
`,
    'first-true-index': `public int firstTrueIndex(boolean[] flags) {
    int lo = 0, hi = flags.length - 1, result = -1;
    while (lo <= hi) {
        int mid = (lo + hi) / 2;
        if (flags[mid]) { result = mid; hi = mid - 1; }
        else lo = mid + 1;
    }
    return result;
}
`,
    'combination-sum': `public List<List<Integer>> combinationSum(int[] candidates, int target) {
    int[] sorted = Arrays.stream(candidates).distinct().sorted().toArray();
    List<List<Integer>> result = new ArrayList<>();
    backtrack(sorted, target, 0, new ArrayList<>(), result);
    result.sort((a, b) -> {
        for (int i = 0; i < Math.min(a.size(), b.size()); i++) {
            int cmp = Integer.compare(a.get(i), b.get(i));
            if (cmp != 0) return cmp;
        }
        return Integer.compare(a.size(), b.size());
    });
    return result;
}
private void backtrack(int[] candidates, int remaining, int start, List<Integer> path, List<List<Integer>> result) {
    if (remaining == 0) { result.add(new ArrayList<>(path)); return; }
    if (remaining < 0) return;
    for (int i = start; i < candidates.length; i++) {
        path.add(candidates[i]);
        backtrack(candidates, remaining - candidates[i], i, path, result);
        path.remove(path.size() - 1);
    }
}
`,
    // ---- Batch 1: Bit Manipulation ----
    'lone-number': `public int loneNumber(int[] nums) {
    int x = 0;
    for (int n : nums) x ^= n;
    return x;
}
`,
    'find-missing-number': `public int missingNumber(int[] nums) {
    int n = nums.length;
    int expected = 0;
    for (int i = 0; i <= n; i++) expected ^= i;
    int actual = 0;
    for (int v : nums) actual ^= v;
    return expected ^ actual;
}
`,
    'count-set-bits': `public int countSetBits(int n) {
    int count = 0;
    while (n != 0) { count += (n & 1); n >>>= 1; }
    return count;
}
`,
    'bit-count-range': `public int[] bitCountRange(int n) {
    int[] res = new int[n + 1];
    for (int i = 1; i <= n; i++) res[i] = res[i >> 1] + (i & 1);
    return res;
}
`,
    'reverse-bits': `public int reverseBits(int n) {
    int result = 0;
    for (int i = 0; i < 32; i++) {
        result = (result << 1) | (n & 1);
        n >>>= 1;
    }
    return result;
}
`,
    'add-without-plus': `public int addWithoutPlus(int a, int b) {
    while (b != 0) {
        int carry = a & b;
        a = a ^ b;
        b = carry << 1;
    }
    return a;
}
`,
    'and-of-range': `public int andRange(int left, int right) {
    int shift = 0;
    while (left != right) {
        left >>= 1;
        right >>= 1;
        shift++;
    }
    return left << shift;
}
`
};

function runDriver(source) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'algoarena_java_'));
    const file = path.join(dir, 'Main.java');
    fs.writeFileSync(file, source);
    try {
        execFileSync(JAVAC, ['Main.java'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
        return execFileSync(JAVA, ['Main'], { cwd: dir, encoding: 'utf8' });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

// Piston's actual `java` package does NOT javac-then-`java ClassName` like
// runDriver() above — its run script does `mv $1 $1.java && java $filename`,
// i.e. Java's single-file source-launcher (JEP 330). That launcher invokes
// main() on the FIRST top-level class declared in the file, regardless of
// which one is `public` or matches the filename. runDriver()'s two-step
// javac+java approach can't catch a class-ordering bug like that (explicitly
// naming the class to run sidesteps the whole issue) — this is what
// actually caught driver.js emitting TreeNode/TestUtil before Main and
// breaking every real submission against the live self-hosted Piston
// instance despite 100% local pass rates. Keep both runners: this one for
// fidelity to Piston's real mechanism, the other for a faster compile-error
// signal via javac's normal diagnostics.
function runDriverSingleFileLaunch(source) {
    // Mirror Piston's run script exactly: files are uploaded as "Main.java",
    // then `mv $1 $1.java` renames it to "Main.java.java" before
    // `java Main.java.java` launches it.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'algoarena_java_sfl_'));
    const uploaded = path.join(dir, 'Main.java');
    const renamed = path.join(dir, 'Main.java.java');
    fs.writeFileSync(uploaded, source);
    fs.renameSync(uploaded, renamed);
    try {
        return execFileSync(JAVA, ['Main.java.java'], { cwd: dir, encoding: 'utf8' });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

test('every problem: correct Java solution passes every test case', { skip: !HAVE_JDK && 'no JDK (javac) found on this machine' }, () => {
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

test('every problem, run via Piston\'s ACTUAL mechanism (java single-file source-launch, not javac+java)', { skip: !HAVE_JDK && 'no JDK found' }, () => {
    for (const problem of problems) {
        const solution = solutions[problem.id];
        const driver = buildDriver(problem, solution);
        const stdout = runDriverSingleFileLaunch(driver);
        const parsed = parseDriverOutput(stdout);
        assert.ok(parsed, problem.id + ' (single-file launch): no result marker — stdout was: ' + stdout);
        assert.strictEqual(parsed.allPassed, true, problem.id + ' (single-file launch) failed: ' + JSON.stringify(parsed.results));
    }
});

test('wrong solution is correctly marked as failing', { skip: !HAVE_JDK && 'no JDK found' }, () => {
    const problem = problems.find(p => p.id === 'pair-sum-target');
    const driver = buildDriver(problem, 'public int[] pairSumIndices(int[] nums, int target) {\n    return new int[]{0, 0};\n}\n');
    const parsed = parseDriverOutput(runDriver(driver));
    assert.strictEqual(parsed.allPassed, false);
    assert.strictEqual(parsed.passCount, 0);
});

test('a thrown exception is captured per-test, not a hard crash', { skip: !HAVE_JDK && 'no JDK found' }, () => {
    const problem = problems.find(p => p.id === 'pair-sum-target');
    const driver = buildDriver(problem, 'public int[] pairSumIndices(int[] nums, int target) {\n    throw new RuntimeException("boom");\n}\n');
    const parsed = parseDriverOutput(runDriver(driver));
    assert.strictEqual(parsed.allPassed, false);
    assert.ok(parsed.results.every(r => r.error === 'boom'));
});

test('a compile error yields no result marker (server.js treats this as executionError)', { skip: !HAVE_JDK && 'no JDK found' }, () => {
    const problem = problems.find(p => p.id === 'pair-sum-target');
    const driver = buildDriver(problem, 'public int[] pairSumIndices(int[] nums, int target) {\n    this is not valid java\n}\n');
    let threw = false;
    try {
        runDriver(driver);
    } catch (e) {
        threw = true; // javac exits non-zero on a compile error, execFileSync throws
    }
    assert.ok(threw, 'expected javac to fail on invalid syntax');
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

test('parseDriverOutput returns null when there is no result marker', () => {
    assert.strictEqual(parseDriverOutput('Exception in thread "main" java.lang.Error'), null);
});

test('toJavaLiteral renders every declared parameter/return type correctly', () => {
    assert.strictEqual(toJavaLiteral(5, 'int'), '5');
    assert.strictEqual(toJavaLiteral(true, 'boolean'), 'true');
    assert.strictEqual(toJavaLiteral('a"b', 'String'), '"a\\"b"');
    assert.strictEqual(toJavaLiteral([1, 2, 3], 'int[]'), 'new int[]{1,2,3}');
    assert.strictEqual(toJavaLiteral([[1, 2], [3]], 'int[][]'), 'new int[][]{{1,2},{3}}');
    assert.strictEqual(toJavaLiteral([true, false], 'boolean[]'), 'new boolean[]{true,false}');
    assert.strictEqual(toJavaLiteral(['a', 'b'], 'String[]'), 'new String[]{"a","b"}');
    assert.strictEqual(toJavaLiteral([1, null, 2], 'tree'), 'TestUtil.buildTree(new Integer[]{1,null,2})');
});

test('a String-returning problem with quotes/backslashes in its data round-trips through the JSON result line', { skip: !HAVE_JDK && 'no JDK found' }, () => {
    // group-by-signature returns List<List<String>> — exercises toJson()'s
    // string-escaping path, not just primitives.
    const problem = problems.find(p => p.id === 'group-by-signature');
    const driver = buildDriver(problem, solutions['group-by-signature']);
    const parsed = parseDriverOutput(runDriver(driver));
    assert.ok(parsed, 'driver should run and print exactly one result marker');
    assert.strictEqual(parsed.allPassed, true);
    const visible = parsed.results.find(r => !r.hidden);
    assert.ok(Array.isArray(visible.actual), 'visible List<List<String>> result should deserialize as a JSON array');
});
