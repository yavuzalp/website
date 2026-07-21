// Builds the Java source that actually runs on Piston: a Solution class
// wrapping the player's submitted method, a pre-supplied TreeNode/TestUtil
// for tree problems, and a grading Main that runs every test case
// (including hidden ones) and prints a single JSON line the proxy can parse.
//
// Test cases are embedded as Java LITERALS (not parsed from a JSON string at
// runtime) so no JSON library needs to be present in the Piston Java
// runtime — driver.js is the only place that needs to understand JSON.

const RESULT_MARKER = '___ALGOARENA_RESULT___';

function javaStringLiteral(s) {
    return '"' + String(s)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '') + '"';
}

// Renders a JSON value as a Java source literal of the given declared type.
// `type` is one of the small fixed vocabulary used in problems-private.json:
// int, int[], int[][], boolean, boolean[], String, String[], tree,
// List<List<Integer>>, List<List<String>>
function toJavaLiteral(value, type) {
    switch (type) {
        case 'int':
        case 'boolean':
            return String(value);
        case 'double':
            // Ensure a decimal point so Java infers double, and deepEquals
            // compares Double-to-Double (Integer.equals(Double) is false).
            return Number.isInteger(value) ? value + '.0' : String(value);
        case 'double[]':
            return 'new double[]{' + value.map(function (v) {
                return Number.isInteger(v) ? v + '.0' : String(v);
            }).join(',') + '}';
        case 'String':
            return javaStringLiteral(value);
        case 'int[]':
            return 'new int[]{' + value.join(',') + '}';
        case 'int[][]':
            return 'new int[][]{' + value.map(function (row) { return '{' + row.join(',') + '}'; }).join(',') + '}';
        case 'boolean[]':
            return 'new boolean[]{' + value.map(function (v) { return v ? 'true' : 'false'; }).join(',') + '}';
        case 'String[]':
            return 'new String[]{' + value.map(javaStringLiteral).join(',') + '}';
        case 'tree':
            return 'TestUtil.buildTree(new Integer[]{' + value.map(function (v) { return v === null ? 'null' : String(v); }).join(',') + '})';
        case 'List<List<Integer>>':
            return 'Arrays.<List<Integer>>asList(' + value.map(function (row) {
                return 'Arrays.asList(' + row.join(',') + ')';
            }).join(',') + ')';
        case 'List<List<String>>':
            return 'Arrays.<List<String>>asList(' + value.map(function (row) {
                return 'Arrays.asList(' + row.map(javaStringLiteral).join(',') + ')';
            }).join(',') + ')';
        default:
            throw new Error('toJavaLiteral: unsupported type ' + type);
    }
}

const HARNESS_PREAMBLE = `
class TreeNode {
    int val;
    TreeNode left;
    TreeNode right;
    TreeNode(int val) { this.val = val; }
}

class TestUtil {
    static TreeNode buildTree(Integer[] values) {
        if (values.length == 0 || values[0] == null) return null;
        TreeNode root = new TreeNode(values[0]);
        java.util.ArrayDeque<TreeNode> queue = new java.util.ArrayDeque<TreeNode>();
        queue.add(root);
        int i = 1;
        while (!queue.isEmpty() && i < values.length) {
            TreeNode node = queue.poll();
            if (i < values.length) {
                Integer lv = values[i++];
                if (lv != null) { node.left = new TreeNode(lv); queue.add(node.left); }
            }
            if (i < values.length) {
                Integer rv = values[i++];
                if (rv != null) { node.right = new TreeNode(rv); queue.add(node.right); }
            }
        }
        return root;
    }
}
`;

