// Builds the Python source that actually runs on Piston: the player's
// submission, followed by a grading harness that runs every test case
// (including hidden ones) and prints a single JSON line the proxy can parse.
// Ported 1:1 from the version verified locally in scripts/ref_check.py +
// build_driver.py during problem authoring (see piston-service/README.md).

const TREE_HELPERS = `
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def build_tree(values):
    if not values or values[0] is None:
        return None
    it = iter(values)
    root = TreeNode(next(it))
    queue = [root]
    while queue:
        node = queue.pop(0)
        try:
            lv = next(it)
        except StopIteration:
            break
        if lv is not None:
            node.left = TreeNode(lv)
            queue.append(node.left)
        try:
            rv = next(it)
        except StopIteration:
            break
        if rv is not None:
            node.right = TreeNode(rv)
            queue.append(node.right)
    return root
`;

const RESULT_MARKER = '___ALGOARENA_RESULT___';

function pyStringLiteral(jsonString) {
    // Embed a JSON string as a Python string literal via triple-quoted raw-ish
    // escaping — simplest safe approach: JSON-encode again so the Python side
    // does json.loads(json.loads(...)) is unnecessary; instead we just reuse
    // Python's own string escaping rules via a small escaper.
    return "'" + jsonString
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '') + "'";
}

function buildDriver(problem, userCode) {
    const testsJson = JSON.stringify(problem.tests);
    const isTree = !!problem.treeParam;
    const fn = problem.functionName;

    const parts = [];
    parts.push('import json, sys, time\n');
    if (isTree) parts.push(TREE_HELPERS);
    parts.push('\n# ---- user submission ----\n');
    parts.push(userCode, '\n');
    parts.push('\n# ---- grading harness ----\n');
    parts.push(`_TESTS = json.loads(${pyStringLiteral(testsJson)})\n`);
    parts.push('_results = []\n');
    parts.push('for _t in _TESTS:\n');
    parts.push('    _args = _t["input"]\n');
    parts.push('    _start = time.time()\n');
    parts.push('    try:\n');
    if (isTree) {
        parts.push(`        _actual = ${fn}(build_tree(_args[0]))\n`);
    } else {
        parts.push(`        _actual = ${fn}(*_args)\n`);
    }
    parts.push('        _elapsed = int((time.time() - _start) * 1000)\n');
    parts.push('        _passed = _actual == _t["expected"]\n');
    parts.push('        _results.append({"passed": _passed, "actual": _actual, "hidden": _t.get("hidden", False), "ms": _elapsed})\n');
    parts.push('    except Exception as e:\n');
    parts.push('        _results.append({"passed": False, "error": str(e)[:200], "hidden": _t.get("hidden", False), "ms": int((time.time()-_start)*1000)})\n');
    parts.push(`print(${JSON.stringify(RESULT_MARKER)})\n`);
    parts.push('print(json.dumps(_results))\n');
    return parts.join('');
}

// Parses Piston's stdout and redacts hidden-test "actual" values so a player
// can never learn the expected answer for a hidden test just by trying
// different inputs and reading the response.
function parseDriverOutput(stdout) {
    if (!stdout || stdout.indexOf(RESULT_MARKER) === -1) {
        return null;
    }
    const after = stdout.split(RESULT_MARKER)[1];
    const line = after.trim().split('\n')[0];
    const raw = JSON.parse(line);

    const results = raw.map(function (r) {
        const out = { passed: r.passed, hidden: !!r.hidden, ms: r.ms };
        if (!r.hidden && r.actual !== undefined) out.actual = r.actual;
        if (r.error) out.error = r.error;
        return out;
    });
    const passCount = results.filter(function (r) { return r.passed; }).length;
    return {
        results: results,
        passCount: passCount,
        totalCount: results.length,
        allPassed: passCount === results.length
    };
}

module.exports = { buildDriver, parseDriverOutput, RESULT_MARKER };