const MAIN_HELPERS = `
    static Object normalize(Object o) {
        if (o == null) return null;
        if (o instanceof int[]) {
            java.util.List<Object> r = new java.util.ArrayList<Object>();
            for (int v : (int[]) o) r.add(v);
            return r;
        }
        if (o instanceof boolean[]) {
            java.util.List<Object> r = new java.util.ArrayList<Object>();
            for (boolean v : (boolean[]) o) r.add(v);
            return r;
        }
        if (o instanceof double[]) {
            java.util.List<Object> r = new java.util.ArrayList<Object>();
            for (double v : (double[]) o) r.add(v);
            return r;
        }
        if (o instanceof Object[]) {
            java.util.List<Object> r = new java.util.ArrayList<Object>();
            for (Object v : (Object[]) o) r.add(normalize(v));
            return r;
        }
        if (o instanceof java.util.List<?>) {
            java.util.List<Object> r = new java.util.ArrayList<Object>();
            for (Object v : (java.util.List<?>) o) r.add(normalize(v));
            return r;
        }
        return o;
    }

    static boolean deepEquals(Object a, Object b) {
        Object na = normalize(a), nb = normalize(b);
        return na == null ? nb == null : na.equals(nb);
    }

    static String toJson(Object o) {
        if (o == null) return "null";
        if (o instanceof Boolean || o instanceof Number) return o.toString();
        if (o instanceof String) return "\\"" + ((String) o).replace("\\\\", "\\\\\\\\").replace("\\"", "\\\\\\"") + "\\"";
        if (o instanceof int[]) {
            StringBuilder sb = new StringBuilder("[");
            int[] arr = (int[]) o;
            for (int i = 0; i < arr.length; i++) { if (i > 0) sb.append(","); sb.append(arr[i]); }
            return sb.append("]").toString();
        }
        if (o instanceof boolean[]) {
            StringBuilder sb = new StringBuilder("[");
            boolean[] arr = (boolean[]) o;
            for (int i = 0; i < arr.length; i++) { if (i > 0) sb.append(","); sb.append(arr[i]); }
            return sb.append("]").toString();
        }
        if (o instanceof double[]) {
            StringBuilder sb = new StringBuilder("[");
            double[] arr = (double[]) o;
            for (int i = 0; i < arr.length; i++) { if (i > 0) sb.append(","); sb.append(arr[i]); }
            return sb.append("]").toString();
        }
        if (o instanceof Object[]) {
            StringBuilder sb = new StringBuilder("[");
            Object[] arr = (Object[]) o;
            for (int i = 0; i < arr.length; i++) { if (i > 0) sb.append(","); sb.append(toJson(arr[i])); }
            return sb.append("]").toString();
        }
        if (o instanceof java.util.List<?>) {
            StringBuilder sb = new StringBuilder("[");
            boolean first = true;
            for (Object v : (java.util.List<?>) o) { if (!first) sb.append(","); first = false; sb.append(toJson(v)); }
            return sb.append("]").toString();
        }
        return "\\"" + o.toString() + "\\"";
    }
`;

function buildDriver(problem, userCode) {
    const fn = problem.functionName;
    const isTree = !!problem.treeParam;

    const testBlocks = problem.tests.map(function (t) {
        const args = t.input.map(function (v, idx) { return toJavaLiteral(v, problem.paramTypes[idx]); }).join(', ');
        const expectedLiteral = toJavaLiteral(t.expected, problem.returnType);
        const hidden = t.hidden ? 'true' : 'false';
        return [
            '        {',
            '            long __start = System.nanoTime();',
            '            try {',
            '                Object __actual = sol.' + fn + '(' + args + ');',
            '                Object __expected = ' + expectedLiteral + ';',
            '                boolean __passed = deepEquals(__actual, __expected);',
            '                long __ms = (System.nanoTime() - __start) / 1000000;',
            '                StringBuilder __sb = new StringBuilder();',
            '                __sb.append("{\\"passed\\":").append(__passed).append(",\\"hidden\\":").append(' + hidden + ').append(",\\"ms\\":").append(__ms);',
            '                if (!' + hidden + ') __sb.append(",\\"actual\\":").append(toJson(__actual));',
            '                __sb.append("}");',
            '                __results.add(__sb.toString());',
            '            } catch (Throwable __e) {',
            '                long __ms = (System.nanoTime() - __start) / 1000000;',
            '                String __msg = String.valueOf(__e.getMessage() == null ? __e.toString() : __e.getMessage());',
            '                __msg = __msg.replace("\\\\", "\\\\\\\\").replace("\\"", "\\\\\\"");',
            '                if (__msg.length() > 200) __msg = __msg.substring(0, 200);',
            '                __results.add("{\\"passed\\":false,\\"hidden\\":" + ' + hidden + ' + ",\\"ms\\":" + __ms + ",\\"error\\":\\"" + __msg + "\\"}");',
            '            }',
            '        }'
        ].join('\n');
    }).join('\n');

    // Piston's `java` package runs submissions via Java's single-file
    // source-code launcher (JEP 330: `java Main.java`), which invokes
    // main() on the FIRST top-level class declared in the file — not the
    // `public` one, not one matching the filename. `Main` MUST come first,
    // or Piston fails with "can't find main(String[]) method in class: X"
    // for whichever class happens to be declared first instead. (Confirmed
    // against the real Piston `run` script: `mv $1 $1.java; java $filename`.)
    // Also: only emit TreeNode/TestUtil for problems that actually need
    // them, rather than unconditionally for every problem.
    return [
        'import java.util.*;',
        '',
        'public class Main {',
        MAIN_HELPERS,
        '    public static void main(String[] args) {',
        '        Solution sol = new Solution();',
        '        List<String> __results = new ArrayList<String>();',
        testBlocks,
        '        System.out.println(' + JSON.stringify(RESULT_MARKER) + ');',
        '        System.out.println("[" + String.join(",", __results) + "]");',
        '    }',
        '}',
        '',
        'class Solution {',
        userCode,
        '}',
        '',
        isTree ? HARNESS_PREAMBLE : ''
    ].join('\n');
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

module.exports = { buildDriver, parseDriverOutput, toJavaLiteral, RESULT_MARKER };
